import type { AreaSupplyCard } from "@/lib/dashboard-computations";
import { FLOW_AREA_COLORS } from "@/lib/constants";
import {
  decimalFmt,
  normalizeSourceName,
  formatCompactEnergy,
} from "@/lib/formatters";
import {
  CompactStatCard,
  SegmentedBar,
  ReserveRateBadge,
  ValueProgressBar,
  SupplyDemandMeter,
  NetFlowMeter,
} from "@/components/ui/dashboard-ui";
import dynamic from "next/dynamic";
import { memo, useMemo } from "react";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type AreaCardsSectionProps = {
  areaSupplyCards: AreaSupplyCard[];
  selectedArea: string;
  selectedFlowSlotLabel: string;
  selectedFlowDateTimeLabel: string;
  maxAreaNetIntertieAbsMw: number;
  maxAreaPeakAbsMw: number;
  flowSlotLabels: string[];
  currentSlotIndex: number;
};

function buildSupplyDemandSparkline(
  card: AreaSupplyCard,
  slotLabels: string[],
  currentSlotIndex: number,
  areaColor: string,
): Record<string, unknown> {
  const hasData = card.demandSeries.length > 0;
  return {
    animation: false,
    grid: { top: 8, right: 4, bottom: 20, left: 4 },
    xAxis: {
      type: "category",
      data: slotLabels,
      show: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        show: true,
        fontSize: 9,
        color: "#94a3b8",
        interval: (_index: number, value: string) => value === "06:00" || value === "12:00" || value === "18:00",
      },
    },
    yAxis: {
      type: "value",
      show: false,
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(30,41,59,0.95)",
      borderColor: "transparent",
      textStyle: { color: "#f1f5f9", fontSize: 11 },
      formatter: (params: Array<{ seriesName: string; value: number; marker: string }>) => {
        const slot = params[0] ? slotLabels[(params[0] as unknown as { dataIndex: number }).dataIndex] : "";
        const lines = params.map(
          (p: { marker: string; seriesName: string; value: number }) =>
            `${p.marker} ${p.seriesName}: ${decimalFmt.format(p.value)} MW`,
        );
        return `<div style="font-size:11px"><b>${slot}</b><br/>${lines.join("<br/>")}</div>`;
      },
    },
    series: hasData
      ? [
          {
            name: "供給力",
            type: "line",
            data: card.supplySeries,
            symbol: "none",
            lineStyle: { width: 1.5, color: "#94a3b8" },
            areaStyle: { color: "rgba(148,163,184,0.08)" },
            z: 1,
          },
          {
            name: "需要",
            type: "line",
            data: card.demandSeries,
            symbol: "none",
            lineStyle: { width: 2, color: areaColor },
            areaStyle: { color: `${areaColor}18` },
            z: 2,
          },
          {
            name: "予備力",
            type: "line",
            data: card.reserveSeries,
            symbol: "none",
            lineStyle: { width: 1, color: "#10b981", type: "dashed" },
            z: 3,
          },
          {
            type: "line",
            markLine: {
              silent: true,
              symbol: "none",
              lineStyle: { color: "#f59e0b", width: 1, type: "solid" },
              data: [{ xAxis: currentSlotIndex }],
              label: { show: false },
            },
            data: [],
          },
        ]
      : [],
    graphic: hasData
      ? []
      : [
          {
            type: "text",
            left: "center",
            top: "middle",
            style: { text: "データなし", fill: "#94a3b8", fontSize: 11 },
          },
        ],
  };
}

function AreaCardsSectionImpl({
  areaSupplyCards,
  selectedArea,
  selectedFlowSlotLabel,
  selectedFlowDateTimeLabel,
  maxAreaNetIntertieAbsMw,
  maxAreaPeakAbsMw,
  flowSlotLabels,
  currentSlotIndex,
}: AreaCardsSectionProps) {
  const sparklineOptions = useMemo(
    () =>
      areaSupplyCards.map((card) => ({
        area: card.area,
        option: buildSupplyDemandSparkline(
          card,
          flowSlotLabels,
          currentSlotIndex,
          FLOW_AREA_COLORS[card.area] ?? FLOW_AREA_COLORS.default,
        ),
      })),
    [areaSupplyCards, flowSlotLabels, currentSlotIndex],
  );
  const sparklineMap = useMemo(
    () => new Map(sparklineOptions.map((item) => [item.area, item.option])),
    [sparklineOptions],
  );
  return (
    <section className="rounded-3xl border border-white/70 bg-white/90 p-3 shadow-[var(--panel-shadow)] backdrop-blur-sm md:p-5 dark:border-slate-700/80 dark:bg-slate-800/90">
      <div className="mb-4 flex flex-col gap-1 md:mb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
            <span className="inline-block h-5 w-1 rounded-full bg-teal-500" />
            エリア別需給カード
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {selectedArea === "全エリア"
              ? `全${areaSupplyCards.length}エリアの需要、予備率、電源構成、連系収支を俯瞰`
              : `${selectedArea} の需要、予備率、電源構成、連系収支を表示`}
          </p>
        </div>
        <p className="rounded-lg bg-slate-100 px-3 py-1 text-xs tabular-nums text-slate-500 dark:bg-slate-700/50 dark:text-slate-400">{selectedFlowDateTimeLabel} 時点</p>
      </div>
      <div className="stagger-children grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
        {areaSupplyCards.map((card) => {
          const areaColor = FLOW_AREA_COLORS[card.area] ?? FLOW_AREA_COLORS.default;
          const netDirection =
            card.netIntertieMw > 0 ? "受電超過" : card.netIntertieMw < 0 ? "送電超過" : "概ね均衡";
          const peerDirection =
            (card.peer?.signedMw ?? 0) > 0 ? "受電" : (card.peer?.signedMw ?? 0) < 0 ? "送電" : "均衡";
          return (
            <article
              key={card.area}
              className="group/card overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[var(--panel-shadow)] transition-all duration-300 hover:shadow-[var(--panel-shadow-hover)] dark:border-slate-700/80 dark:bg-slate-800"
            >
              <div className="h-1 transition-all duration-300 group-hover/card:h-1.5" style={{ backgroundColor: areaColor }} />
              <div className="p-4 md:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-3 w-3 rounded-full"
                        style={{ backgroundColor: areaColor }}
                      />
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{card.area}</h3>
                      <ReserveRateBadge reserveRate={card.reserveRate} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">全国発電シェア {card.sharePercent.toFixed(1)}%</p>
                    <div className="mt-2 max-w-sm">
                      <ValueProgressBar value={card.sharePercent} max={100} color={areaColor} />
                    </div>
                  </div>
                  <div className="rounded-2xl bg-slate-800 px-4 py-3 text-white shadow-md md:px-5 md:py-3.5 dark:bg-slate-700">
                    <p className="text-[11px] font-medium tracking-[0.16em] text-slate-400">日量発電</p>
                    <p className="mt-1 text-xl font-bold tabular-nums md:text-2xl">{formatCompactEnergy(card.totalKwh)}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800/60">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs tracking-[0.16em] text-slate-500 dark:text-slate-400">需給バランス</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{selectedFlowSlotLabel} 時点</p>
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
                    {card.demandSeries.length > 0 && (
                      <div className="mt-2">
                        <ReactECharts
                          option={sparklineMap.get(card.area) ?? {}}
                          style={{ height: 100 }}
                          opts={{ renderer: "canvas" }}
                        />
                        <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-400 dark:text-slate-500">
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-0.5 w-3 rounded" style={{ backgroundColor: areaColor }} />
                            需要
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-0.5 w-3 rounded bg-slate-400" />
                            供給力
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-0.5 w-3 rounded border-t border-dashed border-emerald-500" />
                            予備力
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800/60">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs tracking-[0.16em] text-slate-500 dark:text-slate-400">電源構成</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
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
                            <span className="truncate text-slate-700 dark:text-slate-300">{segment.label}</span>
                          </div>
                          <span className="shrink-0 text-slate-500 dark:text-slate-400">
                            {decimalFmt.format(segment.percent)}% / {formatCompactEnergy(segment.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800/60">
                    <p className="text-xs tracking-[0.16em] text-slate-500 dark:text-slate-400">連系収支</p>
                    <div className="mt-3">
                      <NetFlowMeter
                        valueMw={card.netIntertieMw}
                        maxAbsMw={maxAreaNetIntertieAbsMw}
                        color={areaColor}
                      />
                    </div>
                    <p className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">{netDirection}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
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
                  <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800/60">
                    <p className="text-xs tracking-[0.16em] text-slate-500 dark:text-slate-400">地域内ピーク</p>
                    <div className="mt-3">
                      <ValueProgressBar value={card.peakAbsMw} max={maxAreaPeakAbsMw} color={areaColor} />
                    </div>
                    <p className="mt-3 text-base font-semibold text-slate-900 dark:text-slate-100">
                      {decimalFmt.format(card.peakAbsMw)} MW
                    </p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">地内送電線の最大|潮流|</p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-700/60 dark:bg-slate-800/60">
                  <p className="text-xs tracking-[0.16em] text-slate-500 dark:text-slate-400">エリア内主要発電所</p>
                  <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">
                    {card.primaryPlant?.plantName ?? "-"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
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
  );
}

export const AreaCardsSection = memo(AreaCardsSectionImpl);
