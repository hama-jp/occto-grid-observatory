"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, type ReactNode } from "react";
import type { DashboardData } from "@/lib/dashboard-types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const numberFmt = new Intl.NumberFormat("ja-JP");
const decimalFmt = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });
const manKwFmt = new Intl.NumberFormat("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type DashboardAppProps = {
  data: DashboardData;
};

const SOURCE_COLORS = [
  "#0b525b",
  "#197278",
  "#2d6a4f",
  "#f77f00",
  "#f4a261",
  "#d62828",
  "#1d3557",
  "#6c757d",
  "#2a9d8f",
];

const FLOW_AREA_COLORS: Record<string, string> = {
  北海道: "#355070",
  東北: "#4f6d7a",
  東京: "#f77f00",
  中部: "#2a9d8f",
  北陸: "#3a86ff",
  関西: "#f4a261",
  中国: "#bc4749",
  四国: "#6a4c93",
  九州: "#e76f51",
  沖縄: "#00afb9",
  default: "#577590",
};

const AREA_ANCHORS: Record<string, { x: number; y: number }> = {
  北海道: { x: 760, y: 82 },
  東北: { x: 695, y: 155 },
  東京: { x: 724, y: 236 },
  中部: { x: 620, y: 292 },
  北陸: { x: 598, y: 220 },
  関西: { x: 540, y: 342 },
  中国: { x: 436, y: 366 },
  四国: { x: 482, y: 426 },
  九州: { x: 360, y: 462 },
  沖縄: { x: 230, y: 520 },
  default: { x: 610, y: 300 },
};

const MAP_CORRIDOR_ORDER = ["沖縄", "九州", "中国", "関西", "中部", "東京", "東北", "北海道"];
const MAP_VIEWBOX = {
  width: 920,
  height: 560,
  padding: 30,
};

export function DashboardApp({ data }: DashboardAppProps) {
  const areas = useMemo(() => {
    const set = new Set<string>();
    data.generation.areaTotals.forEach((item) => set.add(item.area));
    data.flows.areaSummaries.forEach((item) => set.add(item.area));
    return ["全エリア", ...Array.from(set)];
  }, [data]);
  const generationAreas = useMemo(
    () => ["全エリア", ...data.generation.areaTotals.map((item) => item.area)],
    [data.generation.areaTotals],
  );

  const [selectedArea, setSelectedArea] = useState<string>("全エリア");
  const [generationTrendArea, setGenerationTrendArea] = useState<string>("全エリア");
  const [sourceDonutArea, setSourceDonutArea] = useState<string>("全エリア");

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

  const filteredTopUnits = useMemo(
    () =>
      data.generation.topUnits.filter((unit) =>
        selectedArea === "全エリア" ? true : unit.area === selectedArea,
      ),
    [data.generation.topUnits, selectedArea],
  );

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
      grid: { top: 48, left: 48, right: 20, bottom: 36 },
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
        color: SOURCE_COLORS[idx % SOURCE_COLORS.length],
        data: scopedSeries.map((point) => point.values[source] ?? 0),
      })),
    };
  }, [data.generation.hourlyBySource, data.generation.hourlyBySourceByArea, data.meta.slotLabels.generation, generationTrendArea]);

  const sourceDonutOption = useMemo(() => {
    const rows =
      sourceDonutArea === "全エリア"
        ? data.generation.sourceTotals
        : (sourceTotalsByArea[sourceDonutArea] ?? []);

    return {
      tooltip: { trigger: "item" },
      legend: {
        type: "scroll",
        orient: "vertical",
        left: "58%",
        top: "middle",
        bottom: 8,
        itemGap: 10,
        textStyle: { color: "#264653" },
        formatter: (name: string) => normalizeSourceName(name),
      },
      series: [
        {
          name: "発電方式",
          type: "pie",
          radius: ["45%", "72%"],
          center: ["30%", "50%"],
          avoidLabelOverlap: true,
          label: {
            formatter: (params: { percent?: number; name: string }) => {
              const percent = params.percent ?? 0;
              if (percent < 4) {
                return "";
              }
              return `${normalizeSourceName(params.name)}\n${percent.toFixed(0)}%`;
            },
            color: "#1b3a4b",
          },
          labelLine: {
            length: 10,
            length2: 8,
          },
          data: rows.map((item, idx) => ({
            name: normalizeSourceName(item.source),
            value: item.totalKwh,
            itemStyle: { color: SOURCE_COLORS[idx % SOURCE_COLORS.length] },
          })),
        },
      ],
    };
  }, [data.generation.sourceTotals, sourceDonutArea, sourceTotalsByArea]);

  const areaTotalsOption = useMemo(
    () => ({
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { top: 18, left: 74, right: 18, bottom: 30 },
      xAxis: {
        type: "value",
        axisLabel: { formatter: (v: number) => `${Math.round(v / 1_000_000)}M` },
      },
      yAxis: {
        type: "category",
        data: data.generation.areaTotals.map((item) => item.area),
        axisLabel: { color: "#4a5568" },
      },
      series: [
        {
          type: "bar",
          data: data.generation.areaTotals.map((item, idx) => ({
            value: item.totalKwh,
            itemStyle: {
              color: idx % 2 === 0 ? "#2a9d8f" : "#1d3557",
              borderRadius: [0, 6, 6, 0],
            },
          })),
        },
      ],
    }),
    [data.generation.areaTotals],
  );

  const flowHeatmapOption = useMemo(() => {
    const topLines = filteredLines.slice(0, 18);
    const yLabels = topLines.map((line) => `${line.area} | ${line.lineName}`);
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
      grid: { top: 20, left: 160, right: 20, bottom: 44 },
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
      visualMap: {
        min: -800,
        max: 800,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
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
  }, [data.meta.slotLabels.flow, filteredLines]);

  const flowNetworkOption = useMemo(() => {
    type NetworkLink = {
      kind: "intra" | "intertie" | "anchor";
      source: string;
      target: string;
      value: number;
      absAvgMw: number;
      area?: string;
      lineName?: string;
      intertieName?: string;
      voltageKv?: string;
      positiveDirection?: string;
      peakAbsMw?: number;
      sourceArea?: string;
      targetArea?: string;
    };

    const scopedInterties = (data.flows.intertieSeries ?? []).filter((row) =>
      selectedArea === "全エリア" ? true : row.sourceArea === selectedArea || row.targetArea === selectedArea,
    );

    const visibleAreas = new Set<string>();
    const stationsByArea = new Map<string, Set<string>>();
    const nodeDegree = new Map<string, number>();
    const links: NetworkLink[] = [];

    filteredLines.forEach((line) => {
      const direction = parseDirection(line.positiveDirection);
      if (!direction) {
        return;
      }
      visibleAreas.add(line.area);

      const sourceName = line.avgMw >= 0 ? direction.source : direction.target;
      const targetName = line.avgMw >= 0 ? direction.target : direction.source;
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
        value: line.avgMw,
        absAvgMw: Math.abs(line.avgMw),
        area: line.area,
        lineName: line.lineName,
        voltageKv: line.voltageKv,
        positiveDirection: line.positiveDirection,
        peakAbsMw: line.peakAbsMw,
      });
    });

    scopedInterties.forEach((line) => {
      visibleAreas.add(line.sourceArea);
      visibleAreas.add(line.targetArea);

      const sourceAreaId = buildAreaNodeId(line.sourceArea);
      const targetAreaId = buildAreaNodeId(line.targetArea);
      const source = line.avgMw >= 0 ? sourceAreaId : targetAreaId;
      const target = line.avgMw >= 0 ? targetAreaId : sourceAreaId;

      nodeDegree.set(sourceAreaId, (nodeDegree.get(sourceAreaId) ?? 0) + 1);
      nodeDegree.set(targetAreaId, (nodeDegree.get(targetAreaId) ?? 0) + 1);

      links.push({
        kind: "intertie",
        source,
        target,
        value: line.avgMw,
        absAvgMw: line.avgAbsMw,
        intertieName: line.intertieName,
        peakAbsMw: line.peakAbsMw,
        sourceArea: line.sourceArea,
        targetArea: line.targetArea,
      });
    });

    if (selectedArea === "全エリア" && visibleAreas.size === 0) {
      data.flows.areaSummaries.forEach((row) => visibleAreas.add(row.area));
    }
    if (selectedArea !== "全エリア") {
      visibleAreas.add(selectedArea);
    }

    const areaCategories = Array.from(visibleAreas).sort(compareAreaOrder);
    const categoryIndex = new Map(areaCategories.map((area, index) => [area, index]));
    const stationPositions = buildStationLayout(stationsByArea);
    const stationLabelIds = new Set(
      Array.from(nodeDegree.entries())
        .filter(([nodeId, degree]) => nodeId.startsWith("station::") && degree >= (selectedArea === "全エリア" ? 4 : 2))
        .sort((a, b) => b[1] - a[1])
        .slice(0, selectedArea === "全エリア" ? 52 : 96)
        .map(([nodeId]) => nodeId),
    );

    const nodes: Array<Record<string, unknown>> = [];
    areaCategories.forEach((area) => {
      const areaNodeId = buildAreaNodeId(area);
      const anchor = AREA_ANCHORS[area] ?? AREA_ANCHORS.default;
      const degree = nodeDegree.get(areaNodeId) ?? 0;
      nodes.push({
        id: areaNodeId,
        name: area,
        area,
        category: categoryIndex.get(area) ?? 0,
        value: degree,
        isAreaHub: true,
        x: anchor.x,
        y: anchor.y,
        fixed: true,
        symbolSize: 18 + Math.min(12, degree * 1.2),
        itemStyle: {
          color: FLOW_AREA_COLORS[area] ?? FLOW_AREA_COLORS.default,
          borderColor: "#ffffff",
          borderWidth: 2,
          shadowBlur: 8,
          shadowColor: "rgba(30, 41, 59, 0.18)",
        },
      });
    });

    stationsByArea.forEach((stationSet, area) => {
      const areaNodeId = buildAreaNodeId(area);
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
            isAreaHub: false,
            shouldLabel: stationLabelIds.has(stationNodeId),
            x: position.x,
            y: position.y,
            symbolSize: 6.5 + Math.min(9, degree * 1.4),
            itemStyle: {
              color: FLOW_AREA_COLORS[area] ?? FLOW_AREA_COLORS.default,
              borderColor: "#ffffff",
              borderWidth: 1,
            },
          });

          links.push({
            kind: "anchor",
            source: areaNodeId,
            target: stationNodeId,
            value: 0,
            absAvgMw: 0,
            area,
          });
        });
    });

    const maxAbsIntra = Math.max(
      ...links.filter((line) => line.kind === "intra").map((line) => line.absAvgMw),
      1,
    );
    const maxAbsIntertie = Math.max(
      ...links.filter((line) => line.kind === "intertie").map((line) => line.absAvgMw),
      1,
    );

    const renderedLinks = links.map((line) => {
      if (line.kind === "anchor") {
        return {
          ...line,
          lineStyle: {
            width: 0.8,
            opacity: 0.2,
            curveness: 0,
            color: "rgba(148, 163, 184, 0.5)",
            type: "dashed",
          },
          emphasis: { disabled: true },
          tooltip: { show: false },
          silent: true,
        };
      }

      if (line.kind === "intertie") {
        const ratio = line.absAvgMw / maxAbsIntertie;
        return {
          ...line,
          lineStyle: {
            width: 2.8 + ratio * 4.8,
            opacity: 0.86,
            curveness: 0.12,
            color: line.value >= 0 ? "#ef4444" : "#1d4ed8",
          },
          z: 4,
        };
      }

      const ratio = line.absAvgMw / maxAbsIntra;
      return {
        ...line,
        lineStyle: {
          width: 0.7 + ratio * 2.8,
          opacity: 0.58,
          curveness: 0.06,
          color: line.value >= 0 ? "rgba(249,115,22,0.9)" : "rgba(30,64,175,0.9)",
        },
        z: 2,
      };
    });

    const guideGraphics = buildJapanGuideGraphics();

    return {
      animationDurationUpdate: 360,
      tooltip: {
        trigger: "item",
        confine: true,
        formatter: (params: {
          dataType: "node" | "edge";
          name: string;
          data: {
            kind?: "intra" | "intertie" | "anchor";
            value: number;
            area?: string;
            lineName?: string;
            intertieName?: string;
            voltageKv?: string;
            positiveDirection?: string;
            peakAbsMw?: number;
            sourceArea?: string;
            targetArea?: string;
            isAreaHub?: boolean;
          };
        }) => {
          if (params.dataType === "edge") {
            if (params.data.kind === "intertie") {
              return `${params.data.intertieName}<br/>区分: 連系線<br/>接続: ${params.data.sourceArea} ⇄ ${
                params.data.targetArea
              }<br/>平均潮流: ${decimalFmt.format(params.data.value)} MW<br/>最大|潮流|: ${numberFmt.format(
                params.data.peakAbsMw ?? 0,
              )} MW`;
            }
            if (params.data.kind === "intra") {
              return `${params.data.area} | ${params.data.lineName}<br/>区分: 地域内送電線<br/>定義方向: ${
                params.data.positiveDirection
              }<br/>平均潮流: ${decimalFmt.format(params.data.value)} MW<br/>最大|潮流|: ${numberFmt.format(
                params.data.peakAbsMw ?? 0,
              )} MW<br/>電圧: ${params.data.voltageKv}`;
            }
            return "";
          }

          if (params.data.isAreaHub) {
            return `${params.data.area ?? params.name}<br/>接続本数: ${numberFmt.format(params.data.value)} 本`;
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
      graphic: guideGraphics,
      series: [
        {
          type: "graph",
          layout: "none",
          roam: true,
          draggable: true,
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
          edgeSymbol: ["none", "none"],
          lineStyle: {
            opacity: 0.72,
          },
          label: {
            show: true,
            formatter: (params: {
              data: { isAreaHub?: boolean; shouldLabel?: boolean; value?: number };
              name: string;
            }) => {
              if (params.data.isAreaHub) {
                return params.name;
              }
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
  }, [data.flows.areaSummaries, data.flows.intertieSeries, filteredLines, selectedArea]);

  const interAreaFlowOption = useMemo(() => {
    const baseRows = data.flows.interAreaFlows ?? [];
    const filteredRows = baseRows
      .filter((row) =>
        selectedArea === "全エリア" ? true : row.sourceArea === selectedArea || row.targetArea === selectedArea,
      )
      .slice(0, selectedArea === "全エリア" ? 12 : 20);
    const hasData = filteredRows.length > 0;

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: Array<{ data: { row: (typeof filteredRows)[number] } }>) => {
          const row = params[0]?.data?.row;
          if (!row) {
            return "";
          }
          return `${row.sourceArea} ⇄ ${row.targetArea}<br/>平均|潮流|: ${decimalFmt.format(
            row.avgAbsMw,
          )} MW<br/>平均潮流(符号付): ${decimalFmt.format(row.avgMw)} MW<br/>最大|潮流|: ${numberFmt.format(
            row.peakAbsMw,
          )} MW<br/>連系線: ${row.intertieNames.join(" / ")}`;
        },
      },
      grid: { top: 20, left: 128, right: 20, bottom: 24 },
      xAxis: {
        type: "value",
        axisLabel: { formatter: (value: number) => `${Math.round(value)} MW` },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: filteredRows.map((row) => `${row.sourceArea} ⇄ ${row.targetArea}`),
        axisLabel: { color: "#334155", fontSize: 11 },
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
          data: filteredRows.map((row) => ({
            value: row.avgAbsMw,
            row,
            itemStyle: {
              color: FLOW_AREA_COLORS[row.sourceArea] ?? FLOW_AREA_COLORS.default,
              borderRadius: [0, 5, 5, 0],
            },
          })),
          label: {
            show: true,
            position: "right",
            formatter: (params: { data: { row: (typeof filteredRows)[number] } }) =>
              `${decimalFmt.format(params.data.row.avgMw)} MW`,
            color: "#334155",
            fontSize: 10,
          },
        },
      ],
    };
  }, [data.flows.interAreaFlows, selectedArea]);

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
      grid: { top: 58, left: 52, right: 20, bottom: 34 },
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
                lineStyle: { width: 3, color: "#111827", type: "dashed" },
              },
            ]
          : []),
        ...topSeries.map((row) => ({
          name: `${row.sourceArea}→${row.targetArea}`,
          type: "line",
          data: row.values,
          smooth: true,
          symbol: "none",
          lineStyle: {
            width: 2.3,
            color: FLOW_AREA_COLORS[row.sourceArea] ?? FLOW_AREA_COLORS.default,
          },
        })),
      ],
    };
  }, [data.flows.intertieSeries, data.meta.slotLabels.flow, selectedArea]);

  const areaBalanceOption = useMemo(
    () => ({
      tooltip: {
        formatter: (params: { data: [number, number, number, string] }) => {
          const [dailyKwh, peakAbsMw, stress, area] = params.data;
          return `${area}<br/>日量: ${numberFmt.format(dailyKwh)} kWh<br/>最大|潮流|: ${numberFmt.format(
            peakAbsMw,
          )} MW<br/>Stress: ${stress}`;
        },
      },
      xAxis: {
        name: "日量発電(kWh)",
        axisLabel: { formatter: (v: number) => `${Math.round(v / 1_000_000)}M` },
      },
      yAxis: {
        name: "最大|潮流|(MW)",
      },
      series: [
        {
          type: "scatter",
          symbolSize: (value: [number, number, number]) => 12 + value[2] * 3,
          itemStyle: { color: "#1d3557" },
          data: data.insights.areaBalance.map((item) => [
            item.dailyKwh,
            item.peakAbsMw,
            item.stressIndex,
            item.area,
          ]),
        },
      ],
    }),
    [data.insights.areaBalance],
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f4f1de_0%,_#f6f8fb_38%,_#e9f5f2_100%)] text-slate-800">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-4 py-6 md:px-8">
        <header className="rounded-3xl border border-white/70 bg-white/80 px-5 py-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs tracking-[0.18em] text-teal-700">OCCTO GRID OBSERVATORY</p>
              <h1 className="text-2xl font-semibold leading-tight md:text-3xl">
                送電潮流 × ユニット発電実績 ダッシュボード
              </h1>
              <p className="text-sm text-slate-600">
                対象日: {data.meta.targetDate} / 最終取り込み:{" "}
                {new Date(data.meta.fetchedAt).toLocaleString("ja-JP")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="area" className="text-sm font-medium text-slate-600">
                エリア
              </label>
              <select
                id="area"
                className="rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
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
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel title="発電方式別 30分推移" className="lg:col-span-2">
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
            <ReactECharts option={generationLineOption} style={{ height: 360 }} />
          </Panel>
          <Panel title="発電方式 構成比">
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
            <ReactECharts option={sourceDonutOption} style={{ height: 360 }} />
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="エリア別 日量発電">
            <ReactECharts option={areaTotalsOption} style={{ height: 320 }} />
          </Panel>
          <Panel title="連系線潮流トレンド（時系列）">
            <ReactECharts option={intertieTrendOption} style={{ height: 320 }} />
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel title="エリアネットワーク潮流（連系線＋地域内送電線）" className="lg:col-span-2">
            <ReactECharts option={flowNetworkOption} style={{ height: 620 }} />
          </Panel>
          <Panel title="エリア間連系潮流（実績）">
            <ReactECharts option={interAreaFlowOption} style={{ height: 620 }} />
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel title="主要線路の潮流ヒートマップ" className="lg:col-span-2">
            <ReactECharts option={flowHeatmapOption} style={{ height: 420 }} />
          </Panel>
          <Panel title="エリア負荷バランス">
            <ReactECharts option={areaBalanceOption} style={{ height: 420 }} />
          </Panel>
        </section>

        <section className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">高発電ユニット上位</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-3">エリア</th>
                  <th className="py-2 pr-3">発電所</th>
                  <th className="py-2 pr-3">ユニット</th>
                  <th className="py-2 pr-3">方式</th>
                  <th className="py-2 text-right">最大出力(万kW)</th>
                  <th className="py-2 text-right">日量(kWh)</th>
                </tr>
              </thead>
              <tbody>
                {filteredTopUnits.slice(0, 24).map((unit) => (
                  <tr key={`${unit.area}-${unit.plantName}-${unit.unitName}`} className="border-b border-slate-100">
                    <td className="py-2 pr-3">{unit.area}</td>
                    <td className="py-2 pr-3">{unit.plantName}</td>
                    <td className="py-2 pr-3">{unit.unitName}</td>
                    <td className="py-2 pr-3">{unit.sourceType}</td>
                    <td className="py-2 text-right">
                      {typeof unit.maxOutputManKw === "number" ? manKwFmt.format(unit.maxOutputManKw) : "-"}
                    </td>
                    <td className="py-2 text-right">{numberFmt.format(unit.dailyKwh)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function Panel({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-3xl border border-white/70 bg-white/90 p-4 shadow-sm ${className ?? ""}`}>
      <h2 className="mb-2 text-base font-semibold text-slate-800">{title}</h2>
      {children}
    </section>
  );
}

function parseDirection(
  rawDirection: string,
): {
  source: string;
  target: string;
} | null {
  const normalized = rawDirection.replace(/\s+/g, " ").trim();
  const parts = normalized.split(/\s*(?:→|⇒|⇢|->|＞)\s*/).map((part) => part.trim());
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return { source: parts[0], target: parts[1] };
}

function buildAreaNodeId(area: string): string {
  return `area::${area.trim()}`;
}

function buildStationNodeId(area: string, station: string): string {
  return `station::${area.trim()}::${station.trim()}`;
}

function buildStationLayout(stationsByArea: Map<string, Set<string>>): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  stationsByArea.forEach((stations, area) => {
    const anchor = AREA_ANCHORS[area] ?? AREA_ANCHORS.default;
    const sorted = Array.from(stations).sort((a, b) => a.localeCompare(b, "ja-JP"));
    const ringCapacity = 18;
    const phase = ((hashSeed(area) % 360) * Math.PI) / 180;

    sorted.forEach((station, index) => {
      const ring = Math.floor(index / ringCapacity);
      const idxInRing = index % ringCapacity;
      const ringCount = Math.min(ringCapacity, sorted.length - ring * ringCapacity);
      const jitter = ((hashSeed(`${area}-${station}`) % 9) - 4) * 0.8;
      const angle = phase + (Math.PI * 2 * idxInRing) / Math.max(ringCount, 1);
      const radiusX = 34 + ring * 18;
      const radiusY = 22 + ring * 14;

      positions.set(buildStationNodeId(area, station), {
        x: clamp(
          anchor.x + Math.cos(angle) * (radiusX + jitter),
          MAP_VIEWBOX.padding,
          MAP_VIEWBOX.width - MAP_VIEWBOX.padding,
        ),
        y: clamp(
          anchor.y + Math.sin(angle) * (radiusY + jitter * 0.7),
          MAP_VIEWBOX.padding,
          MAP_VIEWBOX.height - MAP_VIEWBOX.padding,
        ),
      });
    });
  });

  return positions;
}

function compareAreaOrder(a: string, b: string): number {
  const aIndex = MAP_CORRIDOR_ORDER.indexOf(a);
  const bIndex = MAP_CORRIDOR_ORDER.indexOf(b);
  if (aIndex === -1 && bIndex === -1) {
    return a.localeCompare(b, "ja-JP");
  }
  if (aIndex === -1) {
    return 1;
  }
  if (bIndex === -1) {
    return -1;
  }
  return aIndex - bIndex;
}

function buildJapanGuideGraphics(): Array<Record<string, unknown>> {
  return [];
}

function hashSeed(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizeSourceName(source: string): string {
  const trimmed = source.trim();
  return trimmed.length > 0 ? trimmed : "不明";
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
