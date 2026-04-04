import dynamic from "next/dynamic";
import { type MutableRefObject, useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { buildExpandedFlowNetworkOption } from "@/lib/network-flow-builder";
import type {
  NetworkAnimationPath,
  NetworkOverlayViewport,
  NetworkFlowChartHostElement,
} from "@/lib/geo";
import {
  DEFAULT_NETWORK_OVERLAY_VIEWPORT,
  areNetworkOverlayViewportsEqual,
  attachNetworkFlowChartRoamHook,
  readNetworkOverlayViewport,
  formatSvgMatrixTransform,
  flowMagnitudeColor,
} from "@/lib/geo";
import { MAX_ANIMATED_FLOW_LINES_PER_AREA } from "@/lib/constants";
import { Panel } from "@/components/ui/dashboard-ui";
import { ExpandModal, ExpandIcon } from "@/components/ui/expand-modal";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type NetworkSectionProps = {
  flowNetworkOption: Record<string, unknown>;
  interAreaFlowOption: Record<string, unknown>;
  isMobileViewport: boolean;
  isWideViewport?: boolean;
  selectedFlowDateTimeLabel: string;
  networkFlowChartHostRef: MutableRefObject<NetworkFlowChartHostElement | null>;
  registerNetworkFlowChart: (chart: unknown) => void;
  networkOverlayViewport: NetworkOverlayViewport;
  japanGuidePaths: Array<{ name: string; d: string }>;
  majorFlowAnimationPaths: NetworkAnimationPath[];
  intertieAnimationPaths: NetworkAnimationPath[];
  maxAnimatedFlowLinesPerArea: number;
  onMaxAnimatedFlowLinesPerAreaChange: (value: number) => void;
};

/* ------------------------------------------------------------------ */
/*  Expanded network chart with SVG overlay (for modal)               */
/* ------------------------------------------------------------------ */

function ExpandedNetworkChart({
  option,
  japanGuidePaths,
  majorFlowAnimationPaths,
  intertieAnimationPaths,
}: {
  option: Record<string, unknown>;
  japanGuidePaths: Array<{ name: string; d: string }>;
  majorFlowAnimationPaths: NetworkAnimationPath[];
  intertieAnimationPaths: NetworkAnimationPath[];
}) {
  const hostRef = useRef<NetworkFlowChartHostElement | null>(null);
  const [viewport, setViewport] = useState<NetworkOverlayViewport>(
    DEFAULT_NETWORK_OVERLAY_VIEWPORT,
  );

  const syncViewport = useCallback((chart: unknown) => {
    const next = readNetworkOverlayViewport(chart);
    if (next) {
      setViewport((prev) =>
        areNetworkOverlayViewportsEqual(prev, next) ? prev : next,
      );
    }
  }, []);

  const registerChart = useCallback(
    (chart: unknown) => {
      attachNetworkFlowChartRoamHook(chart, hostRef.current);
      syncViewport(chart);
    },
    [syncViewport],
  );

  return (
    <div className="relative flex-1" ref={hostRef}>
      <ReactECharts
        option={option}
        style={{ height: "calc(85vh - 120px)", width: "100%" }}
        opts={{ renderer: "canvas" }}
        onChartReady={registerChart}
        onEvents={{
          finished: (_event: unknown, chart: unknown) => registerChart(chart),
          graphRoam: (_event: unknown, chart: unknown) => syncViewport(chart),
        }}
      />
      <svg
        className="pointer-events-none absolute inset-0 z-10"
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <g transform={formatSvgMatrixTransform(viewport.roam)}>
          <g transform={formatSvgMatrixTransform(viewport.raw)}>
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
            <IntertieAnimationPaths paths={intertieAnimationPaths} />
          </g>
        </g>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Intertie animation paths renderer (shared between inline & modal) */
/* ------------------------------------------------------------------ */

function IntertieAnimationPaths({ paths }: { paths: NetworkAnimationPath[] }) {
  return (
    <>
      {paths.map((path) => {
        const isDc = path.currentType === "dc";
        const pct = path.congestionPct ?? -1;
        const useCongestionColor = pct >= 0;
        let glowColor: string;
        let dashColor: string;
        let shadowColor: string;
        if (useCongestionColor) {
          const congestionColor =
            pct >= 85 ? { r: 239, g: 68, b: 68 }
            : pct >= 70 ? { r: 249, g: 115, b: 22 }
            : pct >= 50 ? { r: 245, g: 158, b: 11 }
            : { r: 16, g: 185, b: 129 };
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
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Section                                                      */
/* ------------------------------------------------------------------ */

export function NetworkSection({
  flowNetworkOption,
  interAreaFlowOption,
  isMobileViewport,
  isWideViewport,
  selectedFlowDateTimeLabel,
  networkFlowChartHostRef,
  registerNetworkFlowChart,
  networkOverlayViewport,
  japanGuidePaths,
  majorFlowAnimationPaths,
  intertieAnimationPaths,
  maxAnimatedFlowLinesPerArea,
  onMaxAnimatedFlowLinesPerAreaChange,
}: NetworkSectionProps) {
  const [expandedPanel, setExpandedPanel] = useState<"network" | "interarea" | null>(null);
  const handleClose = useCallback(() => setExpandedPanel(null), []);

  const expandedFlowOption = useMemo(
    () => expandedPanel === "network" ? buildExpandedFlowNetworkOption(flowNetworkOption) : null,
    [expandedPanel, flowNetworkOption],
  );

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-3 2xl:grid-cols-4">
      <Panel title="エリアネットワーク潮流（地域内送電線）" className="lg:col-span-2 2xl:col-span-3" testId="network-flow-panel">
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
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-slate-200/60 bg-slate-50/60 px-3 py-2 dark:border-slate-700/50 dark:bg-slate-800/40">
          <label htmlFor="flow-lines-slider" className="shrink-0 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            アニメーション数
          </label>
          <input
            id="flow-lines-slider"
            type="range"
            min={0}
            max={MAX_ANIMATED_FLOW_LINES_PER_AREA * 2}
            step={1}
            value={maxAnimatedFlowLinesPerArea}
            onChange={(e) => onMaxAnimatedFlowLinesPerAreaChange(Number(e.target.value))}
            className="flow-lines-slider h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-teal-500 dark:bg-slate-700"
            aria-label="エリアあたりのアニメーション表示数"
          />
          <span className="min-w-[3ch] text-right text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
            {maxAnimatedFlowLinesPerArea}
          </span>
        </div>
        <div
          data-testid="network-flow-chart"
          role="img"
          aria-label="ネットワーク潮流グラフ"
          className="relative"
          ref={networkFlowChartHostRef}
        >
          <ReactECharts
            option={flowNetworkOption}
            style={{ height: isMobileViewport ? 420 : isWideViewport ? 720 : 620 }}
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
            preserveAspectRatio="xMidYMid meet"
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
                <IntertieAnimationPaths paths={intertieAnimationPaths} />
              </g>
            </g>
          </svg>
          {/* Expand button */}
          <button
            type="button"
            onClick={() => setExpandedPanel("network")}
            className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-md transition-all duration-200 hover:bg-white hover:shadow-lg active:scale-95 dark:bg-slate-800/90 dark:hover:bg-slate-700"
            aria-label="拡大表示"
            title="拡大表示"
          >
            <ExpandIcon />
          </button>
        </div>
      </Panel>
      <Panel title="エリア間連系潮流（実績）" testId="inter-area-flow-panel" className="cursor-pointer">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-slate-600">表示日時: {selectedFlowDateTimeLabel}</span>
          <span className="opacity-0 transition-opacity duration-200 group-hover/panel:opacity-100">
            <ExpandIcon />
          </span>
        </div>
        <div
          data-testid="inter-area-flow-chart"
          role="img"
          aria-label="エリア間連系潮流チャート"
          onClick={() => setExpandedPanel("interarea")}
        >
          <ReactECharts option={interAreaFlowOption} style={{ height: isMobileViewport ? 520 : 594 }} />
        </div>
      </Panel>

      {/* Expanded modals — portal to body to escape backdrop-blur */}
      {expandedPanel === "network" && createPortal(
        <ExpandModal title="エリアネットワーク潮流（地域内送電線）" onClose={handleClose}>
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
          <ExpandedNetworkChart
            option={expandedFlowOption!}
            japanGuidePaths={japanGuidePaths}
            majorFlowAnimationPaths={majorFlowAnimationPaths}
            intertieAnimationPaths={intertieAnimationPaths}
          />
        </ExpandModal>,
        document.body,
      )}

      {expandedPanel === "interarea" && createPortal(
        <ExpandModal title="エリア間連系潮流（実績）" onClose={handleClose}>
          <div className="mb-3 text-sm text-slate-600 dark:text-slate-400">
            表示日時: {selectedFlowDateTimeLabel}
          </div>
          <div className="flex-1" role="img" aria-label="エリア間連系潮流チャート">
            <ReactECharts
              option={interAreaFlowOption}
              style={{ height: "calc(85vh - 100px)", width: "100%" }}
            />
          </div>
        </ExpandModal>,
        document.body,
      )}
    </section>
  );
}
