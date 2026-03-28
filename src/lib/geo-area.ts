/**
 * Area layout bounds, anchors, and bridge endpoints for the network map.
 */

import {
  AREA_DISPLAY_ORDER,
  MAP_VIEWBOX,
  AREA_ANCHOR_FALLBACKS,
  AREA_LAYOUT_BOUND_FALLBACKS,
} from "./constants";
import { clamp, hashSeed } from "./formatters";
import stationLocationDb from "../../data/master/station-location-db.json";
import {
  type GeoHint,
  type PlantGeoHint,
  STATION_GEO_HINTS_BY_AREA,
  STATION_CANVAS_OFFSETS_BY_AREA,
  PLANT_GEO_HINTS_BY_AREA,
} from "./geo-hints";
import {
  type StationLocationRecord,
  geoToCanvas,
  clampPointToMapBounds,
  normalizeStationName,
  buildStationNodeId,
} from "./geo-coordinates";

// ---------------------------------------------------------------------------
// Station / plant geo resolution
// ---------------------------------------------------------------------------

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
  const hints: GeoHint[] = STATION_GEO_HINTS_BY_AREA[area] ?? [];
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
  const hints: PlantGeoHint[] = PLANT_GEO_HINTS_BY_AREA[area] ?? [];
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

// ---------------------------------------------------------------------------
// Area extents / layout bounds / anchors
// ---------------------------------------------------------------------------

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

// Module-level computed constants
export const AREA_GEO_CANVAS_EXTENTS = buildAreaGeoCanvasExtents();
export const AREA_LAYOUT_BOUNDS = buildAreaLayoutBounds();
export const AREA_ANCHORS = buildAreaAnchors();
