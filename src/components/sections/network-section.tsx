import dynamic from "next/dynamic";
import type { MutableRefObject } from "react";
import type {
  NetworkAnimationPath,
  NetworkOverlayViewport,
  NetworkFlowChartHostElement,
} from "@/lib/geo";
import {
  formatSvgMatrixTransform,
  flowMagnitudeColor,
} from "@/lib/geo";
import { Panel } from "@/components/ui/dashboard-ui";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type NetworkSectionProps = {
  flowNetworkOption: Record<string, unknown>;
  interAreaFlowOption: Record<string, unknown>;
  isMobileViewport: boolean;
  selectedFlowDateTimeLabel: string;
  networkFlowChartHostRef: MutableRefObject<NetworkFlowChartHostElement | null>;
  registerNetworkFlowChart: (chart: unknown) => void;
  networkOverlayViewport: NetworkOverlayViewport;
  japanGuidePaths: Array<{ name: string; d: string }>;
  majorFlowAnimationPaths: NetworkAnimationPath[];
  intertieAnimationPaths: NetworkAnimationPath[];
};

export function NetworkSection({
  flowNetworkOption,
  interAreaFlowOption,
  isMobileViewport,
  selectedFlowDateTimeLabel,
  networkFlowChartHostRef,
  registerNetworkFlowChart,
  networkOverlayViewport,
  japanGuidePaths,
  majorFlowAnimationPaths,
  intertieAnimationPaths,
}: NetworkSectionProps) {
  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel title="エリアネットワーク潮流（地域内送電線）" className="lg:col-span-2" testId="network-flow-panel">
        <div className="mb-3 rounded-xl border border-slate-200/80 bg-gradient-to-r from-slate-50/80 to-white/60 px-4 py-2.5 dark:border-slate-700/60 dark:from-slate-800/60 dark:to-slate-800/40">
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            注: 地域内送電線は、公開CSVから端点を特定できるもののみ表示しています。エリア間連係線は、端点を特定できるものは設備間リンク（SS・CS・変換所間）として、それ以外はエリア間の簡略線として表示しています。発電所と変電所の接続は公開データだけでは確定できないため、省略しています。
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400 dark:text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm bg-emerald-500" />&lt;50%</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm bg-amber-500" />50-70%</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm bg-orange-500" />70-85%</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded-sm bg-red-500" />&ge;85%</span>
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
  );
}
