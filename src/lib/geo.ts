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

export const STATION_GEO_HINTS_BY_AREA: Record<string, GeoHint[]> = {
  北海道: [
    { keyword: "札幌", lat: 43.0618, lon: 141.3545 },
    { keyword: "旭川", lat: 43.7706, lon: 142.365 },
    { keyword: "函館", lat: 41.7687, lon: 140.7288 },
    { keyword: "室蘭", lat: 42.3152, lon: 140.9736 },
    { keyword: "苫小牧", lat: 42.6342, lon: 141.603 },
    { keyword: "釧路", lat: 42.9849, lon: 144.381 },
    { keyword: "滝川", lat: 43.5578, lon: 141.906 },
    { keyword: "名寄", lat: 44.3552, lon: 142.457 },
    { keyword: "小樽", lat: 43.1907, lon: 140.994 },
    { keyword: "江別", lat: 43.103, lon: 141.536 },
    { keyword: "当別", lat: 43.216, lon: 141.517 },
    { keyword: "芽室", lat: 42.9102, lon: 143.0512 },
    { keyword: "音更", lat: 42.9913, lon: 143.2 },
    { keyword: "七飯", lat: 41.886, lon: 140.6886 },
    { keyword: "新得", lat: 43.0772, lon: 142.8382 },
    { keyword: "追分", lat: 42.879, lon: 141.816 },
    { keyword: "双葉", lat: 42.64, lon: 141.7 },
  ],
  東北: [
    { keyword: "青森", lat: 40.8222, lon: 140.7474 },
    { keyword: "秋田", lat: 39.7186, lon: 140.1024 },
    { keyword: "岩手", lat: 39.7036, lon: 141.1527 },
    { keyword: "宮城", lat: 38.2688, lon: 140.8721 },
    { keyword: "仙台", lat: 38.2688, lon: 140.8721 },
    { keyword: "福島", lat: 37.7608, lon: 140.4747 },
    { keyword: "いわき", lat: 37.0505, lon: 140.8877 },
    { keyword: "石巻", lat: 38.4343, lon: 141.3021 },
    { keyword: "名取", lat: 38.1742, lon: 140.8912 },
    { keyword: "須賀川", lat: 37.2861, lon: 140.3726 },
    { keyword: "山形", lat: 38.2554, lon: 140.3396 },
    { keyword: "米沢", lat: 37.9222, lon: 140.1165 },
    { keyword: "新庄", lat: 38.759, lon: 140.3008 },
    { keyword: "新潟", lat: 37.9162, lon: 139.0364 },
    { keyword: "上越", lat: 37.1486, lon: 138.2364 },
    { keyword: "中越", lat: 37.4465, lon: 138.8514 },
    { keyword: "信濃川", lat: 37.4465, lon: 138.8514 },
    { keyword: "能代", lat: 40.2039, lon: 140.0276 },
    { keyword: "羽後", lat: 39.2286, lon: 140.4128 },
    { keyword: "越後", lat: 37.9162, lon: 139.0364 },
    { keyword: "水沢", lat: 39.1393, lon: 141.1393 },
    { keyword: "上北", lat: 40.6122, lon: 141.2056 },
    { keyword: "雫石", lat: 39.6968, lon: 140.9756 },
  ],
  東京: [
    { keyword: "東京", lat: 35.6764, lon: 139.65 },
    { keyword: "上野", lat: 35.7138, lon: 139.777 },
    { keyword: "新宿", lat: 35.6938, lon: 139.7036 },
    { keyword: "豊島", lat: 35.731, lon: 139.716 },
    { keyword: "永代橋", lat: 35.6748, lon: 139.7905 },
    { keyword: "江東", lat: 35.6738, lon: 139.8171 },
    { keyword: "高輪", lat: 35.638, lon: 139.7365 },
    { keyword: "京浜", lat: 35.53, lon: 139.703 },
    { keyword: "川崎", lat: 35.5308, lon: 139.703 },
    { keyword: "世田谷", lat: 35.6464, lon: 139.6532 },
    { keyword: "練馬", lat: 35.7356, lon: 139.6517 },
    { keyword: "港北", lat: 35.518, lon: 139.6346 },
    { keyword: "荏田", lat: 35.5452, lon: 139.5533 },
    { keyword: "多摩", lat: 35.6369, lon: 139.4468 },
    { keyword: "西東京", lat: 35.7257, lon: 139.5387 },
    { keyword: "房総", lat: 35.34, lon: 140.2 },
    { keyword: "木更津", lat: 35.3812, lon: 139.9168 },
    { keyword: "千葉", lat: 35.6074, lon: 140.1065 },
    { keyword: "印西", lat: 35.8329, lon: 140.1458 },
    { keyword: "葛南", lat: 35.6946, lon: 139.9824 },
    { keyword: "野田", lat: 35.9546, lon: 139.8741 },
    { keyword: "古河", lat: 36.1786, lon: 139.7557 },
    { keyword: "筑波", lat: 36.0824, lon: 140.1118 },
    { keyword: "鹿島", lat: 35.9659, lon: 140.6448 },
    { keyword: "那珂", lat: 36.4575, lon: 140.4866 },
    { keyword: "栃木", lat: 36.381, lon: 139.73 },
    { keyword: "今市", lat: 36.72, lon: 139.68 },
    { keyword: "群馬", lat: 36.39, lon: 139.06 },
    { keyword: "榛名", lat: 36.47, lon: 138.96 },
    { keyword: "坂戸", lat: 35.9576, lon: 139.3974 },
    { keyword: "狭山", lat: 35.8569, lon: 139.4122 },
    { keyword: "所沢", lat: 35.7997, lon: 139.4686 },
    { keyword: "熊谷", lat: 36.1473, lon: 139.3886 },
    { keyword: "上尾", lat: 35.9719, lon: 139.593 },
    { keyword: "与野", lat: 35.8846, lon: 139.6334 },
    { keyword: "富士", lat: 35.1613, lon: 138.6763 },
    { keyword: "秩父", lat: 35.9917, lon: 139.0858 },
    { keyword: "飯能", lat: 35.856, lon: 139.327 },
    { keyword: "秦野", lat: 35.3722, lon: 139.2239 },
    { keyword: "岡部", lat: 36.1324, lon: 139.281 },
    { keyword: "横須賀", lat: 35.281, lon: 139.672 },
    { keyword: "信濃", lat: 36.4, lon: 138.19 },
    { keyword: "福島", lat: 37.7608, lon: 140.4747 },
    { keyword: "いわき", lat: 37.0505, lon: 140.8877 },
  ],
  中部: [
    { keyword: "名古屋", lat: 35.1815, lon: 136.9066 },
    { keyword: "三重", lat: 34.7303, lon: 136.5086 },
    { keyword: "伊勢", lat: 34.4876, lon: 136.7091 },
    { keyword: "鈴鹿", lat: 34.8823, lon: 136.5847 },
    { keyword: "岐阜", lat: 35.4233, lon: 136.7606 },
    { keyword: "犬山", lat: 35.3786, lon: 136.9444 },
    { keyword: "瀬戸", lat: 35.2238, lon: 137.0842 },
    { keyword: "豊田", lat: 35.0822, lon: 137.1563 },
    { keyword: "碧南", lat: 34.8846, lon: 136.9932 },
    { keyword: "幸田", lat: 34.8649, lon: 137.1657 },
    { keyword: "三河", lat: 34.96, lon: 137.15 },
    { keyword: "東海", lat: 35.02, lon: 136.89 },
    { keyword: "知多", lat: 34.9987, lon: 136.8619 },
    { keyword: "川越", lat: 35.0135, lon: 136.6723 },
    { keyword: "静岡", lat: 34.9756, lon: 138.3828 },
    { keyword: "清水", lat: 35.0157, lon: 138.4896 },
    { keyword: "浜岡", lat: 34.6235, lon: 138.1305 },
    { keyword: "駿河", lat: 35.0, lon: 138.4 },
    { keyword: "遠江", lat: 34.75, lon: 137.72 },
    { keyword: "信濃", lat: 36.4, lon: 138.19 },
    { keyword: "南信", lat: 35.65, lon: 137.85 },
    { keyword: "中信", lat: 36.23, lon: 137.97 },
    { keyword: "北信", lat: 36.65, lon: 138.18 },
    { keyword: "東信", lat: 36.4, lon: 138.25 },
    { keyword: "西濃", lat: 35.37, lon: 136.61 },
    { keyword: "中濃", lat: 35.53, lon: 136.96 },
    { keyword: "飛騨", lat: 36.24, lon: 137.19 },
    { keyword: "尾鷲", lat: 34.07, lon: 136.19 },
    { keyword: "高根", lat: 35.95, lon: 137.53 },
    { keyword: "佐久", lat: 36.24, lon: 138.48 },
    { keyword: "佐久間", lat: 34.96, lon: 137.81 },
    { keyword: "福光", lat: 36.56, lon: 136.88 },
  ],
  北陸: [
    { keyword: "富山", lat: 36.6953, lon: 137.2113 },
    { keyword: "福井", lat: 36.0641, lon: 136.2196 },
    { keyword: "敦賀", lat: 35.6452, lon: 136.0552 },
    { keyword: "加賀", lat: 36.3022, lon: 136.3148 },
    { keyword: "金津", lat: 36.2304, lon: 136.2298 },
    { keyword: "越前", lat: 35.9038, lon: 136.1681 },
    { keyword: "能登", lat: 37.2825, lon: 137.1482 },
    { keyword: "福光", lat: 36.56, lon: 136.88 },
    { keyword: "城端", lat: 36.5698, lon: 136.8894 },
    { keyword: "中能登", lat: 36.989, lon: 136.9136 },
    { keyword: "南条", lat: 35.8412, lon: 136.1923 },
  ],
  関西: [
    { keyword: "大阪", lat: 34.6937, lon: 135.5023 },
    { keyword: "淀川", lat: 34.74, lon: 135.5 },
    { keyword: "枚方", lat: 34.8135, lon: 135.6492 },
    { keyword: "京都", lat: 35.0116, lon: 135.7681 },
    { keyword: "京北", lat: 35.2, lon: 135.62 },
    { keyword: "神戸", lat: 34.6901, lon: 135.1956 },
    { keyword: "姫路", lat: 34.8151, lon: 134.6853 },
    { keyword: "加古川", lat: 34.7569, lon: 134.8417 },
    { keyword: "播磨", lat: 34.78, lon: 134.65 },
    { keyword: "山崎", lat: 35.0057, lon: 134.5469 },
    { keyword: "宝塚", lat: 34.8089, lon: 135.3461 },
    { keyword: "伊丹", lat: 34.7844, lon: 135.4009 },
    { keyword: "北摂", lat: 34.89, lon: 135.5 },
    { keyword: "能勢", lat: 34.9722, lon: 135.4249 },
    { keyword: "生駒", lat: 34.6937, lon: 135.7007 },
    { keyword: "信貴", lat: 34.62, lon: 135.67 },
    { keyword: "金剛", lat: 34.46, lon: 135.59 },
    { keyword: "紀北", lat: 34.23, lon: 135.23 },
    { keyword: "紀の川", lat: 34.23, lon: 135.37 },
    { keyword: "泉南", lat: 34.3654, lon: 135.2882 },
    { keyword: "東大阪", lat: 34.6796, lon: 135.6008 },
    { keyword: "西大阪", lat: 34.67, lon: 135.45 },
    { keyword: "栗東", lat: 35.0227, lon: 135.9898 },
    { keyword: "湖東", lat: 35.15, lon: 136.1 },
    { keyword: "湖南", lat: 34.98, lon: 136.03 },
    { keyword: "甲賀", lat: 34.9669, lon: 136.1676 },
    { keyword: "東近江", lat: 35.1125, lon: 136.2078 },
    { keyword: "嶺南", lat: 35.56, lon: 135.95 },
    { keyword: "葛城", lat: 34.49, lon: 135.74 },
    { keyword: "和泉", lat: 34.5, lon: 135.43 },
    { keyword: "大河内", lat: 34.95, lon: 134.75 },
  ],
  中国: [
    { keyword: "岡山", lat: 34.6551, lon: 133.9195 },
    { keyword: "倉敷", lat: 34.5858, lon: 133.7722 },
    { keyword: "井原", lat: 34.5975, lon: 133.4631 },
    { keyword: "笠岡", lat: 34.5038, lon: 133.5075 },
    { keyword: "尾道", lat: 34.4089, lon: 133.2049 },
    { keyword: "広島", lat: 34.3853, lon: 132.4553 },
    { keyword: "黒瀬", lat: 34.4027, lon: 132.7175 },
    { keyword: "山口", lat: 34.1785, lon: 131.4737 },
    { keyword: "徳山", lat: 34.0558, lon: 131.8061 },
    { keyword: "岩国", lat: 34.167, lon: 132.2249 },
    { keyword: "松江", lat: 35.4681, lon: 133.0484 },
    { keyword: "島根", lat: 35.4681, lon: 133.0484 },
    { keyword: "鳥取", lat: 35.5011, lon: 134.2351 },
    { keyword: "智頭", lat: 35.26, lon: 134.2264 },
    { keyword: "日野", lat: 35.16, lon: 133.44 },
    { keyword: "東山口", lat: 34.12, lon: 131.67 },
    { keyword: "作木", lat: 34.799, lon: 132.947 },
  ],
  四国: [
    { keyword: "高松", lat: 34.3428, lon: 134.0466 },
    { keyword: "讃岐", lat: 34.32, lon: 134.17 },
    { keyword: "香川", lat: 34.34, lon: 134.05 },
    { keyword: "麻", lat: 34.1853, lon: 133.7618 },
    { keyword: "阿波", lat: 34.066, lon: 134.556 },
    { keyword: "鳴門", lat: 34.1739, lon: 134.6085 },
    { keyword: "国府", lat: 34.0733, lon: 134.5207 },
    { keyword: "松山", lat: 33.8392, lon: 132.7657 },
    { keyword: "東予", lat: 33.92, lon: 133.18 },
    { keyword: "西条", lat: 33.92, lon: 133.18 },
    { keyword: "川内", lat: 33.79, lon: 132.95 },
    { keyword: "井川", lat: 33.96, lon: 133.8 },
    { keyword: "新改", lat: 33.6388, lon: 133.6764 },
    { keyword: "三島", lat: 33.98, lon: 133.55 },
    { keyword: "大洲", lat: 33.50, lon: 132.54 },
    { keyword: "高知", lat: 33.5597, lon: 133.5311 },
    { keyword: "本川", lat: 33.78, lon: 133.22 },
    { keyword: "阿南", lat: 33.9214, lon: 134.6597 },
    { keyword: "広見", lat: 33.23, lon: 132.58 },
  ],
  九州: [
    { keyword: "福岡", lat: 33.5902, lon: 130.4017 },
    { keyword: "北九州", lat: 33.8834, lon: 130.8751 },
    { keyword: "門司", lat: 33.94, lon: 130.96 },
    { keyword: "筑豊", lat: 33.65, lon: 130.73 },
    { keyword: "古賀", lat: 33.7296, lon: 130.4706 },
    { keyword: "鳥栖", lat: 33.3778, lon: 130.5066 },
    { keyword: "佐賀", lat: 33.2635, lon: 130.3009 },
    { keyword: "唐津", lat: 33.4425, lon: 129.968 },
    { keyword: "武雄", lat: 33.1937, lon: 130.0212 },
    { keyword: "長崎", lat: 32.7503, lon: 129.8777 },
    { keyword: "諫早", lat: 32.8442, lon: 130.0488 },
    { keyword: "佐世保", lat: 33.1799, lon: 129.7154 },
    { keyword: "熊本", lat: 32.8031, lon: 130.7079 },
    { keyword: "八代", lat: 32.5092, lon: 130.6018 },
    { keyword: "人吉", lat: 32.219, lon: 130.7543 },
    { keyword: "大分", lat: 33.2396, lon: 131.6093 },
    { keyword: "日田", lat: 33.3213, lon: 130.9409 },
    { keyword: "豊前", lat: 33.6117, lon: 131.1304 },
    { keyword: "宮崎", lat: 31.9111, lon: 131.4239 },
    { keyword: "都城", lat: 31.7196, lon: 131.0616 },
    { keyword: "鹿児島", lat: 31.5966, lon: 130.5571 },
    { keyword: "霧島", lat: 31.7411, lon: 130.7639 },
    { keyword: "久留米", lat: 33.3193, lon: 130.508 },
    { keyword: "苅田", lat: 33.7769, lon: 130.9804 },
    { keyword: "伊都", lat: 33.58, lon: 130.17 },
    { keyword: "槻田", lat: 33.83, lon: 130.85 },
    { keyword: "脊振", lat: 33.44, lon: 130.37 },
    { keyword: "日向", lat: 32.422, lon: 131.627 },
    { keyword: "一ツ瀬", lat: 32.2, lon: 131.52 },
    { keyword: "大隅", lat: 31.45, lon: 130.98 },
    { keyword: "薩", lat: 31.8, lon: 130.3 },
  ],
  沖縄: [
    { keyword: "那覇", lat: 26.2124, lon: 127.6792 },
    { keyword: "西原", lat: 26.225, lon: 127.755 },
    { keyword: "牧港", lat: 26.257, lon: 127.721 },
    { keyword: "友寄", lat: 26.19, lon: 127.74 },
    { keyword: "石川", lat: 26.422, lon: 127.822 },
    { keyword: "金武", lat: 26.4569, lon: 127.9261 },
    { keyword: "具志川", lat: 26.36, lon: 127.87 },
    { keyword: "渡口", lat: 26.36, lon: 127.77 },
    { keyword: "栄野比", lat: 26.36, lon: 127.82 },
    { keyword: "吉の浦", lat: 26.29, lon: 127.75 },
  ],
};

export const STATION_CANVAS_OFFSETS_BY_AREA: Record<string, CanvasOffsetHint[]> = {
  中国: [{ keyword: "山陰", dx: -8, dy: -46 }],
};

export const PLANT_GEO_HINTS_BY_AREA: Record<string, PlantGeoHint[]> = {
  中国: [
    { keyword: "三隅", lat: 34.79, lon: 132.19 },
    { keyword: "竹原", lat: 34.33, lon: 132.89 },
    { keyword: "小野田", lat: 34.01, lon: 131.18 },
    { keyword: "柳井", lat: 33.96, lon: 132.13 },
    { keyword: "トクヤマ", lat: 34.03, lon: 131.82 },
    { keyword: "徳山", lat: 34.03, lon: 131.82 },
    { keyword: "宇部", lat: 33.95, lon: 131.24 },
    { keyword: "水島", lat: 34.51, lon: 133.71 },
    { keyword: "玉島", lat: 34.52, lon: 133.67 },
    { keyword: "海田", lat: 34.37, lon: 132.54 },
    { keyword: "防府", lat: 34.04, lon: 131.56 },
    { keyword: "島根", lat: 35.54, lon: 132.99 },
    { keyword: "大崎", lat: 34.23, lon: 132.93 },
    { keyword: "俣野川", lat: 35.30, lon: 133.44 },
    { keyword: "南原", lat: 35.03, lon: 133.43 },
    { keyword: "麻里布", lat: 34.16, lon: 132.22 },
  ],
  四国: [
    { keyword: "伊方", lat: 33.49, lon: 132.31 },
    { keyword: "坂出", lat: 34.33, lon: 133.86 },
    { keyword: "橘湾", lat: 33.92, lon: 134.72 },
    { keyword: "阿南", lat: 33.9214, lon: 134.6597 },
    { keyword: "西条", lat: 33.92, lon: 133.18 },
    { keyword: "新居浜", lat: 33.96, lon: 133.28 },
    { keyword: "壬生川", lat: 33.92, lon: 133.09 },
    { keyword: "本川", lat: 33.78, lon: 133.22 },
  ],
};

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
  三重東近江線: {
    sourceArea: "中部",
    sourceStation: "三重",
    targetArea: "関西",
    targetStation: "東近江変電所",
    currentType: "ac",
  },
  越前嶺南線: {
    sourceArea: "北陸",
    sourceStation: "越前変電所",
    targetArea: "関西",
    targetStation: "嶺南変電所",
    currentType: "ac",
  },
  阿南紀北直流幹線: {
    sourceArea: "四国",
    sourceStation: "阿南CS",
    targetArea: "関西",
    targetStation: "紀北変換所",
    currentType: "dc",
  },
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

// Detailed outlines of Japan's main islands as [lat, lon] sequences.
// Each array traces an island clockwise and closes back to the first point.
const JAPAN_ISLAND_COORDS: Array<{ name: string; coords: Array<[number, number]> }> = [
  {
    name: "hokkaido",
    coords: [
      // Cape Sōya / Wakkanai (north)
      [45.52, 141.94], [45.42, 141.69],
      // Northeast coast (Okhotsk Sea)
      [45.35, 142.10], [45.15, 142.30], [44.92, 142.50],
      [44.65, 142.90], [44.40, 143.30], [44.15, 143.85], [44.00, 144.25],
      // Shiretoko Peninsula
      [43.95, 144.65], [44.05, 144.95], [44.33, 145.20],
      [44.10, 145.38], [43.85, 145.30],
      // East coast (Nemuro / Nosappu)
      [43.55, 145.70], [43.38, 145.82], [43.30, 145.55],
      [43.10, 145.05], [42.98, 144.40],
      // South coast (Pacific)
      [42.80, 143.65], [42.55, 143.30], [42.30, 143.10],
      [41.93, 143.24], // Cape Erimo
      // Southwest coast
      [42.12, 142.55], [42.32, 142.08], [42.50, 141.75],
      [42.63, 141.55], [42.70, 141.20],
      // Uchiura Bay (噴火湾)
      [42.55, 140.88], [42.32, 140.97], [42.20, 140.55],
      [42.05, 140.40], [41.95, 140.55],
      // Oshima Peninsula (Hakodate)
      [41.77, 140.73], [41.53, 140.62],
      [41.43, 140.11], // Matsumae
      // West coast (Japan Sea)
      [41.65, 139.95], [41.90, 139.87], [42.18, 139.82],
      [42.55, 139.83], [42.82, 139.92],
      [43.00, 140.05], [43.15, 140.25],
      // Shakotan Peninsula
      [43.33, 140.45], [43.20, 140.78], [43.18, 140.98],
      // Northwest coast
      [43.23, 141.25], [43.40, 141.42], [43.65, 141.55],
      [43.95, 141.63], [44.25, 141.70], [44.65, 141.73],
      [44.95, 141.73], [45.25, 141.70],
      [45.42, 141.69], [45.52, 141.94],
    ],
  },
  {
    name: "honshu",
    coords: [
      // Tsugaru Peninsula / Shimokita
      [41.45, 140.21], [41.35, 140.47], [41.16, 140.78],
      [41.32, 141.02], [41.38, 141.37], // Shimokita Peninsula tip
      // Pacific coast – Tōhoku
      [41.05, 141.62], [40.75, 141.80], [40.55, 141.90],
      [40.28, 141.82], [39.95, 141.90], [39.63, 141.97],
      [39.30, 141.93], [39.02, 141.82], [38.73, 141.68],
      [38.45, 141.50], [38.30, 141.28], [38.10, 141.05],
      // Sendai → Kantō
      [37.80, 140.95], [37.55, 141.00], [37.15, 140.92],
      [36.80, 140.87], [36.50, 140.80], [36.20, 140.63], [35.93, 140.53],
      // Chōshi / Bōsō Peninsula
      [35.77, 140.83], [35.55, 140.62], [35.25, 140.25],
      [35.05, 139.95], [34.95, 139.82],
      // Tokyo Bay
      [35.12, 139.73], [35.33, 139.68], [35.45, 139.72],
      [35.42, 139.63], [35.30, 139.55],
      // Sagami Bay → Izu Peninsula
      [35.15, 139.15], [35.10, 139.05], [35.00, 138.98],
      [34.90, 139.08], [34.70, 138.95],
      [34.58, 138.80], // Cape Irozaki (Izu tip)
      [34.68, 138.60], [34.82, 138.48],
      // Suruga Bay / Enshu-nada
      [34.90, 138.28], [34.72, 138.18],
      [34.63, 137.70], [34.60, 137.35], [34.68, 137.03],
      // Ise Bay
      [34.73, 136.85], [34.65, 136.90], [34.55, 136.72],
      [34.35, 136.80], [34.20, 136.55],
      // Kii Peninsula
      [33.95, 136.05], [33.85, 135.93],
      [33.47, 135.78], // Cape Shio-no-misaki (Kii tip)
      [33.65, 135.35], [33.82, 135.12], [33.95, 135.03],
      // Osaka Bay / Kansai
      [34.28, 135.02], [34.40, 135.10], [34.65, 135.23],
      // Inland Sea coast / Chūgoku
      [34.55, 134.85], [34.38, 134.65], [34.15, 134.25],
      [34.25, 133.75], [34.22, 133.20], [34.15, 132.65],
      [34.08, 132.30], [34.05, 132.00],
      // Western Honshu tip
      [33.98, 131.82], [34.05, 131.55], [34.20, 131.22],
      [33.98, 130.95], // Shimonoseki
      // Japan Sea coast – San'in
      [34.15, 131.05], [34.38, 131.35], [34.60, 131.55],
      [34.75, 131.73], [35.08, 132.00],
      [35.35, 132.55], [35.42, 133.00], [35.52, 133.38],
      [35.63, 134.25],
      // Wakasa Bay
      [35.55, 135.35], [35.72, 135.78], [35.75, 136.00],
      // Noto Peninsula
      [36.25, 136.35], [36.45, 136.58], [36.80, 136.72],
      [37.08, 136.72], [37.30, 136.93], // Noto tip
      [37.15, 137.15], [36.85, 136.95],
      // Niigata coast
      [36.95, 137.20], [37.30, 137.80], [37.55, 138.12], [37.85, 138.55],
      // Tōhoku Japan Sea coast
      [38.10, 139.30], [38.50, 139.50], [38.82, 139.55],
      [39.12, 139.92], [39.55, 139.93], [39.88, 139.84],
      [40.22, 139.82], [40.52, 139.86],
      // Back to Tsugaru
      [40.75, 140.00], [40.95, 140.25], [41.15, 140.35],
      [41.45, 140.21],
    ],
  },
  {
    name: "shikoku",
    coords: [
      // NE (Naruto area)
      [34.25, 134.68], [34.08, 134.78],
      // East coast → Cape Muroto
      [33.85, 134.60], [33.60, 134.20],
      [33.25, 134.17], // Cape Muroto
      // South coast → Cape Ashizuri
      [33.05, 133.60], [32.98, 133.35],
      [32.73, 133.02], // Cape Ashizuri
      // West coast (Uwa Sea)
      [32.93, 132.55], [33.10, 132.42],
      [33.28, 132.42], [33.50, 132.65],
      [33.68, 132.82], [33.88, 132.95],
      // North coast (Seto Inland Sea)
      [34.00, 133.00], [34.08, 133.30],
      [34.15, 133.60], [34.22, 133.88],
      [34.32, 134.10], [34.38, 134.40],
      [34.25, 134.68],
    ],
  },
  {
    name: "kyushu",
    coords: [
      // NE (Kitakyushu)
      [33.95, 131.02], [33.88, 130.85],
      // North coast (Fukuoka)
      [33.65, 130.45], [33.55, 130.35], [33.30, 130.05],
      // West coast (Nagasaki)
      [33.10, 129.95], [32.92, 129.78],
      [32.73, 129.70], // Nagasaki area
      [32.60, 129.75], [32.55, 130.00],
      // Yatsushiro / Amakusa
      [32.35, 130.18], [32.10, 130.30], [31.80, 130.35],
      // Satsuma Peninsula
      [31.55, 130.48], [31.35, 130.55],
      [31.10, 130.58], [30.98, 130.65], // Cape Nagasakibana
      // Kagoshima Bay → Ōsumi Peninsula
      [31.15, 130.78], [31.38, 130.72], [31.55, 130.78],
      [31.35, 131.00], [31.02, 131.07], // Cape Sata
      // East coast (Miyazaki)
      [31.18, 131.35], [31.40, 131.43],
      [31.65, 131.44], [31.90, 131.42],
      [32.25, 131.60], [32.55, 131.72],
      // NE coast (Ōita)
      [32.82, 131.83], [33.05, 131.80],
      [33.20, 131.70], [33.38, 131.55],
      [33.58, 131.18], [33.78, 131.00],
      [33.95, 131.02],
    ],
  },
  {
    name: "okinawa",
    coords: [
      [26.88, 128.26], [26.78, 128.18], [26.65, 127.98],
      [26.50, 127.85], [26.38, 127.77], [26.22, 127.68],
      [26.08, 127.65], [26.15, 127.70], [26.33, 127.80],
      [26.52, 127.92], [26.70, 128.12], [26.82, 128.22],
      [26.88, 128.26],
    ],
  },
];

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

/** Returns SVG path `d` strings for Japan's main islands, in canvas coordinates. */
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
