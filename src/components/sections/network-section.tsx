import dynamic from "next/dynamic";
import { type MutableRefObject, type ReactNode, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type {
  NetworkAnimationPath,
  NetworkOverlayViewport,
  NetworkFlowChartHostElement,
} from "@/lib/geo";
import {
  formatSvgMatrixTransform,
  flowMagnitudeColor,
} from "@/lib/geo";
import { MAX_ANIMATED_FLOW_LINES_PER_AREA } from "@/lib/constants";
import { Panel } from "@/components/ui/dashboard-ui";

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
/*  Generic full-window expand modal                                  */
/* ------------------------------------------------------------------ */

function ExpandModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex h-[95vh] w-[96vw] max-w-[1800px] flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50 shadow-2xl dark:border-slate-700/80 dark:from-slate-900 dark:to-slate-850"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200/60 px-6 py-4 dark:border-slate-700/60">
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
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
        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Expand icon (reusable)                                            */
/* ------------------------------------------------------------------ */

function ExpandIcon() {
  return (
    <span className="text-slate-300 transition-colors group-hover/panel:text-slate-500 dark:text-slate-600 dark:group-hover/panel:text-slate-400">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2h4v4M6 14H2v-4M14 2L9.5 6.5M2 14l4.5-4.5" />
      </svg>
    </span>
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

  return (
    <section className="grid grid-cols-1 gap-4 lg:grid-cols-3 2xl:grid-cols-4">
      <Panel title="エリアネットワーク潮流（地域内送電線）" className="lg:col-span-2 2xl:col-span-3 cursor-pointer" testId="network-flow-panel">
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
          onClick={() => setExpandedPanel("network")}
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
                <IntertieAnimationPaths paths={intertieAnimationPaths} />
              </g>
            </g>
          </svg>
          {/* Expand hint overlay */}
          <div className="absolute right-3 top-3 z-20 rounded-full bg-white/80 p-1.5 opacity-0 shadow-sm transition-opacity duration-200 group-hover/panel:opacity-100 dark:bg-slate-800/80">
            <ExpandIcon />
          </div>
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
          <div className="relative flex-1">
            <ReactECharts
              option={flowNetworkOption}
              style={{ height: "calc(85vh - 120px)", width: "100%" }}
              opts={{ renderer: "canvas" }}
            />
          </div>
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
