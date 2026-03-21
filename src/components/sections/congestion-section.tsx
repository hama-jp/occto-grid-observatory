import dynamic from "next/dynamic";
import type { CongestionSummary } from "@/lib/chart-options";
import { CompactStatCard, Panel } from "@/components/ui/dashboard-ui";
import { numberFmt, decimalFmt } from "@/lib/formatters";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type CongestionSectionProps = {
  congestionData: CongestionSummary;
  congestionTrendOption: Record<string, unknown> | null;
  congestionHeatmapOption: Record<string, unknown> | null;
};

export function CongestionSection({
  congestionData,
  congestionTrendOption,
  congestionHeatmapOption,
}: CongestionSectionProps) {
  return (
    <section className="grid grid-cols-1 gap-4">
      {/* Summary cards */}
      <div className="stagger-children grid grid-cols-2 gap-3 md:grid-cols-4">
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
  );
}
