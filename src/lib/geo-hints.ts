/**
 * Typed geo-hint data for station/plant/intertie location resolution.
 *
 * Raw data is stored in JSON files under data/master/ to keep this module lean.
 * This file provides types and typed re-exports.
 */

import stationGeoHintsRaw from "../../data/master/station-geo-hints.json";
import plantGeoHintsRaw from "../../data/master/plant-geo-hints.json";
import japanIslandCoordsRaw from "../../data/master/japan-island-coords.json";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GeoHint = {
  keyword: string;
  lat: number;
  lon: number;
};

export type CanvasOffsetHint = {
  keyword: string;
  dx: number;
  dy: number;
};

export type PlantGeoHint = {
  keyword: string;
  lat: number;
  lon: number;
};

// ---------------------------------------------------------------------------
// Station hints (keyword → lat/lon by area)
// ---------------------------------------------------------------------------

export const STATION_GEO_HINTS_BY_AREA: Record<string, GeoHint[]> =
  stationGeoHintsRaw as Record<string, GeoHint[]>;

// ---------------------------------------------------------------------------
// Canvas offset overrides (small number, kept inline)
// ---------------------------------------------------------------------------

export const STATION_CANVAS_OFFSETS_BY_AREA: Record<string, CanvasOffsetHint[]> = {
  中国: [{ keyword: "山陰", dx: -8, dy: -46 }],
};

// ---------------------------------------------------------------------------
// Plant hints (keyword → lat/lon by area)
// ---------------------------------------------------------------------------

export const PLANT_GEO_HINTS_BY_AREA: Record<string, PlantGeoHint[]> =
  plantGeoHintsRaw as Record<string, PlantGeoHint[]>;

// ---------------------------------------------------------------------------
// Intertie station endpoints (intertie name → source/target stations)
// ---------------------------------------------------------------------------

export const INTERTIE_STATION_ENDPOINTS: Record<
  string,
  {
    sourceArea: string;
    sourceStation: string;
    targetArea: string;
    targetStation: string;
    currentType: "ac" | "dc";
  }
> = {
  // 北海道 ↔ 東北（直流）
  "北海道・本州間電力連系設備": {
    sourceArea: "北海道",
    sourceStation: "函館変換所",
    targetArea: "東北",
    targetStation: "上北",
    currentType: "dc",
  },
  // 東北 ↔ 東京（交流 500kV）
  相馬双葉幹線: {
    sourceArea: "東北",
    sourceStation: "南相馬変電所",
    targetArea: "東京",
    targetStation: "南いわき",
    currentType: "ac",
  },
  // 東京 ↔ 中部（周波数変換 DC）
  周波数変換設備: {
    sourceArea: "東京",
    sourceStation: "新信濃",
    targetArea: "中部",
    targetStation: "東清水",
    currentType: "dc",
  },
  // 中部 ↔ 関西（交流 500kV）
  三重東近江線: {
    sourceArea: "中部",
    sourceStation: "三重",
    targetArea: "関西",
    targetStation: "東近江開閉所",
    currentType: "ac",
  },
  // 中部 ↔ 北陸（BTB 直流）
  北陸フェンス: {
    sourceArea: "中部",
    sourceStation: "南福光",
    targetArea: "北陸",
    targetStation: "加賀変電所",
    currentType: "dc",
  },
  // 北陸 ↔ 関西（交流 500kV）
  越前嶺南線: {
    sourceArea: "北陸",
    sourceStation: "越前変電所",
    targetArea: "関西",
    targetStation: "嶺南変電所",
    currentType: "ac",
  },
  // 北陸 ↔ 関西（南福光経由）
  "南福光連系所・南福光変電所の連系設備": {
    sourceArea: "北陸",
    sourceStation: "南福光変電所",
    targetArea: "関西",
    targetStation: "嶺南変電所",
    currentType: "dc",
  },
  // 関西 ↔ 中国（交流 500kV × 2 ルート）
  "西播東岡山線・山崎智頭線": {
    sourceArea: "関西",
    sourceStation: "西播変電所",
    targetArea: "中国",
    targetStation: "東岡山（変）",
    currentType: "ac",
  },
  // 中国 ↔ 四国（交流 500kV 瀬戸大橋添架）
  本四連系線: {
    sourceArea: "中国",
    sourceStation: "東岡山（変）",
    targetArea: "四国",
    targetStation: "讃岐SS",
    currentType: "ac",
  },
  // 中国 ↔ 九州（交流 500kV 関門海峡横断）
  関門連系線: {
    sourceArea: "中国",
    sourceStation: "新山口（変）",
    targetArea: "九州",
    targetStation: "北九州ss",
    currentType: "ac",
  },
  // 四国 ↔ 関西（直流）
  阿南紀北直流幹線: {
    sourceArea: "四国",
    sourceStation: "阿南CS",
    targetArea: "関西",
    targetStation: "紀北変換所",
    currentType: "dc",
  },
};

// ---------------------------------------------------------------------------
// Japan island outlines (lat/lon polygon coordinates)
// ---------------------------------------------------------------------------

export const JAPAN_ISLAND_COORDS: Array<{ name: string; coords: Array<[number, number]> }> =
  japanIslandCoordsRaw as Array<{ name: string; coords: Array<[number, number]> }>;
