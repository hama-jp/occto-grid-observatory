import type { GeneratorStatusCard, GeneratorTreemapItem } from "@/lib/dashboard-computations";
import { SOURCE_COLOR_MAP } from "@/lib/constants";
import { decimalFmt, formatCompactEnergy, manKwFmt, normalizeSourceName } from "@/lib/formatters";
import {
  buildGeneratorTreemapOption,
  buildAreaGenerationTimeSeriesOption,
  type AreaGenerationSeries,
} from "@/lib/chart-options";
import dynamic from "next/dynamic";
import { useMemo } from "react";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type GeneratorStatusSectionProps = {
  cards: GeneratorStatusCard[];
  treemapItems: GeneratorTreemapItem[];
  selectedArea: string;
  isMobileViewport: boolean;
  slotLabels: string[];
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

export function GeneratorStatusSection({
  cards,
  treemapItems,
  selectedArea,
  isMobileViewport,
  slotLabels,
}: GeneratorStatusSectionProps) {
  const treemapOption = useMemo(
    () => buildGeneratorTreemapOption(treemapItems, isMobileViewport),
    [treemapItems, isMobileViewport],
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
        ),
      })),
    [cards, slotLabels, isMobileViewport],
  );
  const areaChartMap = useMemo(
    () => new Map(areaChartOptions.map((item) => [item.area, item.option])),
    [areaChartOptions],
  );

  const sourceLegend = useSourceLegend(treemapItems);

  return (
    <section className="rounded-3xl border border-white/70 bg-white/90 p-3 shadow-[var(--panel-shadow)] backdrop-blur-sm md:p-5 dark:border-slate-700/80 dark:bg-slate-800/90">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-2 md:mb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
            <span className="inline-block h-5 w-1 rounded-full bg-teal-500" />
            発電機別ステータス
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
              className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/90 px-2 py-0.5 text-[10px] text-slate-600 dark:border-slate-600/80 dark:bg-slate-800/90 dark:text-slate-400"
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              {normalizeSourceName(source)}
            </span>
          ))}
        </div>
      </div>

      {/* Treemap overview */}
      {treemapItems.length > 0 && (
        <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900 to-slate-800 shadow-inner dark:border-slate-700/80">
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
              className="group/card overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-b from-white/98 to-slate-50/96 shadow-sm transition-all duration-300 hover:shadow-[var(--panel-shadow)] dark:border-slate-700/80 dark:from-slate-800/98 dark:to-slate-850/96"
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
                  <span className="shrink-0 rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold tabular-nums text-white dark:bg-slate-700">
                    {formatCompactEnergy(card.totalKwh)}
                  </span>
                </div>

                {/* Sub info */}
                {topGen && (
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
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
                    <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 px-1">
                      {card.timeSeries.slice(0, 6).map((s) => (
                        <span
                          key={`${card.area}-${s.name}`}
                          className="inline-flex items-center gap-1 text-[9px] text-slate-500 dark:text-slate-400"
                        >
                          <span
                            className="inline-block h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          {s.name}
                        </span>
                      ))}
                      {card.timeSeries.length > 6 && (
                        <span className="text-[9px] text-slate-400">+{card.timeSeries.length - 6}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex h-24 items-center justify-center text-xs text-slate-400">
                    時系列データなし
                  </div>
                )}

                {/* Top generators compact list */}
                <div className="mt-2 space-y-1">
                  {card.generators.slice(0, 5).map((gen, idx) => (
                    <div
                      key={`${card.area}-${gen.plantName}`}
                      className="flex items-center gap-2 text-[11px]"
                    >
                      <span className="w-3 shrink-0 text-right tabular-nums text-slate-400">{idx + 1}</span>
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: gen.color }}
                      />
                      <span className="min-w-0 truncate text-slate-700 dark:text-slate-300">{gen.plantName}</span>
                      <span className="ml-auto shrink-0 tabular-nums font-medium text-slate-800 dark:text-slate-200">
                        {formatCompactEnergy(gen.dailyKwh)}
                      </span>
                      {gen.utilizationPercent > 0 && (
                        <span className="shrink-0 w-10 text-right tabular-nums text-slate-400">
                          {decimalFmt.format(gen.utilizationPercent)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
