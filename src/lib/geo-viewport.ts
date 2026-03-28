/**
 * Network overlay viewport management — ECharts integration for pan/zoom.
 */

import { MAP_VIEWBOX } from "./constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NetworkAnimationPath = {
  id: string;
  d: string;
  strokeWidth: number;
  durationSeconds: number;
  delaySeconds: number;
  /** Normalized 0-1 magnitude for color mapping (0=low flow, 1=high flow) */
  magnitude: number;
  /** "intra" for intra-area flows (default), "intertie" for inter-area interconnection flows */
  kind?: "intra" | "intertie";
  /** AC or DC for intertie lines */
  currentType?: "ac" | "dc";
  /** Label text for the animation path (e.g. station names / MW) */
  label?: string;
  /** Congestion percentage (utilization rate 0-100+) for intertie lines */
  congestionPct?: number;
};

export type NetworkOverlayTransformPart = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

export type NetworkOverlayViewport = {
  width: number;
  height: number;
  raw: NetworkOverlayTransformPart;
  roam: NetworkOverlayTransformPart;
};

export type GraphRoamPayload = {
  dx?: number;
  dy?: number;
  zoom?: number;
  originX?: number;
  originY?: number;
};

export type NetworkFlowChartHostElement = HTMLDivElement & {
  __occtoDispatchGraphRoam?: (payload: GraphRoamPayload) => void;
};

export const DEFAULT_NETWORK_OVERLAY_VIEWPORT: NetworkOverlayViewport = {
  width: MAP_VIEWBOX.width,
  height: MAP_VIEWBOX.height,
  raw: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
  roam: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
};

// ---------------------------------------------------------------------------
// Viewport read / sync
// ---------------------------------------------------------------------------

export function attachNetworkFlowChartRoamHook(chart: unknown, element: NetworkFlowChartHostElement | null): void {
  type GraphSeriesModelLike = {
    subType?: string;
    id?: string;
    componentIndex?: number;
  };

  type EChartsInstanceLike = {
    dispatchAction?: (payload: Record<string, unknown>) => void;
    getModel?: () => {
      getSeries?: () => GraphSeriesModelLike[];
    };
  };

  if (!element) {
    return;
  }

  const instance = chart as EChartsInstanceLike | null;
  if (!instance?.dispatchAction || !instance.getModel) {
    return;
  }

  const graphSeries = instance.getModel()?.getSeries?.()?.find((series) => series.subType === "graph");
  if (!graphSeries) {
    return;
  }

  element.__occtoDispatchGraphRoam = (payload: GraphRoamPayload) => {
    instance.dispatchAction?.({
      type: "graphRoam",
      ...(typeof graphSeries.id === "string" ? { seriesId: graphSeries.id } : { seriesIndex: graphSeries.componentIndex }),
      ...payload,
    });
  };
}

export function readNetworkOverlayViewport(chart: unknown): NetworkOverlayViewport | null {
  type GraphSeriesModelLike = {
    subType?: string;
  };

  type EChartsInstanceLike = {
    getWidth?: () => number;
    getHeight?: () => number;
    getModel?: () => {
      getSeries?: () => GraphSeriesModelLike[];
    };
    getViewOfSeriesModel?: (seriesModel: GraphSeriesModelLike) => {
      group?: {
        childAt?: (index: number) => {
          x?: number;
          y?: number;
          scaleX?: number;
          scaleY?: number;
        } | null;
      };
      _mainGroup?: {
        x?: number;
        y?: number;
        scaleX?: number;
        scaleY?: number;
      };
    } | null;
  };

  const instance = chart as EChartsInstanceLike | null;
  if (!instance?.getWidth || !instance.getHeight || !instance.getModel) {
    return null;
  }

  const width = instance.getWidth();
  const height = instance.getHeight();
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const graphSeries = instance.getModel()?.getSeries?.()?.find((series) => series.subType === "graph");
  if (!graphSeries || !instance.getViewOfSeriesModel) {
    return null;
  }

  const graphView = instance.getViewOfSeriesModel(graphSeries);
  const mainGroup = graphView?._mainGroup ?? graphView?.group?.childAt?.(0);
  if (!mainGroup) {
    return null;
  }

  return {
    width,
    height,
    raw: { x: 0, y: 0, scaleX: 1, scaleY: 1 },
    roam: normalizeNetworkOverlayTransformPart(mainGroup),
  };
}

export function normalizeNetworkOverlayTransformPart(
  transform: Partial<NetworkOverlayTransformPart> | undefined,
): NetworkOverlayTransformPart {
  const x = transform?.x;
  const y = transform?.y;
  const scaleX = transform?.scaleX;
  const scaleY = transform?.scaleY;
  return {
    x: Number.isFinite(x) ? Number(x) : 0,
    y: Number.isFinite(y) ? Number(y) : 0,
    scaleX: Number.isFinite(scaleX) ? Number(scaleX) : 1,
    scaleY: Number.isFinite(scaleY) ? Number(scaleY) : 1,
  };
}

export function areNetworkOverlayViewportsEqual(
  left: NetworkOverlayViewport,
  right: NetworkOverlayViewport,
): boolean {
  return (
    areCloseEnough(left.width, right.width) &&
    areCloseEnough(left.height, right.height) &&
    areNetworkOverlayTransformPartsEqual(left.raw, right.raw) &&
    areNetworkOverlayTransformPartsEqual(left.roam, right.roam)
  );
}

export function areNetworkOverlayTransformPartsEqual(
  left: NetworkOverlayTransformPart,
  right: NetworkOverlayTransformPart,
): boolean {
  return (
    areCloseEnough(left.x, right.x) &&
    areCloseEnough(left.y, right.y) &&
    areCloseEnough(left.scaleX, right.scaleX) &&
    areCloseEnough(left.scaleY, right.scaleY)
  );
}

export function areCloseEnough(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.01;
}

export function formatSvgMatrixTransform(transform: NetworkOverlayTransformPart): string {
  return `matrix(${transform.scaleX} 0 0 ${transform.scaleY} ${transform.x} ${transform.y})`;
}
