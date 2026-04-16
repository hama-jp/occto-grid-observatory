import dynamic from "next/dynamic";
import { memo } from "react";
import { Panel, CompositionLegendList } from "@/components/ui/dashboard-ui";
import { ChartErrorBoundary } from "@/components/ui/error-boundary";
import { SELECT_COMPACT_CLASS } from "@/lib/styles";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type GenerationSectionProps = {
  showGenerationTrend: boolean;
  showSourceComposition: boolean;
  generationTrendArea: string;
  setGenerationTrendArea: (area: string) => void;
  sourceDonutArea: string;
  setSourceDonutArea: (area: string) => void;
  areas: string[];
  generationLineOption: Record<string, unknown>;
  sourceDonutOption: Record<string, unknown>;
  sourceCompositionItems: Array<{ name: string; totalKwh: number; percent: number; color: string }>;
  useInlineDonutLegend: boolean;
};

function GenerationSectionImpl({
  showGenerationTrend,
  showSourceComposition,
  generationTrendArea,
  setGenerationTrendArea,
  sourceDonutArea,
  setSourceDonutArea,
  areas,
  generationLineOption,
  sourceDonutOption,
  sourceCompositionItems,
  useInlineDonutLegend,
}: GenerationSectionProps) {
  return (
    <ChartErrorBoundary sectionName="発電トレンド・構成">
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      {showGenerationTrend ? (
        <Panel
          title="発電方式別 30分推移"
          className={showSourceComposition ? "lg:col-span-7" : "lg:col-span-12"}
          testId="generation-trend-panel"
        >
          <div className="mb-2 flex justify-end">
            <label htmlFor="generation-area" className="mr-2 text-sm text-slate-600 dark:text-slate-300">
              表示エリア
            </label>
            <select
              id="generation-area"
              className={SELECT_COMPACT_CLASS}
              value={generationTrendArea}
              onChange={(event) => setGenerationTrendArea(event.target.value)}
            >
              {areas.map((area) => (
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
      ) : null}
      {showSourceComposition ? (
        <Panel
          title="発電方式 構成比"
          className={showGenerationTrend ? "lg:col-span-5" : "lg:col-span-12"}
          testId="source-composition-panel"
        >
          <div className="mb-2 flex justify-end">
            <label htmlFor="source-donut-area" className="mr-2 text-sm text-slate-600 dark:text-slate-300">
              表示エリア
            </label>
            <select
              id="source-donut-area"
              className={SELECT_COMPACT_CLASS}
              value={sourceDonutArea}
              onChange={(event) => setSourceDonutArea(event.target.value)}
            >
              {areas.map((area) => (
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
      ) : null}
    </section>
    </ChartErrorBoundary>
  );
}

export const GenerationSection = memo(GenerationSectionImpl);
