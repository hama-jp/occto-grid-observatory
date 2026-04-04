"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardData } from "@/lib/dashboard-types";
import {
  SOURCE_COLORS,
  SOURCE_COLOR_MAP,
  MAX_ANIMATED_FLOW_LINES_PER_AREA,
} from "@/lib/constants";
import {
  normalizeSourceName,
  roundTo,
  compareAreaOrder,
} from "@/lib/formatters";
import {
  type NetworkAnimationPath,
  type NetworkOverlayViewport,
  type NetworkFlowChartHostElement,
  DEFAULT_NETWORK_OVERLAY_VIEWPORT,
  attachNetworkFlowChartRoamHook,
  readNetworkOverlayViewport,
  areNetworkOverlayViewportsEqual,
  isNetworkPowerPlantSource,
  buildJapanGuideSvgPaths,
} from "@/lib/geo";
import {
  Panel,
  LoadingOverlay,
} from "@/components/ui/dashboard-ui";
import { ChartErrorBoundary } from "@/components/ui/error-boundary";
import {
  buildReserveTrendOption,
  buildDemandCurrentOption,
  buildReserveCurrentOption,
  buildGenerationLineOption,
  buildSourceDonutOption,
  buildAreaTotalsOption,
  buildInterAreaFlowOption,
  buildIntertieTrendOption,
  buildFlowHeatmapOption,
  buildVolatilityHeatmapOption,
  buildCongestionData,
  buildCongestionTrendOption,
  buildCongestionHeatmapOption,
  type CongestionSummary,
} from "@/lib/chart-options";
import { buildFlowNetworkOption } from "@/lib/network-flow-builder";
import { FOOTER_LINK_CLASS } from "@/lib/styles";
import {
  buildAllPlantSummaries,
  buildInterAreaFlowTextRows,
  buildDashboardHighlights,
  buildAreaSupplyCards,
  buildGeneratorStatusCards,
} from "@/lib/dashboard-computations";
import { CongestionSection } from "@/components/sections/congestion-section";
import { RankingsSection } from "@/components/sections/rankings-section";
import { AreaCardsSection } from "@/components/sections/area-cards-section";
import { NetworkSection } from "@/components/sections/network-section";
import { SummaryCardsTop, SummaryCardsBottom } from "@/components/sections/summary-cards-section";
import { GenerationSection } from "@/components/sections/generation-section";
import { DashboardHeader, SectionToggle } from "@/components/sections/dashboard-header";
import { JepxMarketCard, JepxAreaBreakdown } from "@/components/sections/jepx-market-section";
import { GeneratorStatusSection } from "@/components/sections/generator-status-section";
import { useViewport } from "@/hooks/use-viewport";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import { useTimeSlider } from "@/hooks/use-time-slider";
import { useSectionVisibility } from "@/hooks/use-section-visibility";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type DashboardAppProps = {
  initialData: DashboardData;
  availableDates: string[];
};

export function DashboardApp({ initialData, availableDates }: DashboardAppProps) {
  const { isMobileViewport, isWideViewport, useInlineDonutLegend } = useViewport();

  const {
    data,
    filteredIntertieSeries,
    fetchedAtLabel,
    selectedDate,
    setSelectedDate,
    isDateLoading,
    dateError,
    setDateError,
    availableDateSet,
    earliestAvailableDate,
    latestAvailableDate,
  } = useDashboardData(initialData, availableDates);

  const flowSlotLabels = data.meta.slotLabels.flow ?? [];
  const {
    maxFlowSlotIndex,
    networkFlowSlotIndex: clampedNetworkFlowSlotIndex,
    setNetworkFlowSlotIndex,
    selectedFlowSlotLabel,
  } = useTimeSlider(flowSlotLabels);

  const {
    visibleSectionSet,
    setVisibleSectionIds,
    showGenerationTrend,
    showSourceComposition,
  } = useSectionVisibility();

  const selectedFlowDateTimeLabel = `${data.meta.targetDate} ${selectedFlowSlotLabel}`;

  const areas = useMemo(() => {
    const set = new Set<string>();
    data.generation.areaTotals.forEach((item) => set.add(item.area));
    data.flows.areaSummaries.forEach((item) => set.add(item.area));
    return ["全エリア", ...Array.from(set).sort(compareAreaOrder)];
  }, [data.generation.areaTotals, data.flows.areaSummaries]);

  const [selectedArea, setSelectedArea] = useState<string>("全エリア");
  const [generationTrendArea, setGenerationTrendArea] = useState<string>("全エリア");
  const [sourceDonutArea, setSourceDonutArea] = useState<string>("全エリア");

  // --- Network flow chart ---
  const networkFlowChartHostRef = useRef<NetworkFlowChartHostElement | null>(null);
  const [maxAnimatedFlowLinesPerArea, setMaxAnimatedFlowLinesPerArea] = useState<number>(MAX_ANIMATED_FLOW_LINES_PER_AREA);
  const [networkOverlayViewport, setNetworkOverlayViewport] = useState<NetworkOverlayViewport>(
    DEFAULT_NETWORK_OVERLAY_VIEWPORT,
  );
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

  // --- Reserve data ---
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

  // --- Chart options ---
  const reserveTrendOption = useMemo(() => {
    const scopedSeries =
      selectedArea === "全エリア"
        ? reserveAreaSeries
        : reserveAreaSeries.filter((item) => item.area === selectedArea);
    return buildReserveTrendOption(scopedSeries, data.meta.slotLabels.generation, isMobileViewport, selectedArea);
  }, [data.meta.slotLabels.generation, isMobileViewport, reserveAreaSeries, selectedArea]);
  const demandCurrentOption = useMemo(() => {
    const rows = selectedArea === "全エリア"
      ? reserveCurrentRows
      : reserveCurrentRows.filter((item) => item.area === selectedArea);
    return buildDemandCurrentOption(rows, isMobileViewport, selectedFlowDateTimeLabel);
  }, [isMobileViewport, reserveCurrentRows, selectedArea, selectedFlowDateTimeLabel]);
  const reserveCurrentOption = useMemo(() => {
    const rows = selectedArea === "全エリア"
      ? reserveCurrentRows
      : reserveCurrentRows.filter((item) => item.area === selectedArea);
    return buildReserveCurrentOption(rows, isMobileViewport, selectedFlowDateTimeLabel);
  }, [isMobileViewport, reserveCurrentRows, selectedArea, selectedFlowDateTimeLabel]);

  // --- Generation data ---
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

  const allPlantSummaries = useMemo(
    () => buildAllPlantSummaries({
      plantSummaries: data.generation.plantSummaries,
      topUnits: data.generation.topUnits,
    }),
    [data.generation.plantSummaries, data.generation.topUnits],
  );

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
    return buildGenerationLineOption(scopedSeries, data.meta.slotLabels.generation, sourceKeys, sourceColorByName, isMobileViewport);
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

  const sourceDonutOption = useMemo(
    () => buildSourceDonutOption(sourceCompositionItems, useInlineDonutLegend),
    [sourceCompositionItems, useInlineDonutLegend],
  );

  const areaTotalsOption = useMemo(
    () => buildAreaTotalsOption(data.generation.areaTotals, isMobileViewport),
    [data.generation.areaTotals, isMobileViewport],
  );

  const flowHeatmapOption = useMemo(
    () => buildFlowHeatmapOption(filteredLines, data.meta.slotLabels.flow, isMobileViewport),
    [data.meta.slotLabels.flow, filteredLines, isMobileViewport],
  );

  const volatilityHeatmapOption = useMemo(
    () => buildVolatilityHeatmapOption(filteredLines, data.meta.slotLabels.flow, isMobileViewport),
    [data.meta.slotLabels.flow, filteredLines, isMobileViewport],
  );

  const flowNetworkOption = useMemo(
    () => buildFlowNetworkOption({
      areaSummaries: data.flows.areaSummaries,
      filteredIntertieSeries,
      lineSeries: data.flows.lineSeries,
      clampedNetworkFlowSlotIndex,
      networkPowerPlants,
      selectedFlowDateTimeLabel,
      maxAnimatedFlowLinesPerArea,
    }),
    [data.flows.areaSummaries, filteredIntertieSeries, data.flows.lineSeries, clampedNetworkFlowSlotIndex, networkPowerPlants, selectedFlowDateTimeLabel, maxAnimatedFlowLinesPerArea],
  );
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

  const interAreaFlowTextRows = useMemo(
    () => buildInterAreaFlowTextRows({
      selectedArea, isMobileViewport, filteredIntertieSeries,
      clampedNetworkFlowSlotIndex, interAreaFlows: data.flows.interAreaFlows,
    }),
    [clampedNetworkFlowSlotIndex, data.flows.interAreaFlows, filteredIntertieSeries, isMobileViewport, selectedArea],
  );

  const dashboardHighlights = useMemo(
    () => buildDashboardHighlights({
      data,
      reserveCurrentRows,
      filteredIntertieSeries,
      clampedNetworkFlowSlotIndex,
      interAreaFlowTextRows,
      allPlantSummaries,
      sourceColorByName,
    }),
    [
      data,
      allPlantSummaries,
      clampedNetworkFlowSlotIndex,
      filteredIntertieSeries,
      interAreaFlowTextRows,
      reserveCurrentRows,
      sourceColorByName,
    ],
  );

  const areaSupplyCards = useMemo(
    () => buildAreaSupplyCards({
      data,
      filteredIntertieSeries,
      clampedNetworkFlowSlotIndex,
      allPlantSummaries,
      reserveAreaMap,
      selectedArea,
      sourceColorByName,
      sourceTotalsByArea,
    }),
    [
      data,
      allPlantSummaries,
      clampedNetworkFlowSlotIndex,
      filteredIntertieSeries,
      reserveAreaMap,
      selectedArea,
      sourceColorByName,
      sourceTotalsByArea,
    ],
  );
  const generatorStatus = useMemo(
    () => buildGeneratorStatusCards({
      unitSeries: data.generation.unitSeries ?? [],
      topUnits: data.generation.topUnits,
      allPlantSummaries,
      areaTotals: data.generation.areaTotals,
      hourlyBySourceByArea: data.generation.hourlyBySourceByArea,
      selectedArea,
      sourceColorByName,
    }),
    [data.generation.unitSeries, data.generation.topUnits, allPlantSummaries, data.generation.areaTotals, data.generation.hourlyBySourceByArea, selectedArea, sourceColorByName],
  );

  const maxAreaNetIntertieAbsMw = useMemo(
    () => Math.max(...areaSupplyCards.map((card) => Math.abs(card.netIntertieMw)), 1),
    [areaSupplyCards],
  );
  const maxAreaPeakAbsMw = useMemo(
    () => Math.max(...areaSupplyCards.map((card) => card.peakAbsMw), 1),
    [areaSupplyCards],
  );

  const interAreaFlowOption = useMemo(
    () => buildInterAreaFlowOption(interAreaFlowTextRows, isMobileViewport, selectedFlowDateTimeLabel),
    [interAreaFlowTextRows, isMobileViewport, selectedFlowDateTimeLabel],
  );

  const intertieTrendOption = useMemo(() => {
    const scopedSeries = filteredIntertieSeries.filter((row) =>
      selectedArea === "全エリア" ? true : row.sourceArea === selectedArea || row.targetArea === selectedArea,
    );
    const netImportSeries =
      selectedArea === "全エリア"
        ? null
        : data.meta.slotLabels.flow.map((_, idx) => {
            let sum = 0;
            for (const row of scopedSeries) {
              const value = row.values[idx] ?? 0;
              if (row.sourceArea === selectedArea) sum -= value;
              if (row.targetArea === selectedArea) sum += value;
            }
            return roundTo(sum, 1);
          });
    return buildIntertieTrendOption(scopedSeries, data.meta.slotLabels.flow, isMobileViewport, selectedArea, netImportSeries);
  }, [filteredIntertieSeries, data.meta.slotLabels.flow, isMobileViewport, selectedArea]);

  // --- Congestion ---
  const congestionData = useMemo<CongestionSummary | null>(
    () => buildCongestionData(filteredIntertieSeries),
    [filteredIntertieSeries],
  );

  const congestionTrendOption = useMemo(
    () => congestionData ? buildCongestionTrendOption(congestionData, data.meta.slotLabels.flow, isMobileViewport) : null,
    [congestionData, data.meta.slotLabels.flow, isMobileViewport],
  );

  const congestionHeatmapOption = useMemo(
    () => congestionData ? buildCongestionHeatmapOption(congestionData, data.meta.slotLabels.flow, isMobileViewport) : null,
    [congestionData, data.meta.slotLabels.flow, isMobileViewport],
  );

  return (
    <div className="relative min-h-screen bg-[radial-gradient(ellipse_at_top_left,_#eef7f5_0%,_#f6f8fb_32%,_#f0f4f8_100%)] text-slate-800 dark:bg-[radial-gradient(ellipse_at_top_left,_#0c1929_0%,_#111827_32%,_#0f172a_100%)] dark:text-slate-200">
      <a
        href="#dashboard-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-teal-600 focus:px-4 focus:py-2 focus:text-white focus:shadow-lg"
      >
        コンテンツへスキップ
      </a>
      <LoadingOverlay visible={isDateLoading} />
      <div id="dashboard-content" className="mx-auto flex w-full max-w-[1360px] flex-col gap-4 px-3 py-5 md:gap-6 md:px-8 md:py-8 2xl:max-w-[1800px] 2xl:px-10">
        <DashboardHeader
          targetDate={data.meta.targetDate}
          fetchedAtLabel={fetchedAtLabel}
          selectedDate={selectedDate}
          earliestAvailableDate={earliestAvailableDate}
          latestAvailableDate={latestAvailableDate}
          availableDateSet={availableDateSet}
          isDateLoading={isDateLoading}
          dateError={dateError}
          selectedArea={selectedArea}
          areas={areas}
          onDateChange={setSelectedDate}
          onDateError={setDateError}
          onAreaChange={setSelectedArea}
        />
        <SectionToggle
          visibleSectionSet={visibleSectionSet}
          onSetVisibleSectionIds={setVisibleSectionIds}
        />

        {visibleSectionSet.has("summary") ? (
          <SummaryCardsTop
            dashboardHighlights={dashboardHighlights}
            areaTotalsLength={data.generation.areaTotals.length}
          />
        ) : null}

        {visibleSectionSet.has("jepx") && data.jepx?.spot ? (
          <section className="stagger-children grid grid-cols-1 gap-4 md:grid-cols-2">
            <JepxMarketCard
              spot={data.jepx.spot}
              slotLabels={data.meta.slotLabels.generation}
              selectedArea={selectedArea}
              clampedSlotIndex={clampedNetworkFlowSlotIndex}
            />
            <JepxAreaBreakdown
              spot={data.jepx.spot}
              slotLabels={data.meta.slotLabels.generation}
            />
          </section>
        ) : null}

        {/* ── 発電グループ ── */}

        {showGenerationTrend || showSourceComposition ? (
          <GenerationSection
            showGenerationTrend={showGenerationTrend}
            showSourceComposition={showSourceComposition}
            generationTrendArea={generationTrendArea}
            setGenerationTrendArea={setGenerationTrendArea}
            sourceDonutArea={sourceDonutArea}
            setSourceDonutArea={setSourceDonutArea}
            areas={areas}
            generationLineOption={generationLineOption}
            sourceDonutOption={sourceDonutOption}
            sourceCompositionItems={sourceCompositionItems}
            useInlineDonutLegend={useInlineDonutLegend}
          />
        ) : null}

        {visibleSectionSet.has("totals") ? (
          <ChartErrorBoundary sectionName="エリア別日量発電">
          <section className="grid grid-cols-1 gap-4">
            <Panel title="エリア別 日量発電" testId="area-total-generation-panel">
              <div data-testid="area-total-generation-chart" role="img" aria-label="エリア別日量発電チャート">
                <ReactECharts option={areaTotalsOption} style={{ height: 320 }} />
              </div>
            </Panel>
          </section>
          </ChartErrorBoundary>
        ) : null}

        {visibleSectionSet.has("generatorStatus") ? (
          <ChartErrorBoundary sectionName="発電ユニットごとの発電量">
            <GeneratorStatusSection
              cards={generatorStatus.cards}
              treemapItems={generatorStatus.treemapItems}
              selectedArea={selectedArea}
              isMobileViewport={isMobileViewport}
              slotLabels={data.meta.slotLabels.generation}
            />
          </ChartErrorBoundary>
        ) : null}

        {visibleSectionSet.has("rankings") ? (
          <ChartErrorBoundary sectionName="ランキング">
            <RankingsSection
              filteredTopUnits={filteredTopUnits}
              filteredTopPlants={filteredTopPlants}
            />
          </ChartErrorBoundary>
        ) : null}

        {/* ── 需給・潮流グループ ── */}

        {visibleSectionSet.has("reserve") ? (
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
        ) : null}

        {visibleSectionSet.has("totals") ? (
          <ChartErrorBoundary sectionName="連系線潮流トレンド">
          <section className="grid grid-cols-1 gap-4">
            <Panel title="連系線潮流トレンド（時系列）" testId="intertie-trend-panel">
              <div data-testid="intertie-trend-chart" role="img" aria-label="連系線潮流トレンドチャート">
                <ReactECharts option={intertieTrendOption} style={{ height: 320 }} />
              </div>
            </Panel>
          </section>
          </ChartErrorBoundary>
        ) : null}

        {visibleSectionSet.has("congestion") && congestionData ? (
          <ChartErrorBoundary sectionName="連系線混雑度">
            <CongestionSection
              congestionData={congestionData}
              congestionTrendOption={congestionTrendOption}
              congestionHeatmapOption={congestionHeatmapOption}
            />
          </ChartErrorBoundary>
        ) : null}

        {visibleSectionSet.has("diagnostics") ? (
          <ChartErrorBoundary sectionName="潮流ヒートマップ">
          <section className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            <Panel title="主要線路の潮流ヒートマップ">
              <p className="mb-2 text-xs text-slate-500">主要線路の時間帯別の潮流強度を俯瞰します。</p>
              <ReactECharts option={flowHeatmapOption} style={{ height: isMobileViewport ? 340 : 420 }} />
            </Panel>
            <Panel title="潮流変動率が大きい送電線">
              <p className="mb-2 text-xs text-slate-500">変動係数（CV）上位18線路の平均比偏差を時間帯別に可視化。暖色＝平均より大きく、寒色＝平均より小さい時間帯。</p>
              <ReactECharts option={volatilityHeatmapOption} style={{ height: isMobileViewport ? 360 : 480 }} />
            </Panel>
          </section>
          </ChartErrorBoundary>
        ) : null}

        {/* ── 表示時刻スナップショット ── */}
        <section className="sticky top-0 z-30 overflow-hidden rounded-3xl border border-teal-200/50 bg-gradient-to-r from-teal-50/97 via-white/97 to-teal-50/97 px-4 py-3 shadow-lg shadow-teal-500/5 backdrop-blur-md md:px-6 md:py-4 dark:border-teal-800/50 dark:from-teal-950/97 dark:via-slate-800/97 dark:to-teal-950/97">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-teal-800 dark:text-teal-300">
                <span className="inline-block h-4 w-1 rounded-full bg-teal-500" />
                表示時刻スナップショット
              </h2>
              <p className="mt-0.5 hidden text-xs text-slate-500 md:block dark:text-slate-400">以下のカードはスライダーで選択した時刻のデータを表示します</p>
            </div>
            <div className="flex items-center gap-3">
              <span data-testid="selected-flow-datetime" className="rounded-lg bg-teal-600/10 px-3 py-1 text-sm font-semibold tabular-nums text-teal-700 dark:bg-teal-400/10 dark:text-teal-400">
                {selectedFlowDateTimeLabel}
              </span>
              <span className="text-xs tabular-nums text-slate-400 dark:text-slate-500">
                {flowSlotLabels.length === 0 ? 0 : clampedNetworkFlowSlotIndex + 1} / {flowSlotLabels.length}
              </span>
            </div>
          </div>
          <div className="mt-3 md:mt-4">
            <input
              aria-label="ネットワーク潮流の表示時刻"
              type="range"
              min={0}
              max={maxFlowSlotIndex}
              step={1}
              value={clampedNetworkFlowSlotIndex}
              onChange={(event) => setNetworkFlowSlotIndex(Number(event.target.value))}
              disabled={flowSlotLabels.length === 0}
              className="w-full"
            />
            <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
              <span>{flowSlotLabels[0] ?? "-"}</span>
              <span>{flowSlotLabels[maxFlowSlotIndex] ?? "-"}</span>
            </div>
          </div>
        </section>

        {visibleSectionSet.has("summary") ? (
          <SummaryCardsBottom
            dashboardHighlights={dashboardHighlights}
            selectedFlowDateTimeLabel={selectedFlowDateTimeLabel}
          />
        ) : null}

        {visibleSectionSet.has("areaCards") ? (
          <AreaCardsSection
            areaSupplyCards={areaSupplyCards}
            selectedArea={selectedArea}
            selectedFlowSlotLabel={selectedFlowSlotLabel}
            selectedFlowDateTimeLabel={selectedFlowDateTimeLabel}
            maxAreaNetIntertieAbsMw={maxAreaNetIntertieAbsMw}
            maxAreaPeakAbsMw={maxAreaPeakAbsMw}
            flowSlotLabels={flowSlotLabels}
            currentSlotIndex={clampedNetworkFlowSlotIndex}
          />
        ) : null}

        {visibleSectionSet.has("reserve") ? (
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
        ) : null}

        {visibleSectionSet.has("network") ? (
          <ChartErrorBoundary sectionName="ネットワーク">
            <NetworkSection
              flowNetworkOption={flowNetworkOption}
              interAreaFlowOption={interAreaFlowOption}
              isMobileViewport={isMobileViewport}
              isWideViewport={isWideViewport}
              selectedFlowDateTimeLabel={selectedFlowDateTimeLabel}
              networkFlowChartHostRef={networkFlowChartHostRef}
              registerNetworkFlowChart={registerNetworkFlowChart}
              networkOverlayViewport={networkOverlayViewport}
              japanGuidePaths={japanGuidePaths}
              majorFlowAnimationPaths={majorFlowAnimationPaths}
              intertieAnimationPaths={intertieAnimationPaths}
              maxAnimatedFlowLinesPerArea={maxAnimatedFlowLinesPerArea}
              onMaxAnimatedFlowLinesPerAreaChange={setMaxAnimatedFlowLinesPerArea}
            />
          </ChartErrorBoundary>
        ) : null}

        {/* Footer */}
        <footer className="mt-10 rounded-3xl border border-slate-200/40 bg-white/60 px-6 py-6 text-center backdrop-blur-sm dark:border-slate-700/40 dark:bg-slate-800/60">
          <p className="text-xs font-medium tracking-wide text-teal-600 dark:text-teal-400">
            OCCTO GRID OBSERVATORY
          </p>
          <p className="mt-3 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            本サイトは
            <a
              href="https://www.occto.or.jp/"
              target="_blank"
              rel="noopener noreferrer"
              className={FOOTER_LINK_CLASS}
            >
              電力広域的運営推進機関（OCCTO）
            </a>
            が公開するデータをもとに作成した非公式の可視化ダッシュボードです。
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
            正確な情報は必ず
            <a
              href="https://www.occto.or.jp/"
              target="_blank"
              rel="noopener noreferrer"
              className={FOOTER_LINK_CLASS}
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
