"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DashboardData } from "@/lib/dashboard-types";
import {
  SOURCE_COLORS,
  SOURCE_COLOR_MAP,
  FLOW_AREA_COLORS,
  MAX_ANIMATED_FLOW_LINES_PER_AREA,
  DASHBOARD_SECTION_OPTIONS,
  INTERTIE_RATED_CAPACITY_MW,
  type DashboardSectionId,
} from "@/lib/constants";
import {
  numberFmt,
  decimalFmt,
  manKwFmt,
  normalizeSourceName,
  formatCompactEnergy,
  formatVoltageKv,
  formatJstDateTime,
  toDateStamp,
  toInputDateValue,
  toDisplayDateValue,
  roundTo,
  clamp,
  compareAreaOrder,
  buildTopShareSegments,
} from "@/lib/formatters";
import {
  type NetworkAnimationPath,
  type NetworkOverlayViewport,
  type NetworkFlowChartHostElement,
  DEFAULT_NETWORK_OVERLAY_VIEWPORT,
  INTERTIE_STATION_ENDPOINTS,
  AREA_ANCHORS,
  parseDirection,
  buildStationNodeId,
  buildPowerNodeId,
  buildStationLayout,
  resolvePlantGeoBase,
  isPseudoAreaNodeName,
  isLineLikeNodeName,
  isCompositeFacilityNodeName,
  isVirtualBranchNodeName,
  isConverterStationName,
  buildLinkCurvenessMap,
  buildCurvedLineCoords,
  buildSvgQuadraticPath,
  formatSvgMatrixTransform,
  attachNetworkFlowChartRoamHook,
  readNetworkOverlayViewport,
  areNetworkOverlayViewportsEqual,
  buildAreaBridgeEndpoints,
  clampPointToMapBounds,
  isNetworkPowerPlantSource,
  buildJapanGuideGraphics,
  buildJapanGuideSvgPaths,
  flowMagnitudeColor,
} from "@/lib/geo";
import {
  type BarListItem,
  Panel,
  SummaryCard,
  CompactStatCard,
  DataChip,
  SegmentedBar,
  MiniBarList,
  ReserveRateBadge,
  ValueProgressBar,
  SupplyDemandMeter,
  NetFlowMeter,
  CompositionLegendList,
  LoadingOverlay,
} from "@/components/ui/dashboard-ui";
import { ChartErrorBoundary } from "@/components/ui/error-boundary";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

/** Wrapper that adds a subtle close button (visible on hover) to a dashboard section. */
function DismissibleSection({
  children,
  sectionId,
  onDismiss,
  className,
}: {
  children: ReactNode;
  sectionId: DashboardSectionId;
  onDismiss: (id: DashboardSectionId) => void;
  className?: string;
}) {
  const label = DASHBOARD_SECTION_OPTIONS.find((s) => s.id === sectionId)?.label ?? "";
  return (
    <div className={`group/dismiss relative ${className ?? ""}`}>
      <button
        type="button"
        aria-label={`${label}を非表示`}
        title={`${label}を非表示`}
        onClick={() => onDismiss(sectionId)}
        className="absolute -top-2 -right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-sm leading-none text-slate-400 opacity-0 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-100 hover:text-slate-600 group-hover/dismiss:opacity-100 dark:border-slate-600 dark:bg-slate-800/90 dark:text-slate-500 dark:hover:border-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-300"
      >
        &times;
      </button>
      {children}
    </div>
  );
}

type DashboardAppProps = {
  initialData: DashboardData;
  availableDates: string[];
};

export function DashboardApp({ initialData, availableDates }: DashboardAppProps) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [selectedDate, setSelectedDate] = useState<string>(initialData.meta.targetDate);
  const [isDateLoading, setIsDateLoading] = useState<boolean>(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(1280);
  const isMobileViewport = viewportWidth < 768;
  const useInlineDonutLegend = viewportWidth >= 1024;
  const fetchedAtLabel = useMemo(() => formatJstDateTime(initialData.meta.fetchedAt), [initialData.meta.fetchedAt]);

  useEffect(() => {
    const updateViewportWidth = (): void => {
      setViewportWidth(window.innerWidth);
    };

    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => {
      window.removeEventListener("resize", updateViewportWidth);
    };
  }, []);

  const selectableDates = useMemo(() => {
    const merged = new Set<string>([...availableDates, initialData.meta.targetDate, data.meta.targetDate]);
    return Array.from(merged).sort((a, b) => toDateStamp(b).localeCompare(toDateStamp(a), "en"));
  }, [availableDates, data.meta.targetDate, initialData.meta.targetDate]);
  const availableDateSet = useMemo(() => new Set<string>(selectableDates), [selectableDates]);
  const earliestAvailableDate = selectableDates.at(-1) ?? data.meta.targetDate;
  const latestAvailableDate = selectableDates[0] ?? data.meta.targetDate;
  const selectedDateIsAvailable = availableDateSet.has(selectedDate);

  useEffect(() => {
    if (!selectedDateIsAvailable || selectedDate === data.meta.targetDate) {
      return;
    }

    let cancelled = false;
    const previousDate = data.meta.targetDate;

    const fetchByDate = async (): Promise<void> => {
      setIsDateLoading(true);
      setDateError(null);

      try {
        const dateStamp = toDateStamp(selectedDate);
        const dataBasePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
        const response = await fetch(`${dataBasePath}/data/normalized/dashboard-${dateStamp}.json`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`data not found for ${selectedDate}`);
        }
        const nextData = (await response.json()) as DashboardData;
        if (cancelled) {
          return;
        }
        setData(nextData);
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }
        setDateError(error instanceof Error ? error.message : "対象日のデータを読み込めませんでした");
        setSelectedDate(previousDate);
      } finally {
        if (!cancelled) {
          setIsDateLoading(false);
        }
      }
    };

    void fetchByDate();
    return () => {
      cancelled = true;
    };
  }, [data.meta.targetDate, selectedDate, selectedDateIsAvailable]);

  const areas = useMemo(() => {
    const set = new Set<string>();
    data.generation.areaTotals.forEach((item) => set.add(item.area));
    data.flows.areaSummaries.forEach((item) => set.add(item.area));
    return ["全エリア", ...Array.from(set).sort(compareAreaOrder)];
  }, [data]);
  const generationAreas = useMemo(
    () => {
      const set = new Set<string>();
      data.generation.areaTotals.forEach((item) => set.add(item.area));
      data.flows.areaSummaries.forEach((item) => set.add(item.area));
      return ["全エリア", ...Array.from(set).sort(compareAreaOrder)];
    },
    [data.generation.areaTotals, data.flows.areaSummaries],
  );

  const [selectedArea, setSelectedArea] = useState<string>("全エリア");
  const [generationTrendArea, setGenerationTrendArea] = useState<string>("全エリア");
  const [sourceDonutArea, setSourceDonutArea] = useState<string>("全エリア");
  const [visibleSectionIds, setVisibleSectionIds] = useState<DashboardSectionId[]>(
    DASHBOARD_SECTION_OPTIONS.map((item) => item.id),
  );
  const networkFlowChartHostRef = useRef<NetworkFlowChartHostElement | null>(null);
  const flowSlotLabels = data.meta.slotLabels.flow ?? [];
  const maxFlowSlotIndex = Math.max(flowSlotLabels.length - 1, 0);
  const [networkFlowSlotIndex, setNetworkFlowSlotIndex] = useState<number>(maxFlowSlotIndex);
  const [networkOverlayViewport, setNetworkOverlayViewport] = useState<NetworkOverlayViewport>(
    DEFAULT_NETWORK_OVERLAY_VIEWPORT,
  );
  const clampedNetworkFlowSlotIndex = clamp(Math.round(networkFlowSlotIndex), 0, maxFlowSlotIndex);
  const selectedFlowSlotLabel = flowSlotLabels[clampedNetworkFlowSlotIndex] ?? "-";
  const selectedFlowDateTimeLabel = `${data.meta.targetDate} ${selectedFlowSlotLabel}`;
  const visibleSectionSet = useMemo(() => new Set<DashboardSectionId>(visibleSectionIds), [visibleSectionIds]);
  const hiddenSections = useMemo(
    () => DASHBOARD_SECTION_OPTIONS.filter((s) => !visibleSectionSet.has(s.id)),
    [visibleSectionSet],
  );
  const removeSection = useCallback((id: DashboardSectionId) => {
    setVisibleSectionIds((cur) => cur.filter((s) => s !== id));
  }, []);
  const restoreSection = useCallback((id: DashboardSectionId) => {
    setVisibleSectionIds((cur) => {
      if (cur.includes(id)) return cur;
      // Insert in the canonical order
      const order = DASHBOARD_SECTION_OPTIONS.map((s) => s.id);
      const next = [...cur, id];
      next.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      return next;
    });
  }, []);
  const showGenerationTrend = visibleSectionSet.has("generation");
  const showSourceComposition = visibleSectionSet.has("composition");
  const syncNetworkOverlayViewport = (chart: unknown): void => {
    const nextViewport = readNetworkOverlayViewport(chart);
    if (!nextViewport) {
      return;
    }
    setNetworkOverlayViewport((currentViewport) =>
      areNetworkOverlayViewportsEqual(currentViewport, nextViewport) ? currentViewport : nextViewport,
    );
  };
  const registerNetworkFlowChart = (chart: unknown): void => {
    attachNetworkFlowChartRoamHook(chart, networkFlowChartHostRef.current);
    syncNetworkOverlayViewport(chart);
  };
  useEffect(() => {
    const chartHost = networkFlowChartHostRef.current;
    return () => {
      if (chartHost) {
        delete chartHost.__occtoDispatchGraphRoam;
      }
    };
  }, []);
  const reserveAreaSeries = useMemo(() => data.reserves?.areaSeries ?? [], [data.reserves?.areaSeries]);
  const reserveAreaMap = useMemo(
    () => new Map(reserveAreaSeries.map((item) => [item.area, item])),
    [reserveAreaSeries],
  );
  const reserveCurrentRows = useMemo(() => {
    const rows = reserveAreaSeries.map((item) => ({
      area: item.area,
      demandMw: item.demandMw[clampedNetworkFlowSlotIndex] ?? 0,
      supplyMw: item.supplyMw[clampedNetworkFlowSlotIndex] ?? 0,
      reserveMw: item.reserveMw[clampedNetworkFlowSlotIndex] ?? 0,
      reserveRate: item.reserveRate[clampedNetworkFlowSlotIndex] ?? 0,
      usageRate: item.usageRate[clampedNetworkFlowSlotIndex] ?? 0,
      blockReserveRate: item.blockReserveRate[clampedNetworkFlowSlotIndex] ?? 0,
    }));
    return rows.sort((a, b) => a.reserveRate - b.reserveRate);
  }, [clampedNetworkFlowSlotIndex, reserveAreaSeries]);
  const reserveTrendOption = useMemo(() => {
    const scopedSeries =
      selectedArea === "全エリア"
        ? reserveAreaSeries
        : reserveAreaSeries.filter((item) => item.area === selectedArea);
    const hasData = scopedSeries.length > 0;

    return {
      tooltip: {
        trigger: "axis",
        valueFormatter: (value: number) => `${decimalFmt.format(value)} %`,
      },
      legend: {
        top: 8,
        type: "scroll",
        textStyle: { color: "#334155" },
      },
      grid: { top: isMobileViewport ? 48 : 60, left: isMobileViewport ? 40 : 52, right: 18, bottom: 34 },
      xAxis: {
        type: "category",
        data: data.meta.slotLabels.generation,
        axisLabel: { interval: 3 },
      },
      yAxis: {
        type: "value",
        name: "予備率(%)",
        nameGap: 10,
        axisLabel: {
          formatter: (value: number) => decimalFmt.format(value),
        },
      },
      graphic: hasData
        ? undefined
        : [
            {
              type: "text",
              left: "center",
              top: "middle",
              style: {
                text: "予備率データが未取得です",
                fill: "#475569",
                font: "14px sans-serif",
              },
              silent: true,
            },
          ],
      series: scopedSeries.map((item) => ({
        name: item.area,
        type: "line",
        smooth: true,
        symbol: "none",
        lineStyle: {
          width: selectedArea === "全エリア" ? 2.1 : 3,
          color: FLOW_AREA_COLORS[item.area] ?? FLOW_AREA_COLORS.default,
        },
        data: item.reserveRate,
      })),
    };
  }, [data.meta.slotLabels.generation, isMobileViewport, reserveAreaSeries, selectedArea]);
  const demandCurrentOption = useMemo(() => {
    const rows = (selectedArea === "全エリア"
      ? reserveCurrentRows
      : reserveCurrentRows.filter((item) => item.area === selectedArea)
    ).sort((a, b) => b.demandMw - a.demandMw);
    const hasData = rows.length > 0;

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: Array<{ data: { row: (typeof rows)[number] } }>) => {
          const row = params[0]?.data?.row;
          if (!row) {
            return "";
          }
          return `${row.area}<br/>表示日時: ${selectedFlowDateTimeLabel}<br/>需要: ${decimalFmt.format(
            row.demandMw,
          )} MW<br/>供給力: ${decimalFmt.format(row.supplyMw)} MW<br/>使用率: ${decimalFmt.format(row.usageRate)}%`;
        },
      },
      grid: { top: 18, left: isMobileViewport ? 56 : 74, right: 18, bottom: 30 },
      xAxis: {
        type: "value",
        name: "MW",
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: rows.map((item) => item.area),
      },
      graphic: hasData
        ? undefined
        : [
            {
              type: "text",
              left: "center",
              top: "middle",
              style: {
                text: "需要データが未取得です",
                fill: "#475569",
                font: "14px sans-serif",
              },
              silent: true,
            },
          ],
      series: [
        {
          type: "bar",
          barWidth: 14,
          data: rows.map((row) => ({
            value: row.demandMw,
            row,
            itemStyle: {
              color: (FLOW_AREA_COLORS[row.area] ?? FLOW_AREA_COLORS.default),
              borderRadius: [0, 6, 6, 0],
            },
          })),
          label: {
            show: true,
            position: "right",
            formatter: (params: { data: { row: (typeof rows)[number] } }) =>
              `${decimalFmt.format(params.data.row.demandMw)} MW`,
            fontSize: 10,
            color: "#334155",
          },
        },
      ],
    };
  }, [isMobileViewport, reserveCurrentRows, selectedArea, selectedFlowDateTimeLabel]);
  const reserveCurrentOption = useMemo(() => {
    const rows = (selectedArea === "全エリア"
      ? reserveCurrentRows
      : reserveCurrentRows.filter((item) => item.area === selectedArea)
    ).sort((a, b) => a.reserveRate - b.reserveRate);
    const hasData = rows.length > 0;

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: Array<{ data: { row: (typeof rows)[number] } }>) => {
          const row = params[0]?.data?.row;
          if (!row) {
            return "";
          }
          return `${row.area}<br/>表示日時: ${selectedFlowDateTimeLabel}<br/>予備力: ${decimalFmt.format(
            row.reserveMw,
          )} MW<br/>予備率: ${decimalFmt.format(row.reserveRate)}%`;
        },
      },
      grid: { top: 18, left: isMobileViewport ? 56 : 74, right: 18, bottom: 30 },
      xAxis: {
        type: "value",
        name: "%",
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: rows.map((item) => item.area),
      },
      graphic: hasData
        ? undefined
        : [
            {
              type: "text",
              left: "center",
              top: "middle",
              style: {
                text: "予備率データが未取得です",
                fill: "#475569",
                font: "14px sans-serif",
              },
              silent: true,
            },
          ],
      series: [
        {
          type: "bar",
          barWidth: 14,
          data: rows.map((row) => ({
            value: row.reserveRate,
            row,
            itemStyle: {
              color: (FLOW_AREA_COLORS[row.area] ?? FLOW_AREA_COLORS.default),
              borderRadius: [0, 6, 6, 0],
            },
          })),
          label: {
            show: true,
            position: "right",
            formatter: (params: { data: { row: (typeof rows)[number] } }) =>
              `${decimalFmt.format(params.data.row.reserveMw)} MW (${decimalFmt.format(params.data.row.reserveRate)}%)`,
            fontSize: 10,
            color: "#334155",
          },
        },
      ],
    };
  }, [isMobileViewport, reserveCurrentRows, selectedArea, selectedFlowDateTimeLabel]);

  const sourceTotalsByArea = useMemo(() => {
    const byArea: Record<string, Array<{ source: string; totalKwh: number }>> = {};
    const areaSeries = data.generation.hourlyBySourceByArea ?? {};

    for (const [area, points] of Object.entries(areaSeries)) {
      const totals = new Map<string, number>();
      points.forEach((point) => {
        Object.entries(point.values).forEach(([source, value]) => {
          totals.set(source, (totals.get(source) ?? 0) + value);
        });
      });
      byArea[area] = Array.from(totals.entries())
        .map(([source, totalKwh]) => ({ source, totalKwh }))
        .sort((a, b) => b.totalKwh - a.totalKwh);
    }

    return byArea;
  }, [data.generation.hourlyBySourceByArea]);
  const sourceColorByName = useMemo(
    () =>
      new Map(
        data.generation.sourceTotals.map((item, idx) => [
          item.source,
          SOURCE_COLOR_MAP[item.source] ?? SOURCE_COLORS[idx % SOURCE_COLORS.length],
        ]),
      ),
    [data.generation.sourceTotals],
  );

  const filteredTopUnits = useMemo(
    () =>
      [...data.generation.topUnits]
        .filter((unit) => (selectedArea === "全エリア" ? true : unit.area === selectedArea))
        .sort((a, b) => b.dailyKwh - a.dailyKwh),
    [data.generation.topUnits, selectedArea],
  );

  const allPlantSummaries = useMemo(() => {
    if (data.generation.plantSummaries && data.generation.plantSummaries.length > 0) {
      return [...data.generation.plantSummaries].sort((a, b) => b.dailyKwh - a.dailyKwh);
    }

    const fallback = new Map<
      string,
      {
        area: string;
        plantName: string;
        sourceType: string;
        dailyKwh: number;
        maxOutputManKw: number;
        summedUnitMaxOutputManKw: number;
      }
    >();
    data.generation.topUnits.forEach((unit) => {
      const key = `${unit.area}::${unit.plantName}`;
      const current = fallback.get(key) ?? {
        area: unit.area,
        plantName: unit.plantName,
        sourceType: unit.sourceType,
        dailyKwh: 0,
        maxOutputManKw: 0,
        summedUnitMaxOutputManKw: 0,
      };
      current.dailyKwh += unit.dailyKwh;
      current.summedUnitMaxOutputManKw += unit.maxOutputManKw ?? 0;
      current.maxOutputManKw = current.summedUnitMaxOutputManKw;
      if (!current.sourceType && unit.sourceType) {
        current.sourceType = unit.sourceType;
      }
      fallback.set(key, current);
    });

    return Array.from(fallback.values()).sort((a, b) => b.dailyKwh - a.dailyKwh);
  }, [data.generation.plantSummaries, data.generation.topUnits]);

  const filteredTopPlants = useMemo(
    () =>
      allPlantSummaries.filter((plant) =>
        selectedArea === "全エリア" ? true : plant.area === selectedArea,
      ),
    [allPlantSummaries, selectedArea],
  );

  const networkPowerPlants = useMemo(() => {
    if (allPlantSummaries.length > 0) {
      return allPlantSummaries
        .filter((plant) => isNetworkPowerPlantSource(plant.sourceType))
        .map((plant) => ({
          area: plant.area,
          plantName: plant.plantName,
          sourceType: plant.sourceType,
          dailyKwh: plant.dailyKwh,
          avgOutputMw: plant.dailyKwh / 24 / 1000,
          maxOutputManKw: plant.maxOutputManKw,
        }));
    }
    return [];
  }, [allPlantSummaries]);

  const filteredLines = useMemo(
    () =>
      data.flows.lineSeries.filter((line) =>
        selectedArea === "全エリア" ? true : line.area === selectedArea,
      ),
    [data.flows.lineSeries, selectedArea],
  );

  const generationLineOption = useMemo(() => {
    const scopedSeries =
      generationTrendArea === "全エリア"
        ? data.generation.hourlyBySource
        : (data.generation.hourlyBySourceByArea?.[generationTrendArea] ?? []);
    const fallbackKeys = Object.keys(data.generation.hourlyBySource[0]?.values ?? {});
    const sourceKeys = Object.keys(scopedSeries[0]?.values ?? {}).length
      ? Object.keys(scopedSeries[0]?.values ?? {})
      : fallbackKeys;

    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      legend: {
        type: "scroll",
        top: 8,
        textStyle: { color: "#264653" },
        formatter: (name: string) => normalizeSourceName(name),
      },
      grid: { top: isMobileViewport ? 40 : 48, left: isMobileViewport ? 36 : 48, right: isMobileViewport ? 10 : 20, bottom: 36 },
      xAxis: {
        type: "category",
        data: data.meta.slotLabels.generation,
        axisLabel: { color: "#4a5568", interval: 3 },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#4a5568", formatter: (v: number) => numberFmt.format(v) },
      },
      graphic:
        sourceKeys.length > 0
          ? undefined
          : [
              {
                type: "text",
                left: "center",
                top: "middle",
                style: {
                  text: "このエリアの発電方式別データはありません",
                  fill: "#475569",
                  font: "14px sans-serif",
                },
                silent: true,
              },
            ],
      series: sourceKeys.map((source, idx) => ({
        name: normalizeSourceName(source),
        type: "line",
        stack: "generation",
        smooth: true,
        areaStyle: { opacity: 0.12 },
        symbol: "none",
        lineStyle: { width: 2 },
        color: sourceColorByName.get(source) ?? SOURCE_COLOR_MAP[source] ?? SOURCE_COLORS[idx % SOURCE_COLORS.length],
        data: scopedSeries.map((point) => point.values[source] ?? 0),
      })),
    };
  }, [data.generation.hourlyBySource, data.generation.hourlyBySourceByArea, data.meta.slotLabels.generation, generationTrendArea, isMobileViewport, sourceColorByName]);

  const sourceCompositionItems = useMemo(() => {
    const rows =
      sourceDonutArea === "全エリア"
        ? data.generation.sourceTotals
        : (sourceTotalsByArea[sourceDonutArea] ?? []);
    const totalKwh = rows.reduce((sum, item) => sum + item.totalKwh, 0);
    return rows.map((item, idx) => ({
      name: normalizeSourceName(item.source),
      totalKwh: item.totalKwh,
      percent: totalKwh > 0 ? (item.totalKwh / totalKwh) * 100 : 0,
      color: sourceColorByName.get(item.source) ?? SOURCE_COLORS[idx % SOURCE_COLORS.length],
    }));
  }, [data.generation.sourceTotals, sourceColorByName, sourceDonutArea, sourceTotalsByArea]);

  const sourceDonutOption = useMemo(() => {
    return {
      tooltip: { trigger: "item" },
      series: [
        {
          name: "発電方式",
          type: "pie",
          radius: useInlineDonutLegend ? ["44%", "74%"] : ["38%", "60%"],
          center: useInlineDonutLegend ? ["50%", "50%"] : ["50%", "42%"],
          avoidLabelOverlap: true,
          label: {
            show: false,
            color: "#1b3a4b",
            fontSize: useInlineDonutLegend ? 12 : 11,
          },
          labelLine: {
            show: false,
          },
          emphasis: {
            scale: true,
            label: {
              show: true,
              formatter: (params: { percent?: number; name: string }) =>
                `${normalizeSourceName(params.name)}\n${decimalFmt.format(params.percent ?? 0)}%`,
              fontSize: 13,
              fontWeight: 600,
            },
          },
          data: sourceCompositionItems.map((item) => ({
            name: item.name,
            value: item.totalKwh,
            itemStyle: { color: item.color },
          })),
        },
      ],
    };
  }, [sourceCompositionItems, useInlineDonutLegend]);

  const areaTotalsOption = useMemo(
    () => {
      const sortedAreaTotals = [...data.generation.areaTotals].sort((a, b) => b.totalKwh - a.totalKwh);
      return {
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
        grid: { top: 18, left: isMobileViewport ? 56 : 74, right: 18, bottom: 30 },
        xAxis: {
          type: "value",
          axisLabel: { formatter: (v: number) => `${Math.round(v / 1_000_000)}M` },
        },
        yAxis: {
          type: "category",
          inverse: true,
          data: sortedAreaTotals.map((item) => item.area),
          axisLabel: { color: "#4a5568" },
        },
        series: [
          {
            type: "bar",
            data: sortedAreaTotals.map((item, idx) => ({
              value: item.totalKwh,
              itemStyle: {
                color: idx % 2 === 0 ? "#2a9d8f" : "#1d3557",
                borderRadius: [0, 6, 6, 0],
              },
            })),
          },
        ],
      };
    },
    [data.generation.areaTotals, isMobileViewport],
  );

  const flowHeatmapOption = useMemo(() => {
    const topLines = filteredLines.slice(0, 18);
    const yLabels = topLines.map((line) =>
      isMobileViewport ? line.lineName.slice(0, 6) : `${line.area} | ${line.lineName}`,
    );
    const heatmapData: Array<[number, number, number]> = [];

    topLines.forEach((line, rowIdx) => {
      line.values.forEach((value, colIdx) => {
        heatmapData.push([colIdx, rowIdx, Math.round(value)]);
      });
    });

    return {
      tooltip: {
        position: "top",
        formatter: (params: { data: [number, number, number] }) => {
          const [col, row, value] = params.data;
          return `${yLabels[row]}<br/>${data.meta.slotLabels.flow[col]}: ${numberFmt.format(value)} MW`;
        },
      },
      grid: { top: 20, left: isMobileViewport ? 60 : 160, right: isMobileViewport ? 10 : 80, bottom: isMobileViewport ? 46 : 20 },
      xAxis: {
        type: "category",
        data: data.meta.slotLabels.flow,
        splitArea: { show: true },
        axisLabel: { interval: 3 },
      },
      yAxis: {
        type: "category",
        data: yLabels,
        splitArea: { show: true },
      },
      visualMap: isMobileViewport
        ? {
            min: -800,
            max: 800,
            calculable: false,
            orient: "horizontal",
            left: "center",
            bottom: 0,
            itemWidth: 12,
            itemHeight: 80,
            inRange: {
              color: ["#0b132b", "#1c2541", "#4f772d", "#f77f00", "#d62828"],
            },
          }
        : {
            min: -800,
            max: 800,
            calculable: true,
            orient: "vertical",
            right: 0,
            top: 0,
            inRange: {
              color: ["#0b132b", "#1c2541", "#4f772d", "#f77f00", "#d62828"],
            },
          },
      series: [
        {
          name: "潮流",
          type: "heatmap",
          data: heatmapData,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: "rgba(0, 0, 0, 0.35)",
            },
          },
        },
      ],
    };
  }, [data.meta.slotLabels.flow, filteredLines, isMobileViewport]);

  const volatilityHeatmapOption = useMemo(() => {
    // Compute coefficient of variation for each line and pick top 18
    const scored = filteredLines
      .map((line) => {
        const vals = line.values;
        const n = vals.length;
        if (n === 0) return null;
        const meanAbs = vals.reduce((s, v) => s + Math.abs(v), 0) / n;
        if (meanAbs < 1) return null; // skip near-zero lines
        const mean = vals.reduce((s, v) => s + v, 0) / n;
        const stdDev = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
        const cv = stdDev / meanAbs; // coefficient of variation
        return { ...line, cv, mean, stdDev, meanAbs };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.cv - a.cv)
      .slice(0, 18);

    const yLabels = scored.map((l) =>
      isMobileViewport
        ? `${l.lineName.slice(0, 6)} CV${(l.cv * 100).toFixed(0)}%`
        : `${l.area} | ${l.lineName}  (CV ${(l.cv * 100).toFixed(0)}%)`,
    );

    // Each cell = deviation from that line's mean, as % of meanAbs
    const heatmapData: Array<[number, number, number]> = [];
    scored.forEach((line, rowIdx) => {
      line.values.forEach((value, colIdx) => {
        const pctDev = ((value - line.mean) / line.meanAbs) * 100;
        heatmapData.push([colIdx, rowIdx, Math.round(pctDev)]);
      });
    });

    return {
      tooltip: {
        position: "top",
        formatter: (params: { data: [number, number, number] }) => {
          const [col, row, pct] = params.data;
          const line = scored[row];
          const rawMw = line ? Math.round(line.values[col]) : 0;
          return [
            `<b>${yLabels[row]}</b>`,
            `${data.meta.slotLabels.flow[col]}`,
            `潮流: ${numberFmt.format(rawMw)} MW`,
            `平均比偏差: ${pct > 0 ? "+" : ""}${pct}%`,
          ].join("<br/>");
        },
      },
      grid: { top: 20, left: isMobileViewport ? 60 : 220, right: isMobileViewport ? 10 : 80, bottom: isMobileViewport ? 46 : 20 },
      xAxis: {
        type: "category",
        data: data.meta.slotLabels.flow,
        splitArea: { show: true },
        axisLabel: { interval: 3 },
      },
      yAxis: {
        type: "category",
        data: yLabels,
        splitArea: { show: true },
        axisLabel: { fontSize: 11 },
      },
      visualMap: isMobileViewport
        ? {
            min: -150,
            max: 150,
            calculable: false,
            orient: "horizontal",
            left: "center",
            bottom: 0,
            itemWidth: 12,
            itemHeight: 80,
            text: ["+150%", "−150%"],
            inRange: {
              color: ["#1d4877", "#4a7fb5", "#98d1d1", "#fcfcfc", "#f4a261", "#e76f51", "#9b2226"],
            },
          }
        : {
            min: -150,
            max: 150,
            calculable: true,
            orient: "vertical",
            right: 0,
            top: 0,
            text: ["+150%", "−150%"],
            inRange: {
              color: ["#1d4877", "#4a7fb5", "#98d1d1", "#fcfcfc", "#f4a261", "#e76f51", "#9b2226"],
            },
          },
      series: [
        {
          name: "変動率",
          type: "heatmap",
          data: heatmapData,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: "rgba(0, 0, 0, 0.35)",
            },
          },
        },
      ],
    };
  }, [data.meta.slotLabels.flow, filteredLines, isMobileViewport]);

  const flowNetworkOption = useMemo(() => {
    type NetworkLink = {
      kind: "intra";
      source: string;
      target: string;
      value: number;
      absAvgMw: number;
      area?: string;
      lineName?: string;
      voltageKv?: string;
      positiveDirection?: string;
      peakAbsMw?: number;
    };

    const areaScope = new Set<string>();
    data.flows.lineSeries.forEach((line) => areaScope.add(line.area));
    if (areaScope.size === 0) {
      data.flows.areaSummaries.forEach((row) => areaScope.add(row.area));
    }

    const networkLines = data.flows.lineSeries;

    const visibleAreas = new Set<string>();
    const stationsByArea = new Map<string, Set<string>>();
    const nodeDegree = new Map<string, number>();
    const links: NetworkLink[] = [];
    const intertieFacilityMap = new Map<
      string,
      {
        sourceNodeId: string;
        targetNodeId: string;
        sourceArea: string;
        targetArea: string;
        absMw: number;
        peakAbsMw: number;
        intertieNames: Set<string>;
        currentType: "ac" | "dc";
      }
    >();
    const intertieBridgeMap = new Map<
      string,
      {
        sourceArea: string;
        targetArea: string;
        value: number;
        absMw: number;
        peakAbsMw: number;
        intertieNames: Set<string>;
      }
    >();

    networkLines.forEach((line) => {
      const direction = parseDirection(line.positiveDirection);
      if (!direction) {
        return;
      }
      visibleAreas.add(line.area);
      const slotMw = line.values[clampedNetworkFlowSlotIndex] ?? line.avgMw ?? 0;

      const sourceName = slotMw >= 0 ? direction.source : direction.target;
      const targetName = slotMw >= 0 ? direction.target : direction.source;
      if (
        isPseudoAreaNodeName(sourceName) ||
        isPseudoAreaNodeName(targetName) ||
        isLineLikeNodeName(sourceName) ||
        isLineLikeNodeName(targetName) ||
        isVirtualBranchNodeName(sourceName) ||
        isVirtualBranchNodeName(targetName) ||
        isCompositeFacilityNodeName(sourceName) ||
        isCompositeFacilityNodeName(targetName)
      ) {
        return;
      }
      const source = buildStationNodeId(line.area, sourceName);
      const target = buildStationNodeId(line.area, targetName);

      const stationSet = stationsByArea.get(line.area) ?? new Set<string>();
      stationSet.add(sourceName);
      stationSet.add(targetName);
      stationsByArea.set(line.area, stationSet);

      nodeDegree.set(source, (nodeDegree.get(source) ?? 0) + 1);
      nodeDegree.set(target, (nodeDegree.get(target) ?? 0) + 1);

      links.push({
        kind: "intra",
        source,
        target,
        value: slotMw,
        absAvgMw: Math.abs(slotMw),
        area: line.area,
        lineName: line.lineName,
        voltageKv: line.voltageKv,
        positiveDirection: line.positiveDirection,
        peakAbsMw: line.peakAbsMw,
      });
    });

    (data.flows.intertieSeries ?? []).forEach((row) => {
      visibleAreas.add(row.sourceArea);
      visibleAreas.add(row.targetArea);
      const slotMw = row.values[clampedNetworkFlowSlotIndex] ?? row.avgMw ?? 0;
      const explicitEndpoints = INTERTIE_STATION_ENDPOINTS[row.intertieName];
      if (explicitEndpoints) {
        const flowSourceArea = slotMw >= 0 ? explicitEndpoints.sourceArea : explicitEndpoints.targetArea;
        const flowSourceStation = slotMw >= 0 ? explicitEndpoints.sourceStation : explicitEndpoints.targetStation;
        const flowTargetArea = slotMw >= 0 ? explicitEndpoints.targetArea : explicitEndpoints.sourceArea;
        const flowTargetStation = slotMw >= 0 ? explicitEndpoints.targetStation : explicitEndpoints.sourceStation;
        const sourceNodeId = buildStationNodeId(flowSourceArea, flowSourceStation);
        const targetNodeId = buildStationNodeId(flowTargetArea, flowTargetStation);

        const sourceStationSet = stationsByArea.get(flowSourceArea) ?? new Set<string>();
        sourceStationSet.add(flowSourceStation);
        stationsByArea.set(flowSourceArea, sourceStationSet);

        const targetStationSet = stationsByArea.get(flowTargetArea) ?? new Set<string>();
        targetStationSet.add(flowTargetStation);
        stationsByArea.set(flowTargetArea, targetStationSet);

        nodeDegree.set(sourceNodeId, (nodeDegree.get(sourceNodeId) ?? 0) + 1);
        nodeDegree.set(targetNodeId, (nodeDegree.get(targetNodeId) ?? 0) + 1);

        const key = `${sourceNodeId}=>${targetNodeId}`;
        const current = intertieFacilityMap.get(key) ?? {
          sourceNodeId,
          targetNodeId,
          sourceArea: flowSourceArea,
          targetArea: flowTargetArea,
          absMw: 0,
          peakAbsMw: 0,
          intertieNames: new Set<string>(),
          currentType: explicitEndpoints.currentType,
        };
        current.absMw += Math.abs(slotMw);
        current.peakAbsMw = Math.max(current.peakAbsMw, row.peakAbsMw ?? 0);
        current.intertieNames.add(row.intertieName);
        intertieFacilityMap.set(key, current);
        return;
      }

      const sourceArea = slotMw >= 0 ? row.sourceArea : row.targetArea;
      const targetArea = slotMw >= 0 ? row.targetArea : row.sourceArea;
      const key = `${sourceArea}=>${targetArea}`;
      const current = intertieBridgeMap.get(key) ?? {
        sourceArea,
        targetArea,
        value: 0,
        absMw: 0,
        peakAbsMw: 0,
        intertieNames: new Set<string>(),
      };
      current.value += Math.abs(slotMw);
      current.absMw += Math.abs(slotMw);
      current.peakAbsMw = Math.max(current.peakAbsMw, row.peakAbsMw ?? 0);
      current.intertieNames.add(row.intertieName);
      intertieBridgeMap.set(key, current);
    });

    const stationPositions = buildStationLayout(stationsByArea);

    if (visibleAreas.size === 0) {
      data.flows.areaSummaries.forEach((row) => visibleAreas.add(row.area));
    }

    const areaCategories = Array.from(visibleAreas).sort(compareAreaOrder);
    const categoryIndex = new Map(areaCategories.map((area, index) => [area, index]));
    const stationLabelIds = new Set(
      Array.from(nodeDegree.entries())
        .filter(([nodeId, degree]) => nodeId.startsWith("station::") && degree >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 70)
        .map(([nodeId]) => nodeId),
    );

    const nodes: Array<Record<string, unknown>> = [];
    const stationNodeIdsByArea = new Map<string, string[]>();
    stationsByArea.forEach((stationSet, area) => {
      Array.from(stationSet)
        .sort((a, b) => a.localeCompare(b, "ja-JP"))
        .forEach((station) => {
          const stationNodeId = buildStationNodeId(area, station);
          const degree = nodeDegree.get(stationNodeId) ?? 0;
          const anchor = AREA_ANCHORS[area] ?? AREA_ANCHORS.default;
          const position = stationPositions.get(stationNodeId) ?? anchor;
          nodes.push({
            id: stationNodeId,
            name: station,
            area,
            category: categoryIndex.get(area) ?? 0,
            value: degree,
            nodeType: isConverterStationName(station) ? "converter" : "ss",
            shouldLabel: stationLabelIds.has(stationNodeId),
            x: position.x,
            y: position.y,
            symbolSize: isConverterStationName(station) ? 8 : 6,
            symbol: isConverterStationName(station) ? "diamond" : "circle",
            itemStyle: {
              color: isConverterStationName(station)
                ? "#0f766e"
                : (FLOW_AREA_COLORS[area] ?? FLOW_AREA_COLORS.default),
              borderColor: "#ffffff",
              borderWidth: 1,
            },
          });
          const ids = stationNodeIdsByArea.get(area) ?? [];
          ids.push(stationNodeId);
          stationNodeIdsByArea.set(area, ids);
        });
    });

    const scopedPowerPlants = networkPowerPlants
      .filter((plant) => areaScope.has(plant.area))
      .sort((a, b) => b.dailyKwh - a.dailyKwh);
    const maxPlantDaily = Math.max(...scopedPowerPlants.map((item) => item.dailyKwh), 1);

    scopedPowerPlants.forEach((plant) => {
      const base =
        resolvePlantGeoBase(plant.area, plant.plantName) ?? clampPointToMapBounds(AREA_ANCHORS[plant.area] ?? AREA_ANCHORS.default);
      const ratio = plant.dailyKwh / maxPlantDaily;
      const powerNodeId = buildPowerNodeId(plant.area, plant.plantName);
      nodes.push({
        id: powerNodeId,
        name: plant.plantName,
        area: plant.area,
        category: categoryIndex.get(plant.area) ?? 0,
        value: roundTo(plant.avgOutputMw, 1),
        nodeType: "power",
        sourceType: plant.sourceType,
        dailyKwh: plant.dailyKwh,
        maxOutputManKw: roundTo(plant.maxOutputManKw, 2),
        shouldLabel: ratio >= 0.5,
        x: base.x,
        y: base.y,
        symbol: "rect",
        symbolSize: 4.2 + ratio * 7.4,
        itemStyle: {
          color: FLOW_AREA_COLORS[plant.area] ?? FLOW_AREA_COLORS.default,
          borderColor: "#ffffff",
          borderWidth: 1,
          shadowBlur: 4,
          shadowColor: "rgba(15,23,42,0.16)",
        },
      });
    });

    const maxAbsIntra = Math.max(
      ...links.filter((line) => line.kind === "intra").map((line) => line.absAvgMw),
      1,
    );

    const linkCurveness = buildLinkCurvenessMap(links, stationPositions);

    const renderedLinks = links.map((line) => {
      const ratio = line.absAvgMw / maxAbsIntra;
      const curveness = linkCurveness.get(`${line.source}=>${line.target}`) ?? 0.04;
      return {
        ...line,
        lineStyle: {
          width: 0.7 + ratio * 2.8,
          opacity: 0.58,
          curveness,
          color: line.value >= 0 ? "rgba(249,115,22,0.9)" : "rgba(30,64,175,0.9)",
        },
        z: 2,
      };
    });

    const maxAbsIntertie = Math.max(...Array.from(intertieBridgeMap.values()).map((item) => item.absMw), 1);
    const intertieBridgeLines = Array.from(intertieBridgeMap.values())
      .map((bridge) => {
        const endpoints = buildAreaBridgeEndpoints(bridge.sourceArea, bridge.targetArea);
        if (!endpoints) {
          return null;
        }
        const ratio = bridge.absMw / maxAbsIntertie;
        const bridgeLabelText = `${Array.from(bridge.intertieNames).join("/")} ${decimalFmt.format(bridge.absMw)} MW`;
        return {
          ...bridge,
          name: bridgeLabelText,
          coords: buildCurvedLineCoords(endpoints.from, endpoints.to, endpoints.curveness),
          lineStyle: {
            width: 1.2 + ratio * 3.2,
            opacity: 0.46,
            color: bridge.value >= 0 ? "rgba(234,88,12,0.55)" : "rgba(37,99,235,0.55)",
            type: "solid",
          },
          label: {
            show: true,
            formatter: bridgeLabelText,
            position: "middle" as const,
            fontSize: 9,
            color: "#334155",
            backgroundColor: "rgba(255,255,255,0.82)",
            borderRadius: 3,
            padding: [1, 4] as [number, number],
          },
        };
      })
      .filter((item) => item !== null);

    const nodePointById = new Map<string, { x: number; y: number }>();
    nodes.forEach((node) => {
      const id = String(node.id ?? "");
      const x = Number(node.x);
      const y = Number(node.y);
      if (id && Number.isFinite(x) && Number.isFinite(y)) {
        nodePointById.set(id, { x, y });
      }
    });
    const animatedFlowLines = Array.from(
      renderedLinks.reduce((lineGroups, line) => {
        const area = line.area ?? "不明";
        const group = lineGroups.get(area) ?? [];
        group.push(line);
        lineGroups.set(area, group);
        return lineGroups;
      }, new Map<string, typeof renderedLinks>()),
    )
      .sort(([leftArea], [rightArea]) => compareAreaOrder(leftArea, rightArea))
      .flatMap(([, linesByArea]) =>
        linesByArea
          .sort((a, b) => b.absAvgMw - a.absAvgMw)
          .slice(0, MAX_ANIMATED_FLOW_LINES_PER_AREA),
      )
      .map((line) => {
        const from = nodePointById.get(String(line.source));
        const to = nodePointById.get(String(line.target));
        if (!from || !to) {
          return null;
        }
        return {
          coords: buildCurvedLineCoords(from, to, line.lineStyle.curveness),
          absAvgMw: line.absAvgMw,
          lineStyle: {
            color: "rgba(125,211,252,0.42)",
            width: Math.max(0.9, line.lineStyle.width * 0.45),
            opacity: 0.34,
          },
        };
      })
      .filter((item) => item !== null);
    const maxAnimatedFlowMw = Math.max(...animatedFlowLines.map((line) => line.absAvgMw), 1);
    const majorFlowAnimationPaths: NetworkAnimationPath[] = animatedFlowLines.map((line, index) => ({
      id: `major-flow-${index}`,
      d: buildSvgQuadraticPath(line.coords),
      strokeWidth: Math.max(1.3, line.lineStyle.width + 0.2),
      durationSeconds: roundTo(1.7 + (index % 4) * 0.18, 2),
      delaySeconds: roundTo((index % 5) * 0.12, 2),
      magnitude: clamp(line.absAvgMw / maxAnimatedFlowMw, 0, 1),
    }));
    const maxAbsIntertieFacility = Math.max(...Array.from(intertieFacilityMap.values()).map((item) => item.absMw), 1);
    const intertieFacilityLines = Array.from(intertieFacilityMap.values())
      .map((line) => {
        const from = nodePointById.get(line.sourceNodeId);
        const to = nodePointById.get(line.targetNodeId);
        if (!from || !to) {
          return null;
        }
        const ratio = line.absMw / maxAbsIntertieFacility;
        const strokeColor =
          line.currentType === "dc" ? "rgba(192,38,211,0.82)" : "rgba(234,88,12,0.74)";
        const labelText = `${Array.from(line.intertieNames).join("/")} ${decimalFmt.format(line.absMw)} MW`;
        return {
          ...line,
          name: labelText,
          coords: buildCurvedLineCoords(from, to, line.currentType === "dc" ? 0.08 : 0.05),
          lineStyle: {
            width: 1.5 + ratio * 3.2,
            opacity: 0.72,
            color: strokeColor,
            type: line.currentType === "dc" ? "dashed" : "solid",
          },
          label: {
            show: true,
            formatter: labelText,
            position: "middle" as const,
            fontSize: 9,
            color: "#334155",
            backgroundColor: "rgba(255,255,255,0.82)",
            borderRadius: 3,
            padding: [1, 4] as [number, number],
          },
        };
      })
      .filter((item) => item !== null);

    // Build inter-area animation paths for SVG overlay
    const maxAbsIntertieForAnim = Math.max(
      ...intertieFacilityLines.map((line) => line.absMw),
      ...intertieBridgeLines.map((line) => line.absMw),
      1,
    );
    // Compute congestion percentage for a set of intertie names
    const computeIntertieCongestionPct = (names: Set<string>, absMw: number): number | undefined => {
      let totalCapacity = 0;
      let matched = false;
      for (const name of names) {
        const cap = INTERTIE_RATED_CAPACITY_MW[name];
        if (cap) {
          totalCapacity += cap.capacityMw;
          matched = true;
        }
      }
      return matched && totalCapacity > 0 ? roundTo((absMw / totalCapacity) * 100, 1) : undefined;
    };

    const intertieAnimationPaths: NetworkAnimationPath[] = [
      ...intertieFacilityLines.map((line, index) => ({
        id: `intertie-facility-${index}`,
        d: buildSvgQuadraticPath(line.coords),
        strokeWidth: Math.max(2.6, line.lineStyle.width + 0.5),
        durationSeconds: roundTo(2.2 + (index % 3) * 0.22, 2),
        delaySeconds: roundTo((index % 4) * 0.15, 2),
        magnitude: clamp(line.absMw / maxAbsIntertieForAnim, 0, 1),
        kind: "intertie" as const,
        currentType: line.currentType,
        label: `${Array.from(line.intertieNames).join("/")} ${decimalFmt.format(line.absMw)}MW`,
        congestionPct: computeIntertieCongestionPct(line.intertieNames, line.absMw),
      })),
      ...intertieBridgeLines.map((line, index) => ({
        id: `intertie-bridge-${index}`,
        d: buildSvgQuadraticPath(line.coords),
        strokeWidth: Math.max(2.4, (line.lineStyle?.width ?? 2) + 0.4),
        durationSeconds: roundTo(2.4 + (index % 3) * 0.2, 2),
        delaySeconds: roundTo((index % 4) * 0.18, 2),
        magnitude: clamp(line.absMw / maxAbsIntertieForAnim, 0, 1),
        kind: "intertie" as const,
        currentType: undefined,
        label: `${Array.from(line.intertieNames).join("/")} ${decimalFmt.format(line.absMw)}MW`,
        congestionPct: computeIntertieCongestionPct(line.intertieNames, line.absMw),
      })),
    ];

    return {
      animationDurationUpdate: 360,
      __majorFlowAnimationPaths: majorFlowAnimationPaths,
      __intertieAnimationPaths: intertieAnimationPaths,
      tooltip: {
        trigger: "item",
        confine: true,
        formatter: (params: {
          dataType: "node" | "edge";
          name: string;
          data: {
            kind?: "intra";
            value: number;
            area?: string;
            lineName?: string;
            voltageKv?: string;
            positiveDirection?: string;
            peakAbsMw?: number;
            nodeType?: "ss" | "power" | "converter";
            sourceType?: string;
            dailyKwh?: number;
            maxOutputManKw?: number;
          };
        }) => {
          if (params.dataType === "edge") {
            const voltageText = formatVoltageKv(params.data.voltageKv);
            return `${params.data.area} | ${params.data.lineName}<br/>区分: 地域内送電線<br/>定義方向: ${
              params.data.positiveDirection
            }<br/>表示時刻: ${selectedFlowDateTimeLabel}<br/>潮流: ${decimalFmt.format(params.data.value)} MW<br/>最大|潮流|: ${numberFmt.format(
              params.data.peakAbsMw ?? 0,
            )} MW${voltageText ? `<br/>電圧: ${voltageText}` : ""}`;
          }
          if (params.data.nodeType === "power") {
            return `${params.data.area} | ${params.name}<br/>区分: 電源<br/>平均出力: ${decimalFmt.format(
              params.data.value,
            )} MW<br/>方式: ${params.data.sourceType ?? "不明"}<br/>最大出力: ${decimalFmt.format(
              params.data.maxOutputManKw ?? 0,
            )} 万kW<br/>日量: ${numberFmt.format(
              Math.round(params.data.dailyKwh ?? 0),
            )} kWh`;
          }
          if (params.data.nodeType === "converter") {
            return `${params.data.area} | ${params.name}<br/>区分: 変換所<br/>接続本数: ${numberFmt.format(
              params.data.value,
            )} 本`;
          }
          return `${params.data.area ?? "不明"} | ${params.name}<br/>接続本数: ${numberFmt.format(
            params.data.value,
          )} 本`;
        },
      },
      legend: [
        {
          type: "scroll",
          top: 10,
          data: areaCategories,
          textStyle: { color: "#334155" },
        },
      ],
      series: [
        {
          type: "lines",
          coordinateSystem: "none",
          polyline: true,
          silent: false,
          z: 3,
          data: intertieFacilityLines,
          tooltip: {
            formatter: (params: {
              data: {
                sourceArea: string;
                targetArea: string;
                absMw: number;
                peakAbsMw: number;
                intertieNames: Set<string>;
                currentType: "ac" | "dc";
              };
            }) =>
              `${params.data.sourceArea} → ${params.data.targetArea}<br/>区分: ${
                params.data.currentType === "dc" ? "直流連係線" : "連係線"
              }<br/>表示時刻: ${selectedFlowDateTimeLabel}<br/>潮流: ${decimalFmt.format(
                params.data.absMw,
              )} MW<br/>最大|潮流|: ${numberFmt.format(params.data.peakAbsMw)} MW<br/>連係線: ${Array.from(
                params.data.intertieNames,
              ).join(" / ")}`,
          },
          lineStyle: {
            opacity: 0.7,
          },
        },
        {
          type: "lines",
          coordinateSystem: "none",
          polyline: true,
          silent: false,
          z: 1,
          data: intertieBridgeLines,
          tooltip: {
            formatter: (params: {
              data: {
                sourceArea: string;
                targetArea: string;
                absMw: number;
                peakAbsMw: number;
                intertieNames: Set<string>;
              };
            }) =>
              `${params.data.sourceArea} → ${params.data.targetArea}<br/>区分: 連係線（エリア橋）<br/>表示時刻: ${selectedFlowDateTimeLabel}<br/>潮流: ${decimalFmt.format(
                params.data.absMw,
              )} MW<br/>最大|潮流|: ${numberFmt.format(params.data.peakAbsMw)} MW<br/>連係線: ${Array.from(
                params.data.intertieNames,
              ).join(" / ")}`,
          },
          lineStyle: {
            opacity: 0.42,
          },
        },
        {
          type: "graph",
          layout: "none",
          roam: true,
          draggable: false,
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          data: nodes,
          links: renderedLinks,
          categories: areaCategories.map((name) => ({
            name,
            itemStyle: { color: FLOW_AREA_COLORS[name] ?? FLOW_AREA_COLORS.default },
          })),
          lineStyle: {
            opacity: 0.72,
          },
          label: {
            show: true,
            formatter: (params: {
              data: { nodeType?: "ss" | "power" | "converter"; shouldLabel?: boolean; value?: number };
              name: string;
            }) => {
              if (params.data.shouldLabel) {
                return params.name;
              }
              return "";
            },
            position: "right",
            color: "#1f2937",
            fontSize: 10,
            backgroundColor: "rgba(255,255,255,0.72)",
            borderRadius: 4,
            padding: [1, 3],
          },
          labelLayout: {
            hideOverlap: true,
          },
          emphasis: {
            focus: "adjacency",
            label: {
              show: true,
            },
            lineStyle: {
              opacity: 0.95,
            },
          },
        },
      ],
    };
  }, [
    data.flows.areaSummaries,
    data.flows.intertieSeries,
    data.flows.lineSeries,
    clampedNetworkFlowSlotIndex,
    networkPowerPlants,
    selectedFlowDateTimeLabel,
  ]);
  const majorFlowAnimationPaths = useMemo(
    () =>
      (
        flowNetworkOption as {
          __majorFlowAnimationPaths?: NetworkAnimationPath[];
        }
      ).__majorFlowAnimationPaths ?? [],
    [flowNetworkOption],
  );

  const intertieAnimationPaths = useMemo(
    () =>
      (
        flowNetworkOption as {
          __intertieAnimationPaths?: NetworkAnimationPath[];
        }
      ).__intertieAnimationPaths ?? [],
    [flowNetworkOption],
  );

  const japanGuidePaths = useMemo(() => buildJapanGuideSvgPaths(), []);

  const interAreaFlowTextRows = useMemo(() => {
    const rowLimit = selectedArea === "全エリア" ? (isMobileViewport ? 10 : 14) : (isMobileViewport ? 16 : 22);
    const scopedInterties = (data.flows.intertieSeries ?? []).filter((row) =>
      selectedArea === "全エリア" ? true : row.sourceArea === selectedArea || row.targetArea === selectedArea,
    );
    const pairMap = new Map<
      string,
      {
        sourceArea: string;
        targetArea: string;
        upMw: number;
        downMw: number;
        intertieNames: Set<string>;
      }
    >();

    scopedInterties.forEach((row) => {
      const key = `${row.sourceArea}::${row.targetArea}`;
      const slotMw = row.values[clampedNetworkFlowSlotIndex] ?? row.avgMw ?? 0;
      const current = pairMap.get(key) ?? {
        sourceArea: row.sourceArea,
        targetArea: row.targetArea,
        upMw: 0,
        downMw: 0,
        intertieNames: new Set<string>(),
      };
      if (slotMw >= 0) {
        current.upMw += slotMw;
      } else {
        current.downMw += Math.abs(slotMw);
      }
      current.intertieNames.add(row.intertieName);
      pairMap.set(key, current);
    });

    const rows = Array.from(pairMap.values()).map((row) => ({
      sourceArea: row.sourceArea,
      targetArea: row.targetArea,
      upMw: roundTo(row.upMw, 1),
      downMw: roundTo(row.downMw, 1),
      magnitudeMw: roundTo(row.upMw + row.downMw, 1),
      intertieNames: Array.from(row.intertieNames),
    }));

    if (rows.length > 0) {
      return rows.sort((a, b) => b.magnitudeMw - a.magnitudeMw).slice(0, rowLimit);
    }

    return (data.flows.interAreaFlows ?? [])
      .filter((row) =>
        selectedArea === "全エリア" ? true : row.sourceArea === selectedArea || row.targetArea === selectedArea,
      )
      .map((row) => ({
        sourceArea: row.sourceArea,
        targetArea: row.targetArea,
        upMw: roundTo(Math.max(row.avgMw, 0), 1),
        downMw: roundTo(Math.max(-row.avgMw, 0), 1),
        magnitudeMw: roundTo(row.avgAbsMw, 1),
        intertieNames: row.intertieNames,
      }))
      .sort((a, b) => b.magnitudeMw - a.magnitudeMw)
      .slice(0, rowLimit);
  }, [clampedNetworkFlowSlotIndex, data.flows.interAreaFlows, data.flows.intertieSeries, isMobileViewport, selectedArea]);

  const dashboardHighlights = useMemo(() => {
    const totalGenerationKwh = data.generation.areaTotals.reduce((sum, item) => sum + item.totalKwh, 0);
    const totalDemandMw = reserveCurrentRows.reduce((sum, row) => sum + row.demandMw, 0);
    const topSource = data.generation.sourceTotals[0];
    const topSourceShare = topSource && totalGenerationKwh > 0 ? (topSource.totalKwh / totalGenerationKwh) * 100 : 0;
    const lowestReserveArea = reserveCurrentRows[0] ?? null;
    const demandLeadersRaw = [...reserveCurrentRows].sort((a, b) => b.demandMw - a.demandMw);
    const peakDemandArea = demandLeadersRaw[0] ?? null;

    const netIntertieByArea = new Map<string, number>();
    (data.flows.intertieSeries ?? []).forEach((row) => {
      const value = row.values[clampedNetworkFlowSlotIndex] ?? row.avgMw ?? 0;
      netIntertieByArea.set(row.sourceArea, (netIntertieByArea.get(row.sourceArea) ?? 0) - value);
      netIntertieByArea.set(row.targetArea, (netIntertieByArea.get(row.targetArea) ?? 0) + value);
    });

    const netIntertieRows = Array.from(netIntertieByArea.entries()).map(([area, mw]) => ({ area, mw }));
    const strongestImportArea =
      netIntertieRows.filter((item) => item.mw > 0).sort((a, b) => b.mw - a.mw)[0] ?? null;
    const strongestExportArea =
      netIntertieRows.filter((item) => item.mw < 0).sort((a, b) => a.mw - b.mw)[0] ?? null;

    const hottestIntertie = interAreaFlowTextRows[0] ?? null;
    const largestUnit =
      [...data.generation.topUnits].sort(
        (a, b) => b.dailyKwh - a.dailyKwh || b.maxOutputManKw - a.maxOutputManKw,
      )[0] ?? null;
    const topPlant = allPlantSummaries[0] ?? null;
    const strongestImportValue = strongestImportArea?.area ?? "-";
    const strongestImportDetail = strongestImportArea
      ? `${decimalFmt.format(strongestImportArea.mw)} MW`
      : "データなし";
    const strongestExportValue = strongestExportArea?.area ?? "-";
    const strongestExportDetail = strongestExportArea
      ? `${decimalFmt.format(Math.abs(strongestExportArea.mw))} MW`
      : "データなし";
    const areaShareSegments = buildTopShareSegments(
      data.generation.areaTotals,
      totalGenerationKwh,
      5,
      (item) => item.area,
      (item) => item.totalKwh,
      (item) => FLOW_AREA_COLORS[item.area] ?? FLOW_AREA_COLORS.default,
    );
    const sourceShareSegments = buildTopShareSegments(
      data.generation.sourceTotals,
      totalGenerationKwh,
      5,
      (item) => normalizeSourceName(item.source),
      (item) => item.totalKwh,
      (item, idx) => sourceColorByName.get(item.source) ?? SOURCE_COLORS[idx % SOURCE_COLORS.length],
    );
    const reserveWatchItems: BarListItem[] = reserveCurrentRows.slice(0, 4).map((row) => ({
      label: row.area,
      valueLabel: `${decimalFmt.format(row.reserveRate)}%`,
      percent: clamp((row.reserveRate / 20) * 100, 0, 100),
      color: FLOW_AREA_COLORS[row.area] ?? FLOW_AREA_COLORS.default,
      note: `予備力 ${decimalFmt.format(row.reserveMw)} MW`,
    }));
    const maxDemandMw = Math.max(...demandLeadersRaw.map((row) => row.demandMw), 1);
    const demandLeaderItems: BarListItem[] = demandLeadersRaw.slice(0, 4).map((row) => ({
      label: row.area,
      valueLabel: `${decimalFmt.format(row.demandMw)} MW`,
      percent: clamp((row.demandMw / maxDemandMw) * 100, 0, 100),
      color: FLOW_AREA_COLORS[row.area] ?? FLOW_AREA_COLORS.default,
      note: `全国需要比 ${totalDemandMw > 0 ? decimalFmt.format((row.demandMw / totalDemandMw) * 100) : "0"}%`,
    }));
    const maxIntertieMw = Math.max(...interAreaFlowTextRows.map((row) => row.magnitudeMw), 1);
    const intertieWatchItems: BarListItem[] = interAreaFlowTextRows.slice(0, 4).map((row) => ({
      label: `${row.sourceArea} ⇄ ${row.targetArea}`,
      valueLabel: `${decimalFmt.format(row.magnitudeMw)} MW`,
      percent: clamp((row.magnitudeMw / maxIntertieMw) * 100, 0, 100),
      color:
        FLOW_AREA_COLORS[row.upMw >= row.downMw ? row.sourceArea : row.targetArea] ?? FLOW_AREA_COLORS.default,
      note: row.intertieNames.join(" / "),
    }));
    const unitLeadersRaw = [...data.generation.topUnits]
      .sort((a, b) => b.dailyKwh - a.dailyKwh || b.maxOutputManKw - a.maxOutputManKw)
      .slice(0, 3);
    const maxUnitKwh = Math.max(...unitLeadersRaw.map((item) => item.dailyKwh), 1);
    const unitLeaderItems: BarListItem[] = unitLeadersRaw.map((item) => ({
      label: `${item.plantName} ${item.unitName}`,
      valueLabel: `${numberFmt.format(item.dailyKwh)} kWh`,
      percent: clamp((item.dailyKwh / maxUnitKwh) * 100, 0, 100),
      color: FLOW_AREA_COLORS[item.area] ?? FLOW_AREA_COLORS.default,
      note: `${item.area}｜最大 ${manKwFmt.format(item.maxOutputManKw)} 万kW`,
    }));
    const plantLeadersRaw = allPlantSummaries.slice(0, 3);
    const maxPlantEnergy = Math.max(...plantLeadersRaw.map((item) => item.dailyKwh), 1);
    const plantLeaderItems: BarListItem[] = plantLeadersRaw.map((item) => ({
      label: item.plantName,
      valueLabel: formatCompactEnergy(item.dailyKwh),
      percent: clamp((item.dailyKwh / maxPlantEnergy) * 100, 0, 100),
      color: FLOW_AREA_COLORS[item.area] ?? FLOW_AREA_COLORS.default,
      note: item.area,
    }));

    return {
      totalGenerationKwh,
      totalDemandMw,
      topSource,
      topSourceShare,
      lowestReserveArea,
      peakDemandArea,
      hottestIntertie,
      strongestImportValue,
      strongestImportDetail,
      strongestExportValue,
      strongestExportDetail,
      largestUnit,
      topPlant,
      areaShareSegments,
      sourceShareSegments,
      reserveWatchItems,
      demandLeaderItems,
      intertieWatchItems,
      unitLeaderItems,
      plantLeaderItems,
    };
  }, [
    allPlantSummaries,
    clampedNetworkFlowSlotIndex,
    data.flows.intertieSeries,
    data.generation.areaTotals,
    data.generation.sourceTotals,
    data.generation.topUnits,
    interAreaFlowTextRows,
    reserveCurrentRows,
    sourceColorByName,
  ]);

  const areaSupplyCards = useMemo(() => {
    const totalGenerationKwh = data.generation.areaTotals.reduce((sum, item) => sum + item.totalKwh, 0);
    const areaFlowSummaryMap = new Map(data.flows.areaSummaries.map((item) => [item.area, item]));
    const netIntertieByArea = new Map<string, number>();
    const strongestPeerByArea = new Map<
      string,
      {
        counterpart: string;
        signedMw: number;
        magnitudeMw: number;
      }
    >();

    (data.flows.intertieSeries ?? []).forEach((row) => {
      const value = row.values[clampedNetworkFlowSlotIndex] ?? row.avgMw ?? 0;
      netIntertieByArea.set(row.sourceArea, (netIntertieByArea.get(row.sourceArea) ?? 0) - value);
      netIntertieByArea.set(row.targetArea, (netIntertieByArea.get(row.targetArea) ?? 0) + value);

      const sourceMagnitude = Math.abs(value);
      const sourceExisting = strongestPeerByArea.get(row.sourceArea);
      if (!sourceExisting || sourceMagnitude > sourceExisting.magnitudeMw) {
        strongestPeerByArea.set(row.sourceArea, {
          counterpart: row.targetArea,
          signedMw: -value,
          magnitudeMw: sourceMagnitude,
        });
      }

      const targetMagnitude = Math.abs(value);
      const targetExisting = strongestPeerByArea.get(row.targetArea);
      if (!targetExisting || targetMagnitude > targetExisting.magnitudeMw) {
        strongestPeerByArea.set(row.targetArea, {
          counterpart: row.sourceArea,
          signedMw: value,
          magnitudeMw: targetMagnitude,
        });
      }
    });

    const primaryPlantByArea = new Map<string, (typeof allPlantSummaries)[number]>();
    allPlantSummaries.forEach((plant) => {
      if (!primaryPlantByArea.has(plant.area)) {
        primaryPlantByArea.set(plant.area, plant);
      }
    });

    const areaTotalMap = new Map(data.generation.areaTotals.map((item) => [item.area, item]));
    const allAreaNames = new Set<string>();
    data.generation.areaTotals.forEach((item) => allAreaNames.add(item.area));
    data.flows.areaSummaries.forEach((item) => allAreaNames.add(item.area));

    const rows = Array.from(allAreaNames).map((areaName) => {
      const item = areaTotalMap.get(areaName);
      const areaKwh = item?.totalKwh ?? 0;
      const sourceMix = buildTopShareSegments(
        sourceTotalsByArea[areaName] ?? [],
        areaKwh,
        4,
        (source) => normalizeSourceName(source.source),
        (source) => source.totalKwh,
        (source, idx) => sourceColorByName.get(source.source) ?? SOURCE_COLORS[idx % SOURCE_COLORS.length],
      );
      const topSource = sourceTotalsByArea[areaName]?.[0];
      const netIntertieMw = netIntertieByArea.get(areaName) ?? 0;
      const flowSummary = areaFlowSummaryMap.get(areaName);
      const peer = strongestPeerByArea.get(areaName);
      const primaryPlant = primaryPlantByArea.get(areaName);
      const reserve = reserveAreaMap.get(areaName);
      return {
        area: areaName,
        totalKwh: areaKwh,
        sharePercent: totalGenerationKwh > 0 ? (areaKwh / totalGenerationKwh) * 100 : 0,
        topSource: topSource?.source ?? "不明",
        topSourceShare:
          topSource && areaKwh > 0 ? (topSource.totalKwh / areaKwh) * 100 : 0,
        sourceMix,
        netIntertieMw,
        peer,
        primaryPlant,
        peakAbsMw: flowSummary?.peakAbsMw ?? 0,
        demandMw: reserve?.demandMw[clampedNetworkFlowSlotIndex] ?? 0,
        supplyMw: reserve?.supplyMw[clampedNetworkFlowSlotIndex] ?? 0,
        reserveMw: reserve?.reserveMw[clampedNetworkFlowSlotIndex] ?? 0,
        reserveRate: reserve?.reserveRate[clampedNetworkFlowSlotIndex] ?? 0,
      };
    });

    const filteredRows =
      selectedArea === "全エリア" ? rows : rows.filter((item) => item.area === selectedArea);

    return filteredRows.sort((a, b) => compareAreaOrder(a.area, b.area));
  }, [
    allPlantSummaries,
    clampedNetworkFlowSlotIndex,
    data.flows.areaSummaries,
    data.flows.intertieSeries,
    data.generation.areaTotals,
    reserveAreaMap,
    selectedArea,
    sourceColorByName,
    sourceTotalsByArea,
  ]);
  const maxAreaNetIntertieAbsMw = useMemo(
    () => Math.max(...areaSupplyCards.map((card) => Math.abs(card.netIntertieMw)), 1),
    [areaSupplyCards],
  );
  const maxAreaPeakAbsMw = useMemo(
    () => Math.max(...areaSupplyCards.map((card) => card.peakAbsMw), 1),
    [areaSupplyCards],
  );

  const interAreaFlowOption = useMemo(() => {
    const rows = interAreaFlowTextRows.map((row) => {
      const signedMw = roundTo(row.upMw - row.downMw, 1);
      return {
        ...row,
        signedMw,
        absMw: Math.abs(signedMw),
      };
    });
    const hasData = rows.length > 0;
    const maxAbsSignedMw = Math.max(...rows.map((row) => row.absMw), 1);
    const axisLimit = Math.max(10, Math.ceil(maxAbsSignedMw * 1.12));
    const showDirectionLabels = !isMobileViewport;

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: Array<{ data: { row: (typeof rows)[number] } }>) => {
          const row = params[0]?.data?.row;
          if (!row) {
            return "";
          }
          return `${row.sourceArea} ⇄ ${row.targetArea}<br/>表示日時: ${selectedFlowDateTimeLabel}<br/>潮流: ${decimalFmt.format(
            row.signedMw,
          )} MW<br/>${decimalFmt.format(row.upMw)}MW ↑ / ${decimalFmt.format(
            row.downMw,
          )}MW ↓<br/>連系線: ${row.intertieNames.join(" / ")}`;
        },
      },
      grid: {
        top: 20,
        left: isMobileViewport ? 88 : 124,
        right: isMobileViewport ? 12 : 20,
        bottom: isMobileViewport ? 56 : 40,
      },
      xAxis: {
        type: "value",
        min: -axisLimit,
        max: axisLimit,
        splitNumber: isMobileViewport ? 4 : 6,
        name: "MW",
        nameLocation: "middle",
        nameGap: isMobileViewport ? 34 : 28,
        nameTextStyle: { color: "#64748b", fontSize: isMobileViewport ? 10 : 11 },
        axisLabel: {
          formatter: (value: number) => `${Math.round(value)}`,
          rotate: isMobileViewport ? 28 : 18,
          hideOverlap: true,
          fontSize: isMobileViewport ? 10 : 11,
        },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: rows.map((row) => `${row.sourceArea} ⇄ ${row.targetArea}`),
        axisLabel: { color: "#334155", fontSize: isMobileViewport ? 10 : 11 },
      },
      graphic: hasData
        ? undefined
        : [
            {
              type: "text",
              left: "center",
              top: "middle",
              style: {
                text: "連系線潮流実績データが未取得です",
                fill: "#475569",
                font: "14px sans-serif",
              },
              silent: true,
            },
          ],
      series: [
        {
          type: "bar",
          barWidth: 14,
          data: rows.map((row) => ({
            value: row.signedMw,
            row,
            itemStyle: {
              color:
                row.signedMw >= 0
                  ? (FLOW_AREA_COLORS[row.sourceArea] ?? FLOW_AREA_COLORS.default)
                  : (FLOW_AREA_COLORS[row.targetArea] ?? FLOW_AREA_COLORS.default),
              borderRadius: row.signedMw >= 0 ? [0, 5, 5, 0] : [5, 0, 0, 5],
            },
          })),
          label: {
            show: showDirectionLabels,
            position: (params: { value: number }) => (params.value >= 0 ? "right" : "left"),
            formatter: (params: { data: { row: (typeof rows)[number] } }) =>
              `${decimalFmt.format(params.data.row.upMw)}MW ↑  ${decimalFmt.format(params.data.row.downMw)}MW ↓`,
            color: "#334155",
            fontSize: 10,
          },
          markLine: {
            silent: true,
            symbol: ["none", "none"],
            lineStyle: { color: "#64748b", type: "dashed", width: 1 },
            data: [{ xAxis: 0 }],
          },
        },
      ],
    };
  }, [interAreaFlowTextRows, isMobileViewport, selectedFlowDateTimeLabel]);

  const intertieTrendOption = useMemo(() => {
    const scopedSeries = (data.flows.intertieSeries ?? []).filter((row) =>
      selectedArea === "全エリア" ? true : row.sourceArea === selectedArea || row.targetArea === selectedArea,
    );
    const topSeries = [...scopedSeries]
      .sort((a, b) => b.avgAbsMw - a.avgAbsMw)
      .slice(0, selectedArea === "全エリア" ? 6 : 8);
    const hasData = topSeries.length > 0;

    const netImportSeries =
      selectedArea === "全エリア"
        ? null
        : data.meta.slotLabels.flow.map((_, idx) => {
            let sum = 0;
            for (const row of scopedSeries) {
              const value = row.values[idx] ?? 0;
              if (row.sourceArea === selectedArea) {
                sum -= value;
              }
              if (row.targetArea === selectedArea) {
                sum += value;
              }
            }
            return roundTo(sum, 1);
          });

    return {
      tooltip: {
        trigger: "axis",
        valueFormatter: (value: number) => `${decimalFmt.format(value)} MW`,
      },
      legend: {
        top: 10,
        type: "scroll",
        textStyle: { color: "#334155" },
      },
      grid: { top: isMobileViewport ? 48 : 58, left: isMobileViewport ? 40 : 52, right: isMobileViewport ? 10 : 20, bottom: 34 },
      xAxis: {
        type: "category",
        data: data.meta.slotLabels.flow,
        axisLabel: { interval: 3 },
      },
      yAxis: {
        type: "value",
        name: "潮流実績(MW)",
      },
      graphic: hasData
        ? undefined
        : [
            {
              type: "text",
              left: "center",
              top: "middle",
              style: {
                text: "連系線潮流実績データが未取得です",
                fill: "#475569",
                font: "14px sans-serif",
              },
              silent: true,
            },
          ],
      series: [
        ...(netImportSeries
          ? [
              {
                name: `${selectedArea} 純流入(+)`,
                type: "line",
                data: netImportSeries,
                smooth: true,
                symbol: "none",
                color: "#111827",
                lineStyle: { width: 3, color: "#111827", type: "dashed" },
              },
            ]
          : []),
        ...topSeries.map((row) => {
          const seriesColor = FLOW_AREA_COLORS[row.sourceArea] ?? FLOW_AREA_COLORS.default;
          return {
            name: `${row.sourceArea}→${row.targetArea}`,
            type: "line",
            data: row.values,
            smooth: true,
            symbol: "none",
            color: seriesColor,
            lineStyle: {
              width: 2.3,
              color: seriesColor,
            },
          };
        }),
      ],
    };
  }, [data.flows.intertieSeries, data.meta.slotLabels.flow, isMobileViewport, selectedArea]);

  // ---------------------------------------------------------------------------
  // Congestion (連系線混雑度) — utilization rate = |flow| / rated capacity
  // ---------------------------------------------------------------------------

  const congestionData = useMemo(() => {
    const series = data.flows.intertieSeries ?? [];
    if (series.length === 0) return null;

    const lines = series
      .filter((row) => INTERTIE_RATED_CAPACITY_MW[row.intertieName] != null)
      .map((row) => {
        const cap = INTERTIE_RATED_CAPACITY_MW[row.intertieName]!;
        const utilizationPct = row.values.map((v) =>
          cap.capacityMw > 0 ? roundTo((Math.abs(v) / cap.capacityMw) * 100, 1) : 0,
        );
        const peakUtilization = Math.max(...utilizationPct);
        const avgUtilization = roundTo(utilizationPct.reduce((s, v) => s + v, 0) / (utilizationPct.length || 1), 1);
        return {
          intertieName: row.intertieName,
          label: cap.label,
          sourceArea: row.sourceArea,
          targetArea: row.targetArea,
          capacityMw: cap.capacityMw,
          peakAbsMw: row.peakAbsMw,
          avgAbsMw: row.avgAbsMw,
          utilizationPct,
          peakUtilization,
          avgUtilization,
          values: row.values,
        };
      })
      .filter((row) => row.peakUtilization > 0)
      .sort((a, b) => b.peakUtilization - a.peakUtilization);

    if (lines.length === 0) return null;

    const overallPeakLine = lines[0]!;
    const overallAvgUtilization = roundTo(
      lines.reduce((s, l) => s + l.avgUtilization, 0) / lines.length,
      1,
    );
    const highCongestionCount = lines.filter((l) => l.peakUtilization >= 70).length;

    return { lines, overallPeakLine, overallAvgUtilization, highCongestionCount };
  }, [data.flows.intertieSeries]);

  const congestionTrendOption = useMemo(() => {
    if (!congestionData) return null;
    const labels = data.meta.slotLabels.flow;
    const topLines = congestionData.lines.slice(0, isMobileViewport ? 5 : 8);

    return {
      tooltip: {
        trigger: "axis" as const,
        formatter: (params: Array<{ seriesName: string; value: number; marker: string; dataIndex: number }>) => {
          const time = labels[params[0]?.dataIndex ?? 0] ?? "";
          const rows = params
            .filter((p) => p.value != null)
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
            .map((p) => {
              const line = topLines.find((l) => l.label === p.seriesName || `${l.sourceArea}→${l.targetArea}` === p.seriesName);
              const flowMw = line ? Math.abs(line.values[p.dataIndex] ?? 0) : 0;
              const capMw = line?.capacityMw ?? 0;
              return `${p.marker} ${p.seriesName}: <b>${p.value}%</b> (${decimalFmt.format(flowMw)}/${numberFmt.format(capMw)} MW)`;
            });
          return `<b>${time}</b><br/>${rows.join("<br/>")}`;
        },
      },
      legend: {
        top: 10,
        type: "scroll" as const,
        textStyle: { color: "#334155" },
      },
      grid: {
        top: isMobileViewport ? 48 : 58,
        left: isMobileViewport ? 40 : 52,
        right: isMobileViewport ? 10 : 20,
        bottom: 34,
      },
      xAxis: {
        type: "category" as const,
        data: labels,
        axisLabel: { interval: 3 },
      },
      yAxis: {
        type: "value" as const,
        name: "利用率(%)",
        max: 100,
        axisLabel: { formatter: (v: number) => `${v}%` },
      },
      visualMap: {
        show: false,
        pieces: [
          { lte: 50, color: "#10b981" },  // emerald-500
          { gt: 50, lte: 70, color: "#f59e0b" },  // amber-500
          { gt: 70, lte: 85, color: "#f97316" },  // orange-500
          { gt: 85, color: "#ef4444" },  // red-500
        ],
        dimension: 1,
        seriesIndex: topLines.map((_, i) => i),
      },
      series: topLines.map((line) => {
        const color = FLOW_AREA_COLORS[line.sourceArea] ?? FLOW_AREA_COLORS[line.targetArea] ?? FLOW_AREA_COLORS.default;
        return {
          name: line.label || `${line.sourceArea}→${line.targetArea}`,
          type: "line" as const,
          data: line.utilizationPct,
          smooth: true,
          symbol: "none",
          lineStyle: { width: 2.3, color },
          areaStyle: {
            color: {
              type: "linear" as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: color + "18" },
                { offset: 1, color: color + "02" },
              ],
            },
          },
          markLine: line === topLines[0] ? {
            silent: true,
            symbol: "none",
            lineStyle: { type: "dashed" as const, width: 1 },
            data: [
              { yAxis: 70, lineStyle: { color: "#f97316" }, label: { formatter: "70%", position: "insideEndTop" as const, color: "#f97316", fontSize: 10 } },
            ],
          } : undefined,
        };
      }),
    };
  }, [congestionData, data.meta.slotLabels.flow, isMobileViewport]);

  const congestionHeatmapOption = useMemo(() => {
    if (!congestionData) return null;
    const labels = data.meta.slotLabels.flow;
    const lines = congestionData.lines;

    const heatmapData: Array<[number, number, number]> = [];
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      for (let slotIdx = 0; slotIdx < labels.length; slotIdx++) {
        heatmapData.push([slotIdx, lineIdx, lines[lineIdx]!.utilizationPct[slotIdx] ?? 0]);
      }
    }

    return {
      tooltip: {
        position: "top" as const,
        formatter: (params: { value: [number, number, number] }) => {
          const [slotIdx, lineIdx, val] = params.value;
          const line = lines[lineIdx];
          const time = labels[slotIdx] ?? "";
          const flowMw = line ? Math.abs(line.values[slotIdx] ?? 0) : 0;
          return `<b>${line?.label ?? ""}</b><br/>${time}: <b>${val}%</b><br/>${decimalFmt.format(flowMw)} / ${numberFmt.format(line?.capacityMw ?? 0)} MW`;
        },
      },
      grid: {
        top: 12,
        left: isMobileViewport ? 90 : 120,
        right: isMobileViewport ? 40 : 60,
        bottom: 36,
      },
      xAxis: {
        type: "category" as const,
        data: labels,
        axisLabel: { interval: 5, fontSize: 10 },
        splitArea: { show: true },
      },
      yAxis: {
        type: "category" as const,
        data: lines.map((l) => l.label || `${l.sourceArea}→${l.targetArea}`),
        axisLabel: { fontSize: isMobileViewport ? 9 : 11 },
      },
      visualMap: {
        min: 0,
        max: 100,
        calculable: true,
        orient: "horizontal" as const,
        left: "center",
        bottom: 0,
        itemWidth: 12,
        itemHeight: isMobileViewport ? 80 : 140,
        textStyle: { fontSize: 10 },
        inRange: {
          color: ["#d1fae5", "#6ee7b7", "#fbbf24", "#f97316", "#ef4444", "#b91c1c"],
        },
        formatter: (value: number) => `${Math.round(value)}%`,
      },
      series: [{
        type: "heatmap" as const,
        data: heatmapData,
        label: { show: false },
        emphasis: {
          itemStyle: { shadowBlur: 6, shadowColor: "rgba(0,0,0,0.3)" },
        },
      }],
    };
  }, [congestionData, data.meta.slotLabels.flow, isMobileViewport]);

  return (
    <div className="relative min-h-screen bg-[radial-gradient(circle_at_top_left,_#f4f1de_0%,_#f6f8fb_38%,_#e9f5f2_100%)] text-slate-800 dark:bg-[radial-gradient(circle_at_top_left,_#1a1a2e_0%,_#16213e_38%,_#0f3460_100%)] dark:text-slate-200">
      <a
        href="#dashboard-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-teal-600 focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
      >
        コンテンツへスキップ
      </a>
      <LoadingOverlay visible={isDateLoading} />
      <div id="dashboard-content" className="mx-auto flex w-full max-w-[1320px] flex-col gap-3 px-2 py-4 md:gap-5 md:px-8 md:py-6">
        <header className="rounded-3xl border border-white/70 bg-white/80 px-3 py-3 shadow-sm backdrop-blur md:px-5 md:py-5 dark:border-slate-700 dark:bg-slate-800/80">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs tracking-[0.18em] text-teal-700 dark:text-teal-400">OCCTO GRID OBSERVATORY</p>
              <h1 className="text-lg font-semibold leading-tight md:text-3xl">
                発電実績 ×送電潮流実績 ダッシュボード
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                対象日: {data.meta.targetDate} / 最終取り込み: {fetchedAtLabel}
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 md:items-end">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="dashboard-date" className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  対象日
                </label>
                <input
                  id="dashboard-date"
                  type="date"
                  className="rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-teal-800 dark:bg-slate-800 dark:text-slate-200"
                  value={toInputDateValue(selectedDate)}
                  min={toInputDateValue(earliestAvailableDate)}
                  max={toInputDateValue(latestAvailableDate)}
                  onChange={(event) => {
                    const nextDate = toDisplayDateValue(event.target.value);
                    if (!nextDate) {
                      setDateError("対象日を入力してください。");
                      return;
                    }
                    if (!availableDateSet.has(nextDate)) {
                      setDateError(`${nextDate} の公開データはまだありません。最新は ${latestAvailableDate} です。`);
                      return;
                    }
                    setDateError(null);
                    setSelectedDate(nextDate);
                  }}
                  disabled={isDateLoading}
                />
                {isDateLoading ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-teal-700 dark:text-teal-400">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-teal-200 border-t-teal-600" />
                    読み込み中...
                  </span>
                ) : null}
              </div>
              <p className="hidden text-xs text-slate-500 md:block dark:text-slate-400">
                公開データ範囲: {earliestAvailableDate} から {latestAvailableDate}
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor="area" className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  エリア
                </label>
                <select
                  id="area"
                  className="rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none dark:border-teal-800 dark:bg-slate-800 dark:text-slate-200"
                  value={selectedArea}
                  onChange={(event) => setSelectedArea(event.target.value)}
                >
                  {areas.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </div>
              {dateError ? <p className="text-xs text-rose-700 dark:text-rose-400">{dateError}</p> : null}
            </div>
          </div>
        </header>
        <section className="rounded-3xl border border-white/70 bg-white/85 p-3 shadow-sm backdrop-blur md:p-4 dark:border-slate-700 dark:bg-slate-800/85">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">表示するパネル</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:border-teal-400 hover:text-teal-700 dark:border-slate-600 dark:text-slate-300 dark:hover:border-teal-500 dark:hover:text-teal-400"
                onClick={() => setVisibleSectionIds(DASHBOARD_SECTION_OPTIONS.map((item) => item.id))}
              >
                すべて表示
              </button>
              <button
                type="button"
                className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700 transition hover:border-teal-400 hover:text-teal-700 dark:border-slate-600 dark:text-slate-300 dark:hover:border-teal-500 dark:hover:text-teal-400"
                onClick={() => setVisibleSectionIds(["summary", "areaCards", "composition", "network"])}
              >
                俯瞰モード
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {DASHBOARD_SECTION_OPTIONS.map((item) => {
              const active = visibleSectionSet.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="switch"
                  aria-checked={active}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    active
                      ? "border-teal-500 bg-teal-600 text-white shadow-sm"
                      : "border-slate-300 bg-white text-slate-700 hover:border-teal-400 hover:text-teal-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-teal-500 dark:hover:text-teal-400"
                  }`}
                  onClick={() =>
                    setVisibleSectionIds((current) => {
                      if (current.includes(item.id)) {
                        return current.filter((id) => id !== item.id);
                      }
                      return [...current, item.id];
                    })
                  }
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </section>

        {visibleSectionSet.has("summary") ? (
          <DismissibleSection sectionId="summary" onDismiss={removeSection}>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <SummaryCard
              title="全国発電量"
              value={formatCompactEnergy(dashboardHighlights.totalGenerationKwh)}
              detail={`${data.generation.areaTotals.length} エリア合計`}
              accentColor="#0b525b"
            >
              <SegmentedBar segments={dashboardHighlights.areaShareSegments} />
              <div className="mt-3 flex flex-wrap gap-2">
                {dashboardHighlights.areaShareSegments.slice(0, 4).map((segment) => (
                  <DataChip
                    key={segment.label}
                    label={segment.label}
                    value={`${decimalFmt.format(segment.percent)}%`}
                    color={segment.color}
                  />
                ))}
              </div>
            </SummaryCard>
            <SummaryCard
              title="主力電源"
              value={dashboardHighlights.topSource ? normalizeSourceName(dashboardHighlights.topSource.source) : "-"}
              detail={
                dashboardHighlights.topSource
                  ? `${dashboardHighlights.topSourceShare.toFixed(1)}% / ${formatCompactEnergy(
                      dashboardHighlights.topSource.totalKwh,
                    )}`
                  : "データなし"
              }
              accentColor="#197278"
            >
              <SegmentedBar segments={dashboardHighlights.sourceShareSegments} />
              <MiniBarList items={dashboardHighlights.sourceShareSegments.slice(0, 4).map((segment) => ({
                label: segment.label,
                valueLabel: `${decimalFmt.format(segment.percent)}%`,
                percent: segment.percent,
                color: segment.color,
                note: formatCompactEnergy(segment.value),
              }))} />
            </SummaryCard>
            <SummaryCard
              title="発電トップ"
              value={dashboardHighlights.largestUnit ? `${dashboardHighlights.largestUnit.plantName} ${dashboardHighlights.largestUnit.unitName}` : "-"}
              detail={
                dashboardHighlights.largestUnit
                  ? `${dashboardHighlights.largestUnit.area} / ${numberFmt.format(
                      dashboardHighlights.largestUnit.dailyKwh,
                    )} kWh（最大 ${manKwFmt.format(dashboardHighlights.largestUnit.maxOutputManKw)} 万kW）`
                  : "データなし"
              }
              accentColor="#1d3557"
            >
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-medium tracking-[0.14em] text-slate-500">最大ユニット</p>
                  <MiniBarList items={dashboardHighlights.unitLeaderItems} compact />
                </div>
                <div>
                  <p className="text-[11px] font-medium tracking-[0.14em] text-slate-500">最大発電所</p>
                  <MiniBarList items={dashboardHighlights.plantLeaderItems} compact />
                </div>
              </div>
            </SummaryCard>
          </section>
          </DismissibleSection>
        ) : null}

        {showGenerationTrend || showSourceComposition ? (
          <ChartErrorBoundary sectionName="発電トレンド・構成">
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {showGenerationTrend ? (
              <DismissibleSection sectionId="generation" onDismiss={removeSection} className={showSourceComposition ? "lg:col-span-7" : "lg:col-span-12"}>
              <Panel
                title="発電方式別 30分推移"
                testId="generation-trend-panel"
              >
                <div className="mb-2 flex justify-end">
                  <label htmlFor="generation-area" className="mr-2 text-sm text-slate-600">
                    表示エリア
                  </label>
                  <select
                    id="generation-area"
                    className="rounded-lg border border-teal-200 bg-white px-2 py-1 text-sm focus:border-teal-500 focus:outline-none"
                    value={generationTrendArea}
                    onChange={(event) => setGenerationTrendArea(event.target.value)}
                  >
                    {generationAreas.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                </div>
                <div data-testid="generation-trend-chart" role="img" aria-label="発電方式別30分推移チャート">
                  <ReactECharts option={generationLineOption} style={{ height: 360 }} />
                </div>
              </Panel>
              </DismissibleSection>
            ) : null}
            {showSourceComposition ? (
              <DismissibleSection sectionId="composition" onDismiss={removeSection} className={showGenerationTrend ? "lg:col-span-5" : "lg:col-span-12"}>
              <Panel
                title="発電方式 構成比"
                testId="source-composition-panel"
              >
                <div className="mb-2 flex justify-end">
                  <label htmlFor="source-donut-area" className="mr-2 text-sm text-slate-600">
                    表示エリア
                  </label>
                  <select
                    id="source-donut-area"
                    className="rounded-lg border border-teal-200 bg-white px-2 py-1 text-sm focus:border-teal-500 focus:outline-none"
                    value={sourceDonutArea}
                    onChange={(event) => setSourceDonutArea(event.target.value)}
                  >
                    {generationAreas.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </select>
                </div>
                <div
                  className={`items-center gap-4 ${
                    useInlineDonutLegend ? "grid lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]" : ""
                  }`}
                >
                  <div data-testid="source-composition-chart" role="img" aria-label="発電方式構成比チャート" className="mx-auto w-full max-w-[300px]">
                    <ReactECharts option={sourceDonutOption} style={{ height: 300 }} />
                  </div>
                  <CompositionLegendList
                    items={sourceCompositionItems}
                    className={useInlineDonutLegend ? "" : "mt-3"}
                  />
                </div>
              </Panel>
              </DismissibleSection>
            ) : null}
          </section>
          </ChartErrorBoundary>
        ) : null}

        {visibleSectionSet.has("reserve") ? (
          <DismissibleSection sectionId="reserve" onDismiss={removeSection}>
          <ChartErrorBoundary sectionName="予備率推移">
          <section className="grid grid-cols-1 gap-4">
            <Panel title="エリア予備率（30分推移）" testId="reserve-trend-panel">
              <div className="mb-2 text-xs text-slate-600">
                公式値ベース。{selectedArea === "全エリア" ? "全エリア" : `${selectedArea}`} / {data.meta.targetDate}
              </div>
              <div data-testid="reserve-trend-chart" role="img" aria-label="エリア予備率推移チャート">
                <ReactECharts option={reserveTrendOption} style={{ height: 320 }} />
              </div>
            </Panel>
          </section>
          </ChartErrorBoundary>
          </DismissibleSection>
        ) : null}

        {visibleSectionSet.has("totals") ? (
          <DismissibleSection sectionId="totals" onDismiss={removeSection}>
          <ChartErrorBoundary sectionName="発電・連系概要">
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="エリア別 日量発電" testId="area-total-generation-panel">
              <div data-testid="area-total-generation-chart" role="img" aria-label="エリア別日量発電チャート">
                <ReactECharts option={areaTotalsOption} style={{ height: 320 }} />
              </div>
            </Panel>
            <Panel title="連系線潮流トレンド（時系列）" testId="intertie-trend-panel">
              <div data-testid="intertie-trend-chart" role="img" aria-label="連系線潮流トレンドチャート">
                <ReactECharts option={intertieTrendOption} style={{ height: 320 }} />
              </div>
            </Panel>
          </section>
          </ChartErrorBoundary>
          </DismissibleSection>
        ) : null}

        {visibleSectionSet.has("congestion") && congestionData ? (
          <DismissibleSection sectionId="congestion" onDismiss={removeSection}>
          <ChartErrorBoundary sectionName="連系線混雑度">
          <section className="grid grid-cols-1 gap-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <CompactStatCard
                label="最混雑線"
                value={congestionData.overallPeakLine.label || `${congestionData.overallPeakLine.sourceArea}→${congestionData.overallPeakLine.targetArea}`}
                detail={`ピーク ${congestionData.overallPeakLine.peakUtilization}%`}
              />
              <CompactStatCard
                label="ピーク利用率"
                value={`${congestionData.overallPeakLine.peakUtilization}%`}
                detail={`${decimalFmt.format(congestionData.overallPeakLine.peakAbsMw)} / ${numberFmt.format(congestionData.overallPeakLine.capacityMw)} MW`}
              />
              <CompactStatCard
                label="全線平均利用率"
                value={`${congestionData.overallAvgUtilization}%`}
                detail={`${congestionData.lines.length} 連系線`}
              />
              <CompactStatCard
                label="高混雑線(≥70%)"
                value={`${congestionData.highCongestionCount} 線`}
                detail={congestionData.highCongestionCount > 0 ? "要注意" : "正常"}
              />
            </div>

            {/* Utilization bar snapshot */}
            <Panel title="連系線 利用率スナップショット" testId="congestion-bars-panel">
              <p className="mb-3 text-xs text-slate-500">
                運用容量に対する潮流実績の比率（日中ピーク基準）。70%以上は混雑注意、85%以上は高混雑です。
              </p>
              <div className="flex flex-col gap-2.5">
                {congestionData.lines.map((line) => {
                  const pct = line.peakUtilization;
                  const barColor =
                    pct >= 85 ? "bg-red-500" :
                    pct >= 70 ? "bg-orange-500" :
                    pct >= 50 ? "bg-amber-400" :
                    "bg-emerald-500";
                  const textColor =
                    pct >= 85 ? "text-red-700 dark:text-red-400" :
                    pct >= 70 ? "text-orange-700 dark:text-orange-400" :
                    "text-slate-700 dark:text-slate-300";
                  return (
                    <div key={line.intertieName} className="group">
                      <div className="mb-0.5 flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">
                          {line.label || `${line.sourceArea}→${line.targetArea}`}
                        </span>
                        <span className={`shrink-0 text-xs font-semibold tabular-nums ${textColor}`}>
                          {pct}%
                          <span className="ml-1 font-normal text-slate-400">
                            ({decimalFmt.format(line.peakAbsMw)}/{numberFmt.format(line.capacityMw)} MW)
                          </span>
                        </span>
                      </div>
                      <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/80">
                        {/* Warning thresholds */}
                        <div className="absolute inset-y-0 left-[70%] w-px bg-orange-300/60 dark:bg-orange-600/40" />
                        <div className="absolute inset-y-0 left-[85%] w-px bg-red-300/60 dark:bg-red-600/40" />
                        {/* Utilization bar */}
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            {/* Time series chart */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {congestionTrendOption ? (
                <Panel title="利用率トレンド（時系列）" testId="congestion-trend-panel">
                  <p className="mb-1 text-xs text-slate-500">主要連系線の利用率（%）の時間推移。70%ラインは混雑注意の目安です。</p>
                  <div data-testid="congestion-trend-chart" role="img" aria-label="連系線利用率トレンドチャート">
                    <ReactECharts option={congestionTrendOption} style={{ height: 340 }} />
                  </div>
                </Panel>
              ) : null}
              {congestionHeatmapOption ? (
                <Panel title="混雑度ヒートマップ" testId="congestion-heatmap-panel">
                  <p className="mb-1 text-xs text-slate-500">全連系線 × 時間帯の利用率。赤いほど混雑しています。</p>
                  <div data-testid="congestion-heatmap-chart" role="img" aria-label="連系線混雑度ヒートマップ">
                    <ReactECharts option={congestionHeatmapOption} style={{ height: 340 }} />
                  </div>
                </Panel>
              ) : null}
            </div>
          </section>
          </ChartErrorBoundary>
          </DismissibleSection>
        ) : null}

        {visibleSectionSet.has("diagnostics") ? (
          <DismissibleSection sectionId="diagnostics" onDismiss={removeSection}>
          <ChartErrorBoundary sectionName="潮流ヒートマップ">
          <section className="grid grid-cols-1 gap-4">
            <Panel title="主要線路の潮流ヒートマップ">
              <p className="mb-2 text-xs text-slate-500">主要線路の時間帯別の潮流強度を俯瞰します。</p>
              <ReactECharts option={flowHeatmapOption} style={{ height: isMobileViewport ? 340 : 420 }} />
            </Panel>
          </section>
          </ChartErrorBoundary>
          </DismissibleSection>
        ) : null}

        {visibleSectionSet.has("diagnostics") ? (
          <ChartErrorBoundary sectionName="潮流変動率ヒートマップ">
          <section className="grid grid-cols-1 gap-4">
            <Panel title="潮流変動率が大きい送電線">
              <p className="mb-2 text-xs text-slate-500">変動係数（CV）上位18線路の平均比偏差を時間帯別に可視化。暖色＝平均より大きく、寒色＝平均より小さい時間帯。</p>
              <ReactECharts option={volatilityHeatmapOption} style={{ height: isMobileViewport ? 360 : 480 }} />
            </Panel>
          </section>
          </ChartErrorBoundary>
        ) : null}

        {visibleSectionSet.has("rankings") ? (
          <DismissibleSection sectionId="rankings" onDismiss={removeSection}>
          <ChartErrorBoundary sectionName="ランキング">
          <section className="rounded-3xl border border-white/70 bg-white/90 p-3 shadow-sm md:p-4 dark:border-slate-700 dark:bg-slate-800/90">
            <h2 className="mb-3 text-lg font-semibold">高発電ユニット上位</h2>
            <div className="-mx-2 overflow-x-auto px-2">
              <table className="min-w-full text-xs md:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="whitespace-nowrap py-2 pr-2 md:pr-3">エリア</th>
                    <th className="whitespace-nowrap py-2 pr-2 md:pr-3">発電所</th>
                    <th className="whitespace-nowrap py-2 pr-2 md:pr-3">ユニット</th>
                    <th className="whitespace-nowrap py-2 pr-2 md:pr-3">方式</th>
                    <th className="whitespace-nowrap py-2 text-right">日量(kWh)</th>
                    <th className="whitespace-nowrap py-2 text-right text-slate-400">参考:最大出力(万kW)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTopUnits.slice(0, 24).map((unit) => (
                    <tr key={`${unit.area}-${unit.plantName}-${unit.unitName}`} className="border-b border-slate-100">
                      <td className="whitespace-nowrap py-1.5 pr-2 md:py-2 md:pr-3">{unit.area}</td>
                      <td className="whitespace-nowrap py-1.5 pr-2 md:py-2 md:pr-3">{unit.plantName}</td>
                      <td className="whitespace-nowrap py-1.5 pr-2 md:py-2 md:pr-3">{unit.unitName}</td>
                      <td className="whitespace-nowrap py-1.5 pr-2 md:py-2 md:pr-3">{unit.sourceType}</td>
                      <td className="whitespace-nowrap py-1.5 text-right md:py-2">{numberFmt.format(unit.dailyKwh)}</td>
                      <td className="whitespace-nowrap py-1.5 text-right text-slate-400 md:py-2">
                        {typeof unit.maxOutputManKw === "number" ? manKwFmt.format(unit.maxOutputManKw) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 className="mb-3 mt-6 text-lg font-semibold">高発電発電所上位（ユニット合計）</h3>
            <div className="-mx-2 overflow-x-auto px-2">
              <table className="min-w-full text-xs md:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="whitespace-nowrap py-2 pr-2 md:pr-3">エリア</th>
                    <th className="whitespace-nowrap py-2 pr-2 md:pr-3">発電所</th>
                    <th className="whitespace-nowrap py-2 pr-2 md:pr-3">方式</th>
                    <th className="whitespace-nowrap py-2 text-right">最大出力(万kW)</th>
                    <th className="whitespace-nowrap py-2 text-right">日量(kWh)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTopPlants.slice(0, 24).map((plant) => (
                    <tr key={`${plant.area}-${plant.plantName}`} className="border-b border-slate-100">
                      <td className="whitespace-nowrap py-1.5 pr-2 md:py-2 md:pr-3">{plant.area}</td>
                      <td className="whitespace-nowrap py-1.5 pr-2 md:py-2 md:pr-3">{plant.plantName}</td>
                      <td className="whitespace-nowrap py-1.5 pr-2 md:py-2 md:pr-3">{plant.sourceType || "不明"}</td>
                      <td className="whitespace-nowrap py-1.5 text-right md:py-2">
                        {typeof plant.maxOutputManKw === "number" ? manKwFmt.format(plant.maxOutputManKw) : "-"}
                      </td>
                      <td className="whitespace-nowrap py-1.5 text-right md:py-2">{numberFmt.format(plant.dailyKwh)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          </ChartErrorBoundary>
          </DismissibleSection>
        ) : null}

        {/* ── 表示時刻スナップショット ── */}
        <section className="sticky top-0 z-30 rounded-3xl border border-teal-200/60 bg-gradient-to-r from-teal-50/95 to-white/95 px-3 py-2 shadow-md backdrop-blur-sm md:px-5 md:py-4 dark:border-teal-800/60 dark:from-teal-950/95 dark:to-slate-800/95">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-teal-800 dark:text-teal-300">表示時刻スナップショット</h2>
              <p className="hidden text-xs text-slate-600 md:block dark:text-slate-400">以下のカードはスライダーで選択した時刻のデータを表示します</p>
            </div>
            <div className="flex items-center gap-3">
              <span data-testid="selected-flow-datetime" className="text-sm font-medium text-teal-700 dark:text-teal-400">
                {selectedFlowDateTimeLabel}
              </span>
              <span className="text-xs text-slate-500">
                スロット {flowSlotLabels.length === 0 ? 0 : clampedNetworkFlowSlotIndex + 1} / {flowSlotLabels.length}
              </span>
            </div>
          </div>
          <div className="mt-2 md:mt-3">
            <input
              aria-label="ネットワーク潮流の表示時刻"
              type="range"
              min={0}
              max={maxFlowSlotIndex}
              step={1}
              value={clampedNetworkFlowSlotIndex}
              onChange={(event) => setNetworkFlowSlotIndex(Number(event.target.value))}
              disabled={flowSlotLabels.length === 0}
              className="w-full accent-teal-600"
            />
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>{flowSlotLabels[0] ?? "-"}</span>
              <span>{flowSlotLabels[maxFlowSlotIndex] ?? "-"}</span>
            </div>
          </div>
        </section>

        {visibleSectionSet.has("summary") ? (
          <DismissibleSection sectionId="summary" onDismiss={removeSection}>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <SummaryCard
              title="予備率監視"
              value={
                dashboardHighlights.lowestReserveArea
                  ? `${dashboardHighlights.lowestReserveArea.area} ${decimalFmt.format(
                      dashboardHighlights.lowestReserveArea.reserveRate,
                    )}%`
                  : "-"
              }
              detail={
                dashboardHighlights.lowestReserveArea
                  ? `表示時刻 ${selectedFlowDateTimeLabel}`
                  : "予備率データなし"
              }
              accentColor="#0f766e"
            >
              <MiniBarList items={dashboardHighlights.reserveWatchItems} />
            </SummaryCard>
            <SummaryCard
              title="需要ピーク"
              value={dashboardHighlights.peakDemandArea ? dashboardHighlights.peakDemandArea.area : "-"}
              detail={
                dashboardHighlights.peakDemandArea
                  ? `${decimalFmt.format(dashboardHighlights.peakDemandArea.demandMw)} MW / ${selectedFlowDateTimeLabel}`
                  : "需要データなし"
              }
              accentColor="#f77f00"
            >
              <MiniBarList items={dashboardHighlights.demandLeaderItems} />
            </SummaryCard>
            <SummaryCard
              title="連系潮流監視"
              value={
                dashboardHighlights.hottestIntertie
                  ? `${dashboardHighlights.hottestIntertie.sourceArea} ⇄ ${dashboardHighlights.hottestIntertie.targetArea}`
                  : "-"
              }
              detail={
                dashboardHighlights.hottestIntertie
                  ? `${decimalFmt.format(dashboardHighlights.hottestIntertie.magnitudeMw)} MW / ${selectedFlowDateTimeLabel}`
                  : "連系線データなし"
              }
              accentColor="#bc4749"
            >
              <MiniBarList items={dashboardHighlights.intertieWatchItems} />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <CompactStatCard
                  label="受電超過"
                  value={dashboardHighlights.strongestImportValue}
                  detail={dashboardHighlights.strongestImportDetail}
                />
                <CompactStatCard
                  label="送電超過"
                  value={dashboardHighlights.strongestExportValue}
                  detail={dashboardHighlights.strongestExportDetail}
                />
              </div>
            </SummaryCard>
          </section>
          </DismissibleSection>
        ) : null}

        {visibleSectionSet.has("areaCards") ? (
          <DismissibleSection sectionId="areaCards" onDismiss={removeSection}>
          <section className="rounded-3xl border border-white/70 bg-white/90 p-3 shadow-sm md:p-4">
            <div className="mb-3 flex flex-col gap-1 md:mb-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">エリア別需給カード</h2>
                <p className="text-sm text-slate-600">
                  {selectedArea === "全エリア"
                    ? `全${areaSupplyCards.length}エリアの需要、予備率、電源構成、連系収支を俯瞰`
                    : `${selectedArea} の需要、予備率、電源構成、連系収支を表示`}
                </p>
              </div>
              <p className="text-xs text-slate-500">連系値は {selectedFlowDateTimeLabel} 時点</p>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {areaSupplyCards.map((card) => {
                const areaColor = FLOW_AREA_COLORS[card.area] ?? FLOW_AREA_COLORS.default;
                const netDirection =
                  card.netIntertieMw > 0 ? "受電超過" : card.netIntertieMw < 0 ? "送電超過" : "概ね均衡";
                const peerDirection =
                  (card.peer?.signedMw ?? 0) > 0 ? "受電" : (card.peer?.signedMw ?? 0) < 0 ? "送電" : "均衡";
                return (
                  <article
                    key={card.area}
                    className="overflow-hidden rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(244,248,247,0.96))] shadow-sm"
                  >
                    <div className="h-1.5" style={{ backgroundColor: areaColor }} />
                    <div className="p-3 md:p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-flex h-3 w-3 rounded-full"
                              style={{ backgroundColor: areaColor }}
                            />
                            <h3 className="text-xl font-semibold text-slate-900">{card.area}</h3>
                            <ReserveRateBadge reserveRate={card.reserveRate} />
                          </div>
                          <p className="mt-1 text-sm text-slate-600">全国発電シェア {card.sharePercent.toFixed(1)}%</p>
                          <div className="mt-2 max-w-sm">
                            <ValueProgressBar value={card.sharePercent} max={100} color={areaColor} />
                          </div>
                        </div>
                        <div className="rounded-2xl bg-slate-900 px-3 py-2 text-white shadow-sm md:px-4 md:py-3">
                          <p className="text-xs tracking-[0.16em] text-slate-300">日量発電</p>
                          <p className="mt-1 text-xl font-semibold md:text-2xl">{formatCompactEnergy(card.totalKwh)}</p>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs tracking-[0.16em] text-slate-500">需給バランス</p>
                            <p className="text-xs text-slate-500">{selectedFlowSlotLabel} 時点</p>
                          </div>
                          <div className="mt-3">
                            <SupplyDemandMeter
                              demandMw={card.demandMw}
                              supplyMw={card.supplyMw}
                              reserveMw={card.reserveMw}
                              reserveRate={card.reserveRate}
                              color={areaColor}
                            />
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs tracking-[0.16em] text-slate-500">電源構成</p>
                            <p className="text-xs text-slate-500">
                              主力 {normalizeSourceName(card.topSource)} {card.topSourceShare.toFixed(1)}%
                            </p>
                          </div>
                          <div className="mt-3">
                            <SegmentedBar segments={card.sourceMix} />
                          </div>
                          <div className="mt-3 space-y-2">
                            {card.sourceMix.slice(0, 3).map((segment) => (
                              <div key={`${card.area}-${segment.label}`} className="flex items-center justify-between gap-3 text-sm">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                                  <span className="truncate text-slate-700">{segment.label}</span>
                                </div>
                                <span className="shrink-0 text-slate-500">
                                  {decimalFmt.format(segment.percent)}% / {formatCompactEnergy(segment.value)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                          <p className="text-xs tracking-[0.16em] text-slate-500">連系収支</p>
                          <div className="mt-3">
                            <NetFlowMeter
                              valueMw={card.netIntertieMw}
                              maxAbsMw={maxAreaNetIntertieAbsMw}
                              color={areaColor}
                            />
                          </div>
                          <p className="mt-3 text-base font-semibold text-slate-900">{netDirection}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            {decimalFmt.format(Math.abs(card.netIntertieMw))} MW
                          </p>
                        </div>
                        <CompactStatCard
                          label="最大相手先"
                          value={card.peer ? card.peer.counterpart : "-"}
                          detail={
                            card.peer
                              ? `${peerDirection} ${decimalFmt.format(Math.abs(card.peer.signedMw))} MW`
                              : "連系データなし"
                          }
                          className="h-full"
                        />
                        <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                          <p className="text-xs tracking-[0.16em] text-slate-500">地域内ピーク</p>
                          <div className="mt-3">
                            <ValueProgressBar value={card.peakAbsMw} max={maxAreaPeakAbsMw} color={areaColor} />
                          </div>
                          <p className="mt-3 text-base font-semibold text-slate-900">
                            {decimalFmt.format(card.peakAbsMw)} MW
                          </p>
                          <p className="mt-1 text-sm text-slate-600">地内送電線の最大|潮流|</p>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                        <p className="text-xs tracking-[0.16em] text-slate-500">主要発電所</p>
                        <p className="mt-1 text-base font-semibold text-slate-900">
                          {card.primaryPlant?.plantName ?? "-"}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {card.primaryPlant
                            ? `${card.primaryPlant.sourceType || "不明"} / ${formatCompactEnergy(card.primaryPlant.dailyKwh)}`
                            : "発電所データなし"}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
          </DismissibleSection>
        ) : null}

        {visibleSectionSet.has("reserve") ? (
          <DismissibleSection sectionId="reserve" onDismiss={removeSection}>
          <ChartErrorBoundary sectionName="需要・予備力スナップショット">
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="エリア需要（表示時刻）" testId="demand-current-panel">
              <div className="mb-2 text-xs text-slate-600">表示日時: {selectedFlowDateTimeLabel}</div>
              <div data-testid="demand-current-chart" role="img" aria-label="エリア需要チャート">
                <ReactECharts option={demandCurrentOption} style={{ height: 320 }} />
              </div>
            </Panel>
            <Panel title="エリア予備力（表示時刻）" testId="reserve-current-panel">
              <div className="mb-2 text-xs text-slate-600">表示日時: {selectedFlowDateTimeLabel}</div>
              <div data-testid="reserve-current-chart" role="img" aria-label="エリア予備力チャート">
                <ReactECharts option={reserveCurrentOption} style={{ height: 320 }} />
              </div>
            </Panel>
          </section>
          </ChartErrorBoundary>
          </DismissibleSection>
        ) : null}

        {visibleSectionSet.has("network") ? (
          <DismissibleSection sectionId="network" onDismiss={removeSection}>
          <ChartErrorBoundary sectionName="ネットワーク">
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Panel title="エリアネットワーク潮流（地域内送電線）" className="lg:col-span-2" testId="network-flow-panel">
              <div className="mb-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
                <p className="text-[11px] text-slate-600">
                  注: 地域内送電線は、公開CSVから端点を特定できるもののみ表示しています。エリア間連係線は、端点を特定できるものは設備間リンク（SS・CS・変換所間）として、それ以外はエリア間の簡略線として表示しています。発電所と変電所の接続は公開データだけでは確定できないため、省略しています。
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  各エリアの主要潮流を水色の破線アニメーションで表示しています。エリア間連係線は混雑度に応じて色分け表示：緑(&lt;50%)→黄(50-70%)→橙(70-85%)→赤(≥85%)。運用容量データがない線は橙色（交流）・紫色（直流）で表示します。
                </p>
              </div>
              <div data-testid="network-flow-chart" role="img" aria-label="ネットワーク潮流グラフ" className="relative" ref={networkFlowChartHostRef}>
                <ReactECharts
                  option={flowNetworkOption}
                  style={{ height: isMobileViewport ? 420 : 620 }}
                  onChartReady={registerNetworkFlowChart}
                  onEvents={{
                    finished: (_event: unknown, chart: unknown) => registerNetworkFlowChart(chart),
                    graphRoam: (_event: unknown, chart: unknown) => registerNetworkFlowChart(chart),
                  }}
                />
                <svg
                  data-testid="network-flow-overlay-svg"
                  className="pointer-events-none absolute inset-0 z-10"
                  viewBox={`0 0 ${networkOverlayViewport.width} ${networkOverlayViewport.height}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <g
                    data-testid="network-flow-overlay-roam"
                    transform={formatSvgMatrixTransform(networkOverlayViewport.roam)}
                  >
                    <g transform={formatSvgMatrixTransform(networkOverlayViewport.raw)}>
                      {japanGuidePaths.map((island) => (
                        <path
                          key={island.name}
                          d={island.d}
                          fill="rgba(203,213,225,0.12)"
                          stroke="rgba(148,163,184,0.22)"
                          strokeWidth={1}
                          strokeLinejoin="round"
                        />
                      ))}
                      {majorFlowAnimationPaths.map((path) => {
                        const glowColor = flowMagnitudeColor(path.magnitude, 0.38);
                        const dashColor = flowMagnitudeColor(path.magnitude, 0.92);
                        const shadowColor = flowMagnitudeColor(path.magnitude, 0.95);
                        return (
                          <g key={path.id}>
                            <path
                              d={path.d}
                              fill="none"
                              stroke={glowColor}
                              strokeWidth={path.strokeWidth + 0.8}
                              strokeLinecap="round"
                            />
                            <path
                              d={path.d}
                              fill="none"
                              stroke={dashColor}
                              strokeWidth={path.strokeWidth}
                              strokeLinecap="round"
                              strokeDasharray="14 13"
                              style={{
                                animation: `network-flow-dash ${path.durationSeconds}s linear infinite`,
                                animationDelay: `-${path.delaySeconds}s`,
                                filter: `drop-shadow(0 0 2px ${shadowColor})`,
                              }}
                            />
                          </g>
                        );
                      })}
                      {intertieAnimationPaths.map((path) => {
                        const isDc = path.currentType === "dc";
                        const pct = path.congestionPct ?? -1;
                        // Use congestion-based coloring when data is available
                        const useCongestionColor = pct >= 0;
                        let glowColor: string;
                        let dashColor: string;
                        let shadowColor: string;
                        if (useCongestionColor) {
                          // Green → Yellow → Orange → Red based on utilization
                          const congestionColor =
                            pct >= 85 ? { r: 239, g: 68, b: 68 }   // red-500
                            : pct >= 70 ? { r: 249, g: 115, b: 22 }  // orange-500
                            : pct >= 50 ? { r: 245, g: 158, b: 11 }  // amber-500
                            : { r: 16, g: 185, b: 129 };             // emerald-500
                          glowColor = `rgba(${congestionColor.r},${congestionColor.g},${congestionColor.b},0.3)`;
                          dashColor = `rgba(${congestionColor.r},${congestionColor.g},${congestionColor.b},0.9)`;
                          shadowColor = `rgba(${congestionColor.r},${congestionColor.g},${congestionColor.b},0.95)`;
                        } else {
                          glowColor = isDc
                            ? `rgba(192,38,211,${0.22 + path.magnitude * 0.18})`
                            : `rgba(234,88,12,${0.22 + path.magnitude * 0.18})`;
                          dashColor = isDc
                            ? `rgba(192,38,211,${0.7 + path.magnitude * 0.25})`
                            : `rgba(234,88,12,${0.7 + path.magnitude * 0.25})`;
                          shadowColor = isDc
                            ? "rgba(192,38,211,0.9)"
                            : "rgba(234,88,12,0.9)";
                        }
                        return (
                          <g key={path.id}>
                            <path
                              d={path.d}
                              fill="none"
                              stroke={glowColor}
                              strokeWidth={path.strokeWidth + 1.8}
                              strokeLinecap="round"
                            />
                            <path
                              d={path.d}
                              fill="none"
                              stroke={dashColor}
                              strokeWidth={path.strokeWidth}
                              strokeLinecap="round"
                              strokeDasharray={isDc ? "10 12" : "18 14"}
                              style={{
                                animation: `network-flow-dash ${path.durationSeconds}s linear infinite`,
                                animationDelay: `-${path.delaySeconds}s`,
                                filter: `drop-shadow(0 0 3px ${shadowColor})`,
                              }}
                            />
                            {useCongestionColor ? (
                              <title>{path.label} ({pct}%)</title>
                            ) : null}
                          </g>
                        );
                      })}
                    </g>
                  </g>
                </svg>
              </div>
            </Panel>
            <Panel title="エリア間連系潮流（実績）" testId="inter-area-flow-panel">
              <div className="mb-2 text-xs text-slate-600">表示日時: {selectedFlowDateTimeLabel}</div>
              <div data-testid="inter-area-flow-chart" role="img" aria-label="エリア間連系潮流チャート">
                <ReactECharts option={interAreaFlowOption} style={{ height: isMobileViewport ? 520 : 594 }} />
              </div>
            </Panel>
          </section>
          </ChartErrorBoundary>
          </DismissibleSection>
        ) : null}

        {/* ── 非表示セクション復元バー ── */}
        {hiddenSections.length > 0 ? (
          <div className="fixed right-4 bottom-4 left-4 z-40 mx-auto max-w-2xl animate-[slideUp_0.2s_ease-out] rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-3 shadow-lg backdrop-blur-sm dark:border-slate-700/80 dark:bg-slate-800/95">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400">
                非表示中:
              </span>
              {hiddenSections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => restoreSection(s.id)}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 transition hover:border-teal-400 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:border-teal-500 dark:hover:bg-teal-900/40 dark:hover:text-teal-400"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                    <path fillRule="evenodd" d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2Z" clipRule="evenodd" />
                  </svg>
                  {s.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setVisibleSectionIds(DASHBOARD_SECTION_OPTIONS.map((item) => item.id))}
                className="ml-auto shrink-0 rounded-full border border-teal-300 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700 transition hover:bg-teal-100 dark:border-teal-600 dark:bg-teal-900/40 dark:text-teal-400 dark:hover:bg-teal-900/60"
              >
                すべて復元
              </button>
            </div>
          </div>
        ) : null}

        {/* Footer */}
        <footer className="mt-8 border-t border-slate-200/60 pt-4 pb-2 text-center text-[11px] leading-relaxed text-slate-400 dark:border-slate-700/60 dark:text-slate-500">
          <p>
            本サイトは
            <a
              href="https://www.occto.or.jp/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-600 dark:hover:text-slate-300"
            >
              電力広域的運営推進機関（OCCTO）
            </a>
            が公開するデータをもとに作成した非公式の可視化ダッシュボードです。
          </p>
          <p className="mt-1">
            正確な情報は必ず
            <a
              href="https://www.occto.or.jp/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-600 dark:hover:text-slate-300"
            >
              広域機関の公式ページ
            </a>
            をご確認ください。
          </p>
        </footer>
      </div>
    </div>
  );
}

