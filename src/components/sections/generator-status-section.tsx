import type { GeneratorStatusCard, GeneratorTreemapItem } from "@/lib/dashboard-computations";
import { FLOW_AREA_COLORS, SOURCE_COLOR_MAP } from "@/lib/constants";
import { decimalFmt, formatCompactEnergy, manKwFmt } from "@/lib/formatters";
import { buildGeneratorTreemapOption, buildGeneratorBarOption } from "@/lib/chart-options";
import { ValueProgressBar } from "@/components/ui/dashboard-ui";
import dynamic from "next/dynamic";
import { useMemo } from "react";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type GeneratorStatusSectionProps = {
  cards: GeneratorStatusCard[];
  treemapItems: GeneratorTreemapItem[];
  selectedArea: string;
  isMobileViewport: boolean;
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
}: GeneratorStatusSectionProps) {
  const treemapOption = useMemo(
    () => buildGeneratorTreemapOption(treemapItems, isMobileViewport),
    [treemapItems, isMobileViewport],
  );

  const barOptions = useMemo(
    () =>
      cards.map((card) => ({
        area: card.area,
        option: buildGeneratorBarOption(card.generators, card.areaColor, isMobileViewport),
      })),
    [cards, isMobileViewport],
  );
  const barOptionMap = useMemo(
    () => new Map(barOptions.map((item) => [item.area, item.option])),
    [barOptions],
  );

  const sourceLegend = useSourceLegend(treemapItems);

  return (
    <section className="rounded-3xl border border-white/70 bg-white/90 p-3 shadow-[var(--panel-shadow)] backdrop-blur-sm md:p-5 dark:border-slate-700/80 dark:bg-slate-800/90">
      <div className="mb-4 flex flex-col gap-1 md:mb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
            <span className="inline-block h-5 w-1 rounded-full bg-teal-500" />
            発電機別ステータス
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {selectedArea === "全エリア"
              ? "全エリアの主要発電機の発電量・稼働率を俯瞰"
              : `${selectedArea} の主要発電機の発電量・稼働率を表示`}
          </p>
        </div>
        {/* Source type legend */}
        <div className="flex flex-wrap gap-2">
          {sourceLegend.map(({ source, color }) => (
            <span
              key={source}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/90 px-2.5 py-1 text-[10px] text-slate-600 dark:border-slate-600/80 dark:bg-slate-800/90 dark:text-slate-400"
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              {source || "不明"}
            </span>
          ))}
        </div>
      </div>

      {/* Treemap overview */}
      {treemapItems.length > 0 && (
        <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900 to-slate-800 p-1 shadow-inner dark:border-slate-700/80">
          <div role="img" aria-label="発電機別ツリーマップ">
            <ReactECharts
              option={treemapOption}
              style={{ height: isMobileViewport ? 280 : 380 }}
              opts={{ renderer: "canvas" }}
            />
          </div>
        </div>
      )}

      {/* Per-area generator cards */}
      <div className="stagger-children grid grid-cols-1 gap-4 xl:grid-cols-2">
        {cards.map((card) => {
          const areaColor = card.areaColor;
          const topGen = card.generators[0];
          return (
            <article
              key={card.area}
              className="group/card overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white/98 to-slate-50/96 shadow-[var(--panel-shadow)] transition-all duration-300 hover:shadow-[var(--panel-shadow-hover)] dark:border-slate-700/80 dark:from-slate-800/98 dark:to-slate-850/96"
            >
              {/* Color accent bar */}
              <div
                className="h-1 transition-all duration-300 group-hover/card:h-1.5"
                style={{ background: `linear-gradient(90deg, ${areaColor}, ${areaColor}88)` }}
              />
              <div className="p-4 md:p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex h-3 w-3 rounded-full" style={{ backgroundColor: areaColor }} />
                      <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{card.area}</h3>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                        {card.generators.length} 発電機
                      </span>
                    </div>
                    {topGen && (
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        主力: {topGen.plantName}（{topGen.sourceType}）{decimalFmt.format(topGen.sharePercent)}%
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 px-4 py-2.5 text-white shadow-md dark:from-slate-700 dark:to-slate-800">
                    <p className="text-[10px] font-medium tracking-[0.16em] text-slate-400">日量合計</p>
                    <p className="mt-0.5 text-lg font-bold tabular-nums">{formatCompactEnergy(card.totalKwh)}</p>
                  </div>
                </div>

                {/* Horizontal bar chart */}
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 dark:border-slate-700/60 dark:bg-slate-800/60">
                  <div role="img" aria-label={`${card.area}の発電機別発電量`}>
                    <ReactECharts
                      option={barOptionMap.get(card.area) ?? {}}
                      style={{ height: Math.max(card.generators.length * (isMobileViewport ? 28 : 32) + 16, 120) }}
                      opts={{ renderer: "svg" }}
                    />
                  </div>
                </div>

                {/* Utilization detail grid */}
                <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                  {card.generators.slice(0, 8).map((gen) => (
                    <div
                      key={`${card.area}-${gen.plantName}`}
                      className="group/gen rounded-xl border border-slate-200/80 bg-gradient-to-br from-white/90 to-slate-50/80 px-3 py-2 transition-all duration-200 hover:shadow-sm hover:-translate-y-px dark:border-slate-700/60 dark:from-slate-800/80 dark:to-slate-800/50"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: gen.color }}
                        />
                        <p className="min-w-0 truncate text-[11px] font-medium text-slate-700 dark:text-slate-300">
                          {gen.plantName}
                        </p>
                      </div>
                      <div className="mt-1.5">
                        <ValueProgressBar
                          value={gen.utilizationPercent}
                          max={100}
                          color={gen.utilizationPercent > 70
                            ? gen.color
                            : gen.utilizationPercent > 30
                              ? `${gen.color}aa`
                              : `${gen.color}66`}
                        />
                      </div>
                      <div className="mt-1 flex items-end justify-between gap-1">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          稼働率
                        </span>
                        <span className="text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                          {gen.utilizationPercent > 0 ? `${decimalFmt.format(gen.utilizationPercent)}%` : "-"}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-end justify-between gap-1">
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">
                          {gen.maxOutputManKw > 0 ? `${manKwFmt.format(gen.maxOutputManKw)}万kW` : ""}
                        </span>
                        <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                          {formatCompactEnergy(gen.dailyKwh)}
                        </span>
                      </div>
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
