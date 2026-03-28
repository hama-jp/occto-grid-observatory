/**
 * Core coordinate conversion, station name normalization, and node classification.
 */

import { MAP_VIEWBOX, JAPAN_GEO_BOUNDS, FLOW_AREA_NAME_SET } from "./constants";
import { clamp } from "./formatters";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Coordinate conversion
// ---------------------------------------------------------------------------

export function geoToCanvas(lat: number, lon: number): { x: number; y: number } {
  const xRatio = (lon - JAPAN_GEO_BOUNDS.lonMin) / (JAPAN_GEO_BOUNDS.lonMax - JAPAN_GEO_BOUNDS.lonMin);
  const yRatio = (JAPAN_GEO_BOUNDS.latMax - lat) / (JAPAN_GEO_BOUNDS.latMax - JAPAN_GEO_BOUNDS.latMin);
  return {
    x: MAP_VIEWBOX.padding + xRatio * (MAP_VIEWBOX.width - MAP_VIEWBOX.padding * 2),
    y: MAP_VIEWBOX.padding + yRatio * (MAP_VIEWBOX.height - MAP_VIEWBOX.padding * 2),
  };
}

export function clampPointToMapBounds(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: clamp(point.x, MAP_VIEWBOX.padding, MAP_VIEWBOX.width - MAP_VIEWBOX.padding),
    y: clamp(point.y, MAP_VIEWBOX.padding, MAP_VIEWBOX.height - MAP_VIEWBOX.padding),
  };
}

// ---------------------------------------------------------------------------
// Station name normalization & classification
// ---------------------------------------------------------------------------

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
