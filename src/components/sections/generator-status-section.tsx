import type { GeneratorStatusCard, GeneratorTreemapItem } from "@/lib/dashboard-computations";
import { SOURCE_COLOR_MAP } from "@/lib/constants";
import { decimalFmt, formatCompactEnergy, manKwFmt, normalizeSourceName } from "@/lib/formatters";
import {
  buildGeneratorTreemapOption,
  buildAreaGenerationTimeSeriesOption,
  buildExpandedAreaGenerationTimeSeriesOption,
  type AreaGenerationSeries,
} from "@/lib/chart-options";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type GeneratorStatusSectionProps = {
  cards: GeneratorStatusCard[];
  treemapItems: GeneratorTreemapItem[];
  selectedArea: string;
  isMobileViewport: boolean;
  slotLabels: string[];
  isDark?: boolean;
};

/** Unique source-type legend items from treemap data. */
function useSourceLegend(treemapItems: GeneratorTreemapItem[]) {
  return useMemo(() => {
    const seen = new Map<string, string>();
    treemapItems.forEach((item) => {
      if (!seen.has(item.sourceType)) {
        seen.set(item.sourceType, item.color);
      }
    });
    return Array.from(seen.entries()).map(([source, color]) => ({ source, color }));
  }, [treemapItems]);
}

/* ------------------------------------------------------------------ */
/*  Expanded Modal                                                    */
/* ------------------------------------------------------------------ */

function ExpandedCardModal({
  card,
  slotLabels,
  onClose,
  isDark = false,
}: {
  card: GeneratorStatusCard;
  slotLabels: string[];
  onClose: () => void;
  isDark?: boolean;
}) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const expandedChartOption = useMemo(
    () =>
      buildExpandedAreaGenerationTimeSeriesOption(
        card.timeSeries as AreaGenerationSeries[],
        slotLabels,
        card.areaColor,
        isDark,
      ),
    [card, slotLabels, isDark],
  );

  const units =
    card.units.length > 0
      ? card.units
      : card.generators.map((g) => ({
          label: g.plantName,
          sourceType: g.sourceType,
          dailyKwh: g.dailyKwh,
          color: g.color,
        }));

  const topGen = card.generators[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex h-[95vh] w-[96vw] max-w-[1600px] flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50 shadow-2xl dark:border-slate-700/80 dark:from-slate-900 dark:to-slate-850"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Color accent bar */}
        <div
          className="h-1.5 shrink-0"
          style={{ background: `linear-gradient(90deg, ${card.areaColor}, ${card.areaColor}88)` }}
        />

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200/60 px-6 py-4 dark:border-slate-700/60">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex h-4 w-4 rounded-full"
              style={{ backgroundColor: card.areaColor }}
            />
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {card.area}
            </h2>
            <span className="rounded-lg bg-slate-800 px-3 py-1 text-sm font-bold tabular-nums text-white dark:bg-slate-700">
              {formatCompactEnergy(card.totalKwh)}
            </span>
            {topGen && (
              <span className="text-sm text-slate-500 dark:text-slate-400">
                主力: {topGen.plantName}（{topGen.sourceType}）{decimalFmt.format(topGen.sharePercent)}%
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="閉じる"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
          {/* Chart — takes up most of the space */}
          {card.timeSeries.length > 0 ? (
            <div className="rounded-2xl border border-slate-200/60 bg-white p-4 dark:border-slate-700/60 dark:bg-slate-800/60">
              <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
                発電出力推移
              </h3>
              <div role="img" aria-label={`${card.area}の発電出力推移`}>
                <ReactECharts
                  option={expandedChartOption}
                  style={{ height: "min(50vh, 500px)", width: "100%" }}
                  opts={{ renderer: "svg" }}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400 dark:text-slate-500">
              時系列データなし
            </div>
          )}

          {/* Unit list — full list in a table layout */}
          <div className="rounded-2xl border border-slate-200/60 bg-white p-4 dark:border-slate-700/60 dark:bg-slate-800/60">
            <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
              ユニット一覧（{units.length}件）
            </h3>
            <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
              {units.map((unit, idx) => (
                <div
                  key={`${card.area}-exp-${unit.label}-${idx}`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/40"
                >
                  <span className="w-5 shrink-0 text-right tabular-nums text-xs text-slate-400">
                    {idx + 1}
                  </span>
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: unit.color }}
                  />
                  <span className="min-w-0 truncate text-slate-700 dark:text-slate-300">
                    {unit.label}
                  </span>
                  <span className="ml-auto shrink-0 tabular-nums font-medium text-slate-800 dark:text-slate-200">
                    {formatCompactEnergy(unit.dailyKwh)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Top generators stats */}
          {card.generators.length > 0 && (
            <div className="rounded-2xl border border-slate-200/60 bg-white p-4 dark:border-slate-700/60 dark:bg-slate-800/60">
              <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                主要発電機
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200/60 text-xs text-slate-500 dark:border-slate-700/60 dark:text-slate-400">
                      <th className="pb-2 pr-4 font-medium">発電所</th>
                      <th className="pb-2 pr-4 font-medium">電源種別</th>
                      <th className="pb-2 pr-4 text-right font-medium">発電量</th>
                      <th className="pb-2 pr-4 text-right font-medium">最大出力(万kW)</th>
                      <th className="pb-2 pr-4 text-right font-medium">シェア</th>
                      <th className="pb-2 text-right font-medium">稼働率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {card.generators.map((gen, idx) => (
                      <tr
                        key={`${card.area}-gen-${gen.plantName}-${idx}`}
                        className="border-b border-slate-100/60 last:border-0 dark:border-slate-700/40"
                      >
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: gen.color }}
                            />
                            <span className="text-slate-700 dark:text-slate-300">{gen.plantName}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-slate-500 dark:text-slate-400">
                          {normalizeSourceName(gen.sourceType)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums font-medium text-slate-800 dark:text-slate-200">
                          {formatCompactEnergy(gen.dailyKwh)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          {decimalFmt.format(gen.maxOutputManKw)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          {decimalFmt.format(gen.sharePercent)}%
                        </td>
                        <td className="py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          {decimalFmt.format(gen.utilizationPercent)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Section                                                      */
/* ------------------------------------------------------------------ */

export function GeneratorStatusSection({
  cards,
  treemapItems,
  selectedArea,
  isMobileViewport,
  slotLabels,
  isDark = false,
}: GeneratorStatusSectionProps) {
  const [expandedArea, setExpandedArea] = useState<string | null>(null);

  const treemapOption = useMemo(
    () => buildGeneratorTreemapOption(treemapItems, isMobileViewport, isDark),
    [treemapItems, isMobileViewport, isDark],
  );

  const areaChartOptions = useMemo(
    () =>
      cards.map((card) => ({
        area: card.area,
        option: buildAreaGenerationTimeSeriesOption(
          card.timeSeries as AreaGenerationSeries[],
          slotLabels,
          card.areaColor,
          isMobileViewport,
          isDark,
        ),
      })),
    [cards, slotLabels, isMobileViewport, isDark],
  );
  const areaChartMap = useMemo(
    () => new Map(areaChartOptions.map((item) => [item.area, item.option])),
    [areaChartOptions],
  );

  const sourceLegend = useSourceLegend(treemapItems);

  const expandedCard = useMemo(
    () => (expandedArea ? cards.find((c) => c.area === expandedArea) ?? null : null),
    [expandedArea, cards],
  );

  const handleClose = useCallback(() => setExpandedArea(null), []);

  return (
    <section className="rounded-3xl border border-white/70 bg-white/90 p-3 shadow-[var(--panel-shadow)] backdrop-blur-sm md:p-5 dark:border-slate-700/80 dark:bg-slate-800/90">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-2 md:mb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
            <span className="inline-block h-5 w-1 rounded-full bg-teal-500" />
            発電ユニットごとの発電量
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {selectedArea === "全エリア"
              ? "全エリアの主要発電機の発電出力推移を俯瞰"
              : `${selectedArea} の主要発電機の発電出力推移を表示`}
          </p>
        </div>
        {/* Source type legend */}
        <div className="flex flex-wrap gap-1.5">
          {sourceLegend.map(({ source, color }) => (
            <span
              key={source}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/90 px-2 py-0.5 text-[10px] text-slate-600 dark:border-slate-600/80 dark:bg-slate-800/90 dark:text-slate-300"
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              {normalizeSourceName(source)}
            </span>
          ))}
        </div>
      </div>

      {/* Treemap overview */}
      {treemapItems.length > 0 && (
        <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-850 shadow-inner dark:border-slate-700/80">
          <div role="img" aria-label="発電機別ツリーマップ">
            <ReactECharts
              option={treemapOption}
              style={{ height: isMobileViewport ? 300 : 400 }}
              opts={{ renderer: "canvas" }}
            />
          </div>
        </div>
      )}

      {/* Per-area stacked area charts */}
      <div className="stagger-children grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {cards.map((card) => {
          const areaColor = card.areaColor;
          const topGen = card.generators[0];
          const chartOption = areaChartMap.get(card.area);
          return (
            <article
              key={card.area}
              className="group/card cursor-pointer overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white/98 to-slate-50/96 shadow-sm transition-all duration-300 hover:shadow-[var(--panel-shadow)] dark:border-slate-700/80 dark:from-slate-800/98 dark:to-slate-850/96"
              onClick={() => setExpandedArea(card.area)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpandedArea(card.area); }}
              aria-label={`${card.area}の詳細を表示`}
            >
              {/* Color accent bar */}
              <div
                className="h-1 transition-all duration-300 group-hover/card:h-1.5"
                style={{ background: `linear-gradient(90deg, ${areaColor}, ${areaColor}88)` }}
              />
              <div className="p-3 md:p-4">
                {/* Header row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: areaColor }}
                    />
                    <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{card.area}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold tabular-nums text-white dark:bg-slate-700">
                      {formatCompactEnergy(card.totalKwh)}
                    </span>
                    {/* Expand icon */}
                    <span className="text-slate-300 transition-colors group-hover/card:text-slate-500 dark:text-slate-600 dark:group-hover/card:text-slate-400">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 2h4v4M6 14H2v-4M14 2L9.5 6.5M2 14l4.5-4.5" />
                      </svg>
                    </span>
                  </div>
                </div>

                {/* Sub info */}
                {topGen && (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-300">
                    主力: {topGen.plantName}（{topGen.sourceType}）{decimalFmt.format(topGen.sharePercent)}%
                  </p>
                )}

                {/* Stacked area chart */}
                {chartOption && card.timeSeries.length > 0 ? (
                  <div className="mt-2 -mx-1">
                    <div role="img" aria-label={`${card.area}の発電出力推移`}>
                      <ReactECharts
                        option={chartOption}
                        style={{ height: isMobileViewport ? 140 : 170 }}
                        opts={{ renderer: "svg" }}
                      />
                    </div>
                    {/* Mini legend for this chart */}
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 px-1">
                      {card.timeSeries.slice(0, 10).map((s) => (
                        <span
                          key={`${card.area}-${s.name}`}
                          className="inline-flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-200"
                        >
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          {s.name}
                        </span>
                      ))}
                      {card.timeSeries.length > 10 && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-400">+{card.timeSeries.length - 10}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex h-24 items-center justify-center text-xs text-slate-400 dark:text-slate-500">
                    時系列データなし
                  </div>
                )}

                {/* Top units compact list */}
                <div className="mt-2 space-y-1">
                  {(card.units.length > 0 ? card.units : card.generators.map((g) => ({ label: g.plantName, sourceType: g.sourceType, dailyKwh: g.dailyKwh, color: g.color }))).slice(0, 8).map((unit, idx) => (
                    <div
                      key={`${card.area}-${unit.label}-${idx}`}
                      className="flex items-center gap-2 text-[11px]"
                    >
                      <span className="w-3 shrink-0 text-right tabular-nums text-slate-400 dark:text-slate-400">{idx + 1}</span>
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: unit.color }}
                      />
                      <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{unit.label}</span>
                      <span className="ml-auto shrink-0 tabular-nums font-semibold text-slate-800 dark:text-slate-100">
                        {formatCompactEnergy(unit.dailyKwh)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {/* Expanded modal — portal to body to escape backdrop-blur containing block */}
      {expandedCard && createPortal(
        <ExpandedCardModal
          card={expandedCard}
          slotLabels={slotLabels}
          onClose={handleClose}
          isDark={isDark}
        />,
        document.body,
      )}
    </section>
  );
}
