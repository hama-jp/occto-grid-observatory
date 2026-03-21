import {
  AREA_DISPLAY_ORDER,
  MAP_VIEWBOX,
  JAPAN_GEO_BOUNDS,
  AREA_ANCHOR_FALLBACKS,
  AREA_LAYOUT_BOUND_FALLBACKS,
  FLOW_AREA_NAME_SET,
} from "./constants";
import { clamp, hashSeed } from "./formatters";
import stationLocationDb from "../../data/master/station-location-db.json";

import {
  type GeoHint,
  type CanvasOffsetHint,
  type PlantGeoHint,
  STATION_GEO_HINTS_BY_AREA,
  STATION_CANVAS_OFFSETS_BY_AREA,
  PLANT_GEO_HINTS_BY_AREA,
  INTERTIE_STATION_ENDPOINTS,
  JAPAN_ISLAND_COORDS,
} from "./geo-hints";

export type { GeoHint, CanvasOffsetHint, PlantGeoHint };
export { STATION_GEO_HINTS_BY_AREA, STATION_CANVAS_OFFSETS_BY_AREA, PLANT_GEO_HINTS_BY_AREA, INTERTIE_STATION_ENDPOINTS };

export type StationLocationRecord = {
  area: string;
  name: string;
  aliases?: string[];
  facilityType?: "SS" | "CS" | "PS" | "SWS" | "UNKNOWN";
  address?: string;
  lat: number;
  lon: number;
  source?: string;
  confidence?: "high" | "medium";
  verifiedBy?: string;
  verifiedAt?: string;
  note?: string;
};

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

/**
 * Map a 0-1 magnitude to a color gradient from blue (low) to red (high).
 * Returns an rgba string suitable for SVG stroke.
 */
export function flowMagnitudeColor(magnitude: number, alpha = 0.85): string {
  const t = clamp(magnitude, 0, 1);
  // Blue (low) → Cyan → Yellow → Orange → Red (high)
  let r: number, g: number, b: number;
  if (t < 0.25) {
    const s = t / 0.25;
    r = 30;
    g = Math.round(80 + s * 140);
    b = Math.round(220 - s * 30);
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    r = Math.round(30 + s * 200);
    g = Math.round(220 - s * 20);
    b = Math.round(190 - s * 140);
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    r = Math.round(230 + s * 25);
    g = Math.round(200 - s * 100);
    b = Math.round(50 - s * 30);
  } else {
    const s = (t - 0.75) / 0.25;
    r = 255;
    g = Math.round(100 - s * 70);
    b = Math.round(20 + s * 10);
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

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


export function parseDirection(
  rawDirection: string,
): {
  source: string;
  target: string;
} | null {
  const normalized = rawDirection.replace(/\s+/g, " ").trim();
  const parts = normalized.split(/\s*(?:→|⇒|⇢|->|＞)\s*/).map((part) => part.trim());
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return { source: parts[0], target: parts[1] };
}

export function buildStationNodeId(area: string, station: string): string {
  return `station::${area.trim()}::${station.trim()}`;
}

export function buildPowerNodeId(area: string, plantName: string): string {
  return `power::${area.trim()}::${plantName.trim()}`;
}

export function buildStationLayout(stationsByArea: Map<string, Set<string>>): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  stationsByArea.forEach((stations, area) => {
    const anchor = AREA_ANCHORS[area] ?? AREA_ANCHORS.default;
    const sorted = Array.from(stations).sort((a, b) => a.localeCompare(b, "ja-JP"));

    sorted.forEach((station, index) => {
      const seed = `${area}-${station}-${index}`;
      const hinted = resolveStationGeoBase(area, station);
      const base = hinted ?? clampPointToMapBounds({
        x: anchor.x + ((hashSeed(seed) % 13) - 6),
        y: anchor.y + (((hashSeed(seed + "-y") % 13) - 6) * 0.85),
      });
      positions.set(buildStationNodeId(area, station), base);
    });
  });

  return positions;
}

export function resolveStationGeoBase(area: string, station: string): { x: number; y: number } | null {
  const fromDb = resolveStationLocationFromDb(area, station);
  if (fromDb) {
    return clampPointToMapBounds(geoToCanvas(fromDb.lat, fromDb.lon));
  }
  const normalized = normalizeStationName(station);
  const globalOverride = resolveGlobalStationGeoBase(normalized);
  if (globalOverride) {
    return globalOverride;
  }
  const override = resolveStationCanvasOverride(area, normalized);
  if (override) {
    return override;
  }
  const hints = STATION_GEO_HINTS_BY_AREA[area] ?? [];
  let matched: GeoHint | null = null;
  for (const hint of hints) {
    if (!normalized.includes(hint.keyword)) {
      continue;
    }
    if (!matched || hint.keyword.length > matched.keyword.length) {
      matched = hint;
    }
  }
  if (!matched) {
    return null;
  }

  const point = geoToCanvas(matched.lat, matched.lon);
  return clampPointToMapBounds(point);
}

export function resolvePlantGeoBase(area: string, plantName: string): { x: number; y: number } | null {
  const fromDb = resolveStationLocationFromDb(area, plantName);
  if (fromDb) {
    return clampPointToMapBounds(geoToCanvas(fromDb.lat, fromDb.lon));
  }
  const normalized = normalizeStationName(plantName);
  const hints = PLANT_GEO_HINTS_BY_AREA[area] ?? [];
  let matched: PlantGeoHint | null = null;
  for (const hint of hints) {
    if (!normalized.includes(normalizeStationName(hint.keyword))) {
      continue;
    }
    if (!matched || hint.keyword.length > matched.keyword.length) {
      matched = hint;
    }
  }
  if (!matched) {
    return resolveStationGeoBase(area, plantName);
  }
  const point = geoToCanvas(matched.lat, matched.lon);
  return clampPointToMapBounds(point);
}

export function resolveStationCanvasOverride(area: string, normalizedStation: string): { x: number; y: number } | null {
  const hints = STATION_CANVAS_OFFSETS_BY_AREA[area] ?? [];
  const matched = hints.find((hint) => normalizedStation.includes(hint.keyword));
  if (!matched) {
    return null;
  }
  const anchor = AREA_ANCHORS[area] ?? AREA_ANCHORS.default;
  return clampPointToMapBounds({
    x: anchor.x + matched.dx,
    y: anchor.y + matched.dy,
  });
}

export function resolveGlobalStationGeoBase(normalizedStation: string): { x: number; y: number } | null {
  if (!normalizedStation.includes("山陰")) {
    return null;
  }
  const saninPoint = geoToCanvas(35.4681, 133.0484);
  return {
    x: clamp(saninPoint.x, MAP_VIEWBOX.padding, MAP_VIEWBOX.width - MAP_VIEWBOX.padding),
    y: clamp(saninPoint.y, MAP_VIEWBOX.padding, MAP_VIEWBOX.height - MAP_VIEWBOX.padding),
  };
}

export function resolveStationLocationFromDb(area: string, stationOrPlantName: string): StationLocationRecord | null {
  const normalizedInput = normalizeStationName(stationOrPlantName);
  if (!normalizedInput) {
    return null;
  }

  let areaMatch: StationLocationRecord | null = null;
  let crossAreaMatch: StationLocationRecord | null = null;
  for (const record of stationLocationDb.records as StationLocationRecord[]) {
    const candidates = [record.name, ...(record.aliases ?? [])]
      .map((entry) => normalizeStationName(entry))
      .filter(Boolean);
    const matched = candidates.some((candidate) => candidate === normalizedInput);
    if (!matched) {
      continue;
    }
    if (record.area === area) {
      areaMatch = record;
      break;
    }
    if (!crossAreaMatch) {
      crossAreaMatch = record;
    }
  }

  return areaMatch ?? crossAreaMatch;
}

export function normalizeStationName(station: string): string {
  return station
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/第?[0-9]+号(?:機|系列)?/g, "")
    .replace(/[0-9]+(?:号機|号系列|系列|軸)/g, "")
    .replace(/新[0-9]+号機/g, "")
    .replace(/変電所|開閉所|変換所|発電所|火力|幹線|連系線|SS|ss|SWS|sws|CS|cs|PS|ps/g, "");
}

export function isPseudoAreaNodeName(name: string): boolean {
  const normalized = name
    .trim()
    .replace(/[!！?？]/g, "")
    .replace(/\s+/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/エリア/g, "");
  return FLOW_AREA_NAME_SET.has(normalized);
}

export function isLineLikeNodeName(name: string): boolean {
  const normalized = name
    .trim()
    .replace(/[!！?？]/g, "")
    .replace(/\s+/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "");
  if (normalized.includes("幹線") && !/(変電所|開閉所|変換所|発電所|SS|ss|SWS|sws|CS|cs|PS|ps)/.test(normalized)) {
    return true;
  }
  if (/(^|[^A-Za-z0-9])(幹線|連系線|フェンス|火力線|支線)$/.test(normalized)) {
    return true;
  }
  if (normalized.endsWith("線") && !/(変電所|開閉所|変換所|発電所|SS|ss|SWS|sws|CS|cs|PS|ps|T)$/.test(normalized)) {
    return true;
  }
  return false;
}

export function isCompositeFacilityNodeName(name: string): boolean {
  const normalized = name.trim().normalize("NFKC").replace(/\s+/g, "");
  if (!/[・,，、\/／]/.test(normalized)) {
    return false;
  }
  const matches = normalized.match(/(変電所|開閉所|変換所|発電所|SS|PS|CS|SWS)/gi) ?? [];
  return matches.length >= 2;
}

export function isVirtualBranchNodeName(name: string): boolean {
  const normalized = name.trim().normalize("NFKC").replace(/\s+/g, "");
  if (!normalized) {
    return false;
  }
  if (/[0-9]+T(?:[（(].*)?$/i.test(normalized)) {
    return true;
  }
  return normalized === "電名" || normalized === "分岐点";
}

export function isConverterStationName(name: string): boolean {
  const normalized = name
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();
  if (normalized.includes("変換所") || normalized.includes("変換設備")) {
    return true;
  }
  if (/cs$/.test(normalized)) {
    return true;
  }
  return false;
}

export function geoToCanvas(lat: number, lon: number): { x: number; y: number } {
  const xRatio = (lon - JAPAN_GEO_BOUNDS.lonMin) / (JAPAN_GEO_BOUNDS.lonMax - JAPAN_GEO_BOUNDS.lonMin);
  const yRatio = (JAPAN_GEO_BOUNDS.latMax - lat) / (JAPAN_GEO_BOUNDS.latMax - JAPAN_GEO_BOUNDS.latMin);
  return {
    x: MAP_VIEWBOX.padding + xRatio * (MAP_VIEWBOX.width - MAP_VIEWBOX.padding * 2),
    y: MAP_VIEWBOX.padding + yRatio * (MAP_VIEWBOX.height - MAP_VIEWBOX.padding * 2),
  };
}

export function buildAreaGeoCanvasExtents(): Record<string, { xMin: number; xMax: number; yMin: number; yMax: number }> {
  const extents = new Map<string, { xMin: number; xMax: number; yMin: number; yMax: number }>();
  const register = (area: string, lat: number, lon: number): void => {
    const point = geoToCanvas(lat, lon);
    const current = extents.get(area);
    if (!current) {
      extents.set(area, {
        xMin: point.x,
        xMax: point.x,
        yMin: point.y,
        yMax: point.y,
      });
      return;
    }
    current.xMin = Math.min(current.xMin, point.x);
    current.xMax = Math.max(current.xMax, point.x);
    current.yMin = Math.min(current.yMin, point.y);
    current.yMax = Math.max(current.yMax, point.y);
  };

  (stationLocationDb.records as StationLocationRecord[]).forEach((record) => {
    register(record.area, record.lat, record.lon);
  });

  Object.entries(STATION_GEO_HINTS_BY_AREA).forEach(([area, hints]) => {
    hints.forEach((hint) => register(area, hint.lat, hint.lon));
  });
  Object.entries(PLANT_GEO_HINTS_BY_AREA).forEach(([area, hints]) => {
    hints.forEach((hint) => register(area, hint.lat, hint.lon));
  });

  return Object.fromEntries(extents.entries());
}

export function buildAreaLayoutBounds(): Record<string, { xMin: number; xMax: number; yMin: number; yMax: number }> {
  const bounds = new Map<string, { xMin: number; xMax: number; yMin: number; yMax: number }>();

  AREA_DISPLAY_ORDER.forEach((area) => {
    const extent = AREA_GEO_CANVAS_EXTENTS[area];
    if (!extent) {
      const fallback = AREA_LAYOUT_BOUND_FALLBACKS[area] ?? AREA_LAYOUT_BOUND_FALLBACKS.default;
      bounds.set(area, fallback);
      return;
    }

    const spanX = extent.xMax - extent.xMin;
    const spanY = extent.yMax - extent.yMin;
    const paddingX = Math.max(12, Math.min(28, spanX * 0.16));
    const paddingY = Math.max(12, Math.min(24, spanY * 0.18));
    const minWidth = 88;
    const minHeight = 64;
    const centerX = (extent.xMin + extent.xMax) / 2;
    const centerY = (extent.yMin + extent.yMax) / 2;
    const halfWidth = Math.max(minWidth, spanX + paddingX * 2) / 2;
    const halfHeight = Math.max(minHeight, spanY + paddingY * 2) / 2;

    bounds.set(area, {
      xMin: clamp(centerX - halfWidth, MAP_VIEWBOX.padding, MAP_VIEWBOX.width - MAP_VIEWBOX.padding),
      xMax: clamp(centerX + halfWidth, MAP_VIEWBOX.padding, MAP_VIEWBOX.width - MAP_VIEWBOX.padding),
      yMin: clamp(centerY - halfHeight, MAP_VIEWBOX.padding, MAP_VIEWBOX.height - MAP_VIEWBOX.padding),
      yMax: clamp(centerY + halfHeight, MAP_VIEWBOX.padding, MAP_VIEWBOX.height - MAP_VIEWBOX.padding),
    });
  });

  bounds.set("default", AREA_LAYOUT_BOUND_FALLBACKS.default);
  return Object.fromEntries(bounds.entries());
}

export function buildAreaAnchors(): Record<string, { x: number; y: number }> {
  const anchors = new Map<string, { x: number; y: number }>();

  AREA_DISPLAY_ORDER.forEach((area) => {
    const bounds = AREA_LAYOUT_BOUNDS[area];
    if (!bounds) {
      anchors.set(area, AREA_ANCHOR_FALLBACKS[area] ?? AREA_ANCHOR_FALLBACKS.default);
      return;
    }
    anchors.set(area, {
      x: (bounds.xMin + bounds.xMax) / 2,
      y: (bounds.yMin + bounds.yMax) / 2,
    });
  });

  anchors.set("default", AREA_ANCHOR_FALLBACKS.default);
  return Object.fromEntries(anchors.entries());
}

export function buildLinkCurvenessMap(
  links: Array<{ source: string; target: string }>,
  positions: Map<string, { x: number; y: number }>,
): Map<string, number> {
  const offsetsByNode = new Map<string, Map<string, number>>();

  const registerNodeOffsets = (nodeId: string, sortAngle: (link: { source: string; target: string }) => number): void => {
    const incidentLinks = links.filter((link) => link.source === nodeId || link.target === nodeId);
    const nodePosition = positions.get(nodeId);
    if (!nodePosition || incidentLinks.length === 0) {
      return;
    }

    incidentLinks.sort((a, b) => sortAngle(a) - sortAngle(b));
    const offsets = new Map<string, number>();
    const center = (incidentLinks.length - 1) / 2;
    incidentLinks.forEach((link, index) => {
      const key = `${link.source}=>${link.target}`;
      offsets.set(key, (index - center) * 0.034);
    });
    offsetsByNode.set(nodeId, offsets);
  };

  positions.forEach((_position, nodeId) => {
    registerNodeOffsets(nodeId, (link) => {
      const from = positions.get(nodeId);
      const other = positions.get(link.source === nodeId ? link.target : link.source);
      if (!from || !other) {
        return 0;
      }
      return Math.atan2(other.y - from.y, other.x - from.x);
    });
  });

  const curvenessByLink = new Map<string, number>();
  links.forEach((link) => {
    const key = `${link.source}=>${link.target}`;
    const sourceOffset = offsetsByNode.get(link.source)?.get(key) ?? 0;
    const targetOffset = offsetsByNode.get(link.target)?.get(key) ?? 0;
    const curveness = clamp((sourceOffset - targetOffset) * 0.85, -0.22, 0.22);
    const adjusted = Math.abs(curveness) < 0.018 ? (curveness < 0 ? -0.018 : 0.018) : curveness;
    curvenessByLink.set(key, adjusted);
  });
  return curvenessByLink;
}

export function buildCurvedLineCoords(
  from: { x: number; y: number },
  to: { x: number; y: number },
  curveness: number,
): Array<[number, number]> {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const offset = length * curveness * 0.95;

  return [
    [from.x, from.y],
    [midX + normalX * offset, midY + normalY * offset],
    [to.x, to.y],
  ];
}

export function buildSvgQuadraticPath(coords: Array<[number, number]>): string {
  if (coords.length < 3) {
    return "";
  }
  const [[startX, startY], [controlX, controlY], [endX, endY]] = coords;
  return `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
}

export function formatSvgMatrixTransform(transform: NetworkOverlayTransformPart): string {
  return `matrix(${transform.scaleX} 0 0 ${transform.scaleY} ${transform.x} ${transform.y})`;
}

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

export function buildAreaBridgeEndpoints(
  sourceArea: string,
  targetArea: string,
): { from: { x: number; y: number }; to: { x: number; y: number }; curveness: number } | null {
  const sourceBounds = getAreaLayoutBounds(sourceArea);
  const targetBounds = getAreaLayoutBounds(targetArea);
  if (!sourceBounds || !targetBounds) {
    return null;
  }

  const sourceCenter = {
    x: (sourceBounds.xMin + sourceBounds.xMax) / 2,
    y: (sourceBounds.yMin + sourceBounds.yMax) / 2,
  };
  const targetCenter = {
    x: (targetBounds.xMin + targetBounds.xMax) / 2,
    y: (targetBounds.yMin + targetBounds.yMax) / 2,
  };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  let from = projectPointToAreaEdge(sourceBounds, { x: dx, y: dy });
  let to = projectPointToAreaEdge(targetBounds, { x: -dx, y: -dy });
  const directDistance = Math.hypot(to.x - from.x, to.y - from.y);
  if (directDistance < 26) {
    const expandedSourceBounds = expandAreaBounds(sourceBounds, 18);
    const expandedTargetBounds = expandAreaBounds(targetBounds, 18);
    from = projectPointToAreaEdge(expandedSourceBounds, { x: dx, y: dy });
    to = projectPointToAreaEdge(expandedTargetBounds, { x: -dx, y: -dy });
  }
  const curveness = clamp((Math.abs(dy) > Math.abs(dx) ? 0.08 : 0.05) * Math.sign(dx || 1), -0.12, 0.12);

  return { from, to, curveness };
}

export function expandAreaBounds(
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  margin: number,
): { xMin: number; xMax: number; yMin: number; yMax: number } {
  return {
    xMin: bounds.xMin - margin,
    xMax: bounds.xMax + margin,
    yMin: bounds.yMin - margin,
    yMax: bounds.yMax + margin,
  };
}

export function projectPointToAreaEdge(
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  direction: { x: number; y: number },
): { x: number; y: number } {
  const center = {
    x: (bounds.xMin + bounds.xMax) / 2,
    y: (bounds.yMin + bounds.yMax) / 2,
  };
  const dx = direction.x || 0.001;
  const dy = direction.y || 0.001;
  const candidates = [
    (bounds.xMax - center.x) / dx,
    (bounds.xMin - center.x) / dx,
    (bounds.yMax - center.y) / dy,
    (bounds.yMin - center.y) / dy,
  ].filter((value) => Number.isFinite(value) && value > 0);
  const scale = Math.min(...candidates, 1);
  return {
    x: clamp(center.x + dx * scale, bounds.xMin, bounds.xMax),
    y: clamp(center.y + dy * scale, bounds.yMin, bounds.yMax),
  };
}

export function getAreaLayoutBounds(area: string): { xMin: number; xMax: number; yMin: number; yMax: number } {
  return AREA_LAYOUT_BOUNDS[area] ?? AREA_LAYOUT_BOUND_FALLBACKS.default;
}

export function clampPointToMapBounds(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: clamp(point.x, MAP_VIEWBOX.padding, MAP_VIEWBOX.width - MAP_VIEWBOX.padding),
    y: clamp(point.y, MAP_VIEWBOX.padding, MAP_VIEWBOX.height - MAP_VIEWBOX.padding),
  };
}

export function isNetworkPowerPlantSource(sourceType: string): boolean {
  const normalized = sourceType.trim();
  if (normalized.includes("火力")) {
    return true;
  }
  if (normalized.includes("原子力")) {
    return true;
  }
  if (normalized.includes("水力")) {
    return true;
  }
  return false;
}

export function buildJapanGuideGraphics(): Array<Record<string, unknown>> {
  return JAPAN_ISLAND_COORDS.map((island) => {
    const points = island.coords.map(([lat, lon]) => {
      const pt = geoToCanvas(lat, lon);
      return [pt.x, pt.y] as [number, number];
    });

    return {
      type: "polygon",
      z: -1,
      silent: true,
      shape: {
        points,
      },
      style: {
        fill: "rgba(203,213,225,0.12)",
        stroke: "rgba(148,163,184,0.22)",
        lineWidth: 1,
      },
    };
  });
}

/** Returns SVG path `d` strings for Japan's islands, in canvas coordinates. */
export function buildJapanGuideSvgPaths(): Array<{ name: string; d: string }> {
  return JAPAN_ISLAND_COORDS.map((island) => {
    const d = island.coords
      .map(([lat, lon], i) => {
        const pt = geoToCanvas(lat, lon);
        return `${i === 0 ? "M" : "L"}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`;
      })
      .join(" ") + " Z";
    return { name: island.name, d };
  });
}

// Module-level computed constants (depend on the functions above)
export const AREA_GEO_CANVAS_EXTENTS = buildAreaGeoCanvasExtents();
export const AREA_LAYOUT_BOUNDS = buildAreaLayoutBounds();
export const AREA_ANCHORS = buildAreaAnchors();
