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
    { keyword: "南相馬", lat: 37.6313, lon: 140.9539 },
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

// Outlines of Japan's main islands and notable smaller islands as [lat, lon] sequences.
// Source: Natural Earth / georgique/world-geojson (public domain).
// Each array traces an island boundary and closes back to the first point.
const JAPAN_ISLAND_COORDS: Array<{ name: string; coords: Array<[number, number]> }> = [
  {
    name: "hokkaido",
    coords: [
      [45.5371, 141.9598], [45.5371, 141.8692], [45.4601, 141.8417],
      [45.4293, 141.7181], [45.4621, 141.6138], [45.3232, 141.5561],
      [45.1995, 141.5286], [44.7701, 141.7319], [44.5259, 141.7099],
      [44.3121, 141.6], [43.9157, 141.5698], [43.7969, 141.3007],
      [43.3252, 141.3776], [43.1852, 141.199], [43.2632, 141.015],
      [43.2532, 140.7761], [43.3831, 140.5673], [43.3611, 140.3476],
      [43.2452, 140.2789], [43.0127, 140.4602], [42.8357, 140.257],
      [42.8619, 140.1938], [42.6764, 139.8257], [42.387, 139.7186],
      [42.1308, 139.812], [42.0452, 139.9658], [41.8859, 140.0262],
      [41.759, 139.9274], [41.5908, 139.8834], [41.4057, 140.0098],
      [41.3521, 140.1691], [41.4304, 140.3723], [41.7426, 140.7239],
      [41.6729, 140.9161], [41.6893, 141.0699], [41.7754, 141.2402],
      [41.9105, 141.2183], [41.9799, 141.037], [42.1797, 140.7623],
      [42.1634, 140.5975], [42.3545, 140.3558], [42.5167, 140.4877],
      [42.5207, 140.6799], [42.2692, 140.9601], [42.5693, 141.7126],
      [42.1675, 142.5256], [42.0778, 142.8882], [41.8737, 143.1299],
      [41.9064, 143.2782], [42.1553, 143.3936], [42.4397, 143.4265],
      [42.743, 143.8495], [42.9202, 144.2505], [42.888, 144.5197],
      [42.9604, 145.0854], [43.105, 145.2612], [43.093, 145.4645],
      [43.1531, 145.6293], [43.2492, 145.6677], [43.3611, 145.838],
      [43.429, 145.816], [43.441, 145.6787], [43.3731, 145.448],
      [43.4808, 145.3326], [43.5883, 145.448], [43.7354, 145.1678],
      [43.9177, 145.2008], [44.2373, 145.4645], [44.4142, 145.3821],
      [44.3828, 145.2228], [44.0047, 144.7119], [44.0402, 144.4043],
      [44.1704, 144.2889], [44.2216, 144.0088], [44.4495, 143.3881],
      [44.9026, 142.7289], [45.5371, 141.9598],
    ],
  },
  {
    name: "honshu",
    coords: [
      [41.562, 140.9203], [41.3366, 140.7802], [41.1487, 140.75],
      [41.1125, 140.8186], [41.1683, 141.0699], [41.2572, 141.1894],
      [41.1569, 141.2595], [40.927, 141.1743], [40.8938, 141.1015],
      [41.0291, 140.8749], [40.8793, 140.8262], [40.8455, 140.7397],
      [41.2066, 140.6415], [41.2479, 140.5646], [41.2035, 140.4808],
      [41.2799, 140.3284], [41.159, 140.3036], [41.1435, 140.2295],
      [41.0731, 140.3119], [40.8138, 140.2144], [40.7649, 140.1155],
      [40.7899, 140.0304], [40.6285, 139.8299], [40.5576, 139.915],
      [40.4093, 139.9287], [40.3371, 140.007], [40.056, 139.8985],
      [39.9792, 139.8038], [40.036, 139.6967], [39.9971, 139.6829],
      [39.8465, 139.7433], [39.8781, 139.8972], [39.7695, 140.0139],
      [39.667, 140.0455], [39.3279, 139.959], [39.296, 139.904],
      [38.8301, 139.7433], [38.7037, 139.5978], [38.4073, 139.4357],
      [38.2037, 139.4151], [38.0935, 139.3423], [37.8185, 138.8123],
      [37.3974, 138.5555], [37.1986, 138.2176], [36.9543, 137.428],
      [36.8082, 137.3511], [36.7796, 137.2289], [36.8609, 137.0119],
      [36.9389, 137.0764], [37.2424, 137.1039], [37.3112, 137.2852],
      [37.4203, 137.2824], [37.4465, 137.3895], [37.5348, 137.3538],
      [37.5184, 137.1533], [37.3822, 136.7345], [37.1461, 136.6521],
      [36.9696, 136.7427], [36.784, 136.6988], [36.4356, 136.3966],
      [36.2631, 136.0931], [36.2221, 136.1055], [36.0169, 135.9462],
      [35.8824, 135.9764], [35.7989, 136.0712], [35.7041, 136.0588],
      [35.7822, 136.0355], [35.7398, 135.9503], [35.6517, 135.9462],
      [35.6539, 135.7924], [35.5937, 135.8157], [35.5702, 135.7814],
      [35.5121, 135.5397], [35.6205, 135.4861], [35.54, 135.2884],
      [35.6283, 135.2733], [35.6908, 135.3255], [35.7933, 135.2362],
      [35.6707, 134.9396], [35.683, 134.5262], [35.5691, 134.2598],
      [35.5099, 133.7737], [35.5445, 133.5786], [35.4685, 133.3987],
      [35.5009, 133.2889], [35.5367, 133.2765], [35.5702, 133.3548],
      [35.5937, 133.3205], [35.6171, 133.0719], [35.5367, 132.9401],
      [35.4562, 132.6242], [35.37, 132.664], [35.3039, 132.6283],
      [35.2434, 132.469], [34.7168, 131.8428], [34.6801, 131.5805],
      [34.4635, 131.4178], [34.4851, 131.3676], [34.4358, 131.3786],
      [34.4398, 131.3175], [34.3967, 131.2976], [34.4409, 131.1568],
      [34.3825, 131.1665], [34.4267, 131.1397], [34.4505, 130.9639],
      [34.3944, 130.922], [34.3786, 130.9907], [34.3859, 130.8595],
      [34.3576, 130.8273], [34.2033, 130.9254], [34.1183, 130.8582],
      [34.0174, 130.9093], [33.9479, 130.8709], [33.9086, 130.9145],
      [34.0322, 131.0463], [33.9234, 131.1761], [33.9172, 131.2722],
      [34.0185, 131.4912], [33.9832, 131.5778], [34.035, 131.678],
      [33.9735, 131.7336], [34.0219, 131.7632], [33.973, 131.7529],
      [33.9223, 131.8147], [33.9553, 131.9032], [33.8869, 132.0371],
      [33.8305, 132.0591], [33.7791, 132.0172], [33.7677, 132.057],
      [33.8436, 132.169], [33.932, 132.1353], [34.014, 132.2301],
      [34.2447, 132.2445], [34.2731, 132.3846], [34.323, 132.3434],
      [34.3412, 132.3756], [34.3423, 132.4196], [34.268, 132.4278],
      [34.2674, 132.3537], [34.1925, 132.4059], [34.1448, 132.3798],
      [34.0748, 132.5253], [34.0623, 132.456], [34.0327, 132.4731],
      [34.1152, 132.6043], [34.1283, 132.5562], [34.2073, 132.6043],
      [34.1442, 132.6709], [34.2021, 133.0218], [34.1544, 132.9792],
      [34.1027, 133.041], [34.2776, 133.2491], [34.3463, 133.1941],
      [34.3429, 133.3301], [34.4409, 133.4599], [34.365, 133.5285],
      [34.3565, 133.4152], [34.3043, 133.4605], [34.2913, 133.5347],
      [34.3434, 133.5498], [34.2975, 133.683], [34.4369, 133.5368],
      [34.4856, 133.6528], [34.4301, 133.7455], [34.4177, 133.6487],
      [34.3757, 133.6377], [34.3457, 133.6981], [34.4579, 134.0332],
      [34.4194, 134.3518], [34.5767, 134.3779], [34.4998, 134.1225],
      [34.5326, 134.0359], [34.7405, 134.4823], [34.7405, 134.7253],
      [34.6196, 135.0577], [34.6411, 135.3584], [34.5575, 135.3763],
      [34.4307, 135.2898], [34.45, 135.2225], [34.4296, 135.1854],
      [34.399, 135.2376], [34.3672, 135.2032], [34.2765, 134.989],
      [34.2765, 135.0467], [34.1686, 135.1552], [34.1186, 135.0632],
      [34.0572, 135.0728], [34.0458, 135.1222], [33.9992, 135.0426],
      [33.9012, 135.0357], [33.7083, 135.3296], [33.6535, 135.3145],
      [33.5689, 135.3818], [33.4154, 135.7896], [33.5826, 135.9792],
      [33.8624, 136.1165], [33.965, 136.2868], [34.1391, 136.3142],
      [34.2708, 136.6644], [34.2334, 136.8127], [34.272, 136.9212],
      [34.5529, 136.9171], [34.5235, 136.7894], [34.6253, 136.5669],
      [34.7032, 136.5395], [35.0041, 136.7166], [34.9647, 136.7894],
      [34.7484, 136.8292], [34.6445, 137.0009], [34.7269, 137.0709],
      [34.7461, 136.9775], [34.7732, 136.9405], [34.8014, 136.9666],
      [34.7529, 137.0943], [34.7856, 137.2893], [34.7021, 137.1931],
      [34.6716, 137.0641], [34.5767, 137.0084], [34.6648, 137.5186],
      [34.6569, 137.9697], [34.5886, 138.2368], [34.653, 138.2073],
      [34.8814, 138.3481], [34.9783, 138.5307], [35.1008, 138.5836],
      [35.1272, 138.7216], [35.0418, 138.8768], [35.0131, 138.7669],
      [34.6835, 138.7278], [34.592, 138.85], [34.6575, 139.0018],
      [34.7337, 139.0052], [34.9079, 139.1583], [35.0587, 139.0869],
      [35.1368, 139.1288], [35.1379, 139.1755], [35.2237, 139.1528],
      [35.3073, 139.4556], [35.2423, 139.5806], [35.1351, 139.5882],
      [35.1295, 139.6829], [35.18, 139.6699], [35.254, 139.755],
      [35.3196, 139.6747], [35.389, 139.6754], [35.5188, 139.8189],
      [35.5691, 139.801], [35.6562, 139.9528], [35.5596, 140.0695],
      [35.4377, 139.8937], [35.3874, 139.8958], [35.3134, 139.7324],
      [35.2299, 139.856], [35.1761, 139.8017], [35.0306, 139.7914],
      [35.0036, 139.8422], [34.9653, 139.744], [34.8983, 139.8203],
      [34.8978, 139.9356], [35.0075, 139.994], [35.1031, 140.1382],
      [35.1266, 140.3263], [35.1957, 140.4053], [35.426, 140.4094],
      [35.5657, 140.5], [35.6668, 140.6291], [35.6835, 140.8784],
      [35.7292, 140.8907], [35.9941, 140.6731], [36.2847, 140.5742],
      [36.8802, 140.8131], [36.9987, 140.9965], [37.4814, 141.0555],
      [37.6594, 141.0473], [37.9886, 140.9244], [38.1524, 140.9649],
      [38.3212, 141.0885], [38.305, 141.1908], [38.36, 141.1771],
      [38.3912, 141.2382], [38.3804, 141.3988], [38.2969, 141.4696],
      [38.2862, 141.3961], [38.2355, 141.4812], [38.2905, 141.5403],
      [38.2651, 141.5945], [38.3734, 141.5327], [38.3885, 141.6138],
      [38.4294, 141.5993], [38.4278, 141.5012], [38.4342, 141.541],
      [38.481, 141.5149], [38.5272, 141.5588], [38.5718, 141.4902],
      [38.6437, 141.5492], [38.6619, 141.4709], [38.6828, 141.5685],
      [38.7782, 141.5348], [38.8525, 141.6927], [38.9973, 141.6433],
      [38.9252, 141.7243], [39.0074, 141.7484], [39.0581, 141.8891],
      [39.0997, 141.8301], [39.0986, 141.9372], [39.145, 141.8644],
      [39.237, 141.9818], [39.2945, 141.9344], [39.3003, 142.0031],
      [39.3922, 141.9798], [39.4155, 142.0505], [39.476, 142.0711],
      [39.4897, 142.0326], [39.5427, 142.0869], [39.6512, 142.0415],
      [39.6512, 142.0017], [39.9792, 141.9681], [40.0707, 141.8541],
      [40.1453, 141.8816], [40.1972, 141.8177], [40.2575, 141.8328],
      [40.4428, 141.7037], [40.5602, 141.5115], [40.7218, 141.4311],
      [41.1683, 141.3988], [41.4386, 141.4682], [41.3655, 141.2739],
      [41.562, 140.9203],
    ],
  },
  {
    name: "shikoku",
    coords: [
      [34.4256, 134.1273], [34.3627, 134.0332], [34.4007, 133.9185],
      [34.3497, 133.8657], [34.378, 133.8464], [34.3553, 133.8066],
      [34.323, 133.81], [34.247, 133.6837], [34.2487, 133.6322],
      [34.2759, 133.6885], [34.293, 133.6349], [34.2652, 133.5491],
      [34.1755, 133.6349], [34.0834, 133.6233], [33.9821, 133.5059],
      [34.0128, 133.3479], [33.9399, 133.1447], [33.9741, 133.0808],
      [34.1306, 132.9868], [34.1459, 132.9311], [34.1215, 132.8865],
      [34.0743, 132.903], [33.9997, 132.7512], [33.9251, 132.7464],
      [33.9001, 132.627], [33.8659, 132.6888], [33.7763, 132.6846],
      [33.6946, 132.6276], [33.6095, 132.4484], [33.5483, 132.4045],
      [33.4154, 132.0824], [33.3322, 131.9987], [33.3535, 132.1264],
      [33.4538, 132.3276], [33.4297, 132.375], [33.3896, 132.3571],
      [33.4016, 132.3303], [33.3529, 132.3667], [33.315, 132.3557],
      [33.307, 132.4876], [33.272, 132.458], [33.2295, 132.4862],
      [33.2128, 132.4477], [33.2421, 132.3585], [33.2123, 132.3248],
      [33.1623, 132.377], [33.1692, 132.4189], [33.0944, 132.4065],
      [33.1099, 132.4505], [33.0783, 132.4525], [33.0749, 132.3901],
      [33.0081, 132.3791], [33.038, 132.4216], [33.0018, 132.4828],
      [32.9528, 132.4752], [32.9309, 132.3921], [32.9263, 132.4628],
      [32.8905, 132.4821], [32.9171, 132.5761], [32.9032, 132.6853],
      [32.7665, 132.6112], [32.7451, 132.5789], [32.7711, 132.5397],
      [32.6966, 132.5349], [32.7763, 132.7025], [32.7342, 132.8],
      [32.7694, 132.9153], [32.7041, 133.0128], [32.7676, 133.0286],
      [32.8519, 132.971], [32.8825, 133.0211], [33.0127, 133.0266],
      [33.0173, 133.109], [33.1485, 133.1879], [33.1427, 133.2319],
      [33.3661, 133.2827], [33.3403, 133.3315], [33.3856, 133.3514],
      [33.4079, 133.4585], [33.4423, 133.4722], [33.5105, 133.6075],
      [33.5311, 133.7242], [33.4784, 133.9295], [33.2289, 134.1801],
      [33.4567, 134.2543], [33.5689, 134.3388], [33.5729, 134.3758],
      [33.6341, 134.393], [33.6306, 134.5049], [33.6466, 134.4246],
      [33.8328, 134.7576], [33.8664, 134.6924], [33.9126, 134.7301],
      [33.9473, 134.7144], [34.0322, 134.6038], [34.2476, 134.6519],
      [34.264, 134.6148], [34.2232, 134.4267], [34.3043, 134.2612],
      [34.3287, 134.2825], [34.361, 134.2454], [34.3752, 134.2001],
      [34.3474, 134.1623], [34.4046, 134.1788], [34.4256, 134.1273],
    ],
  },
  {
    name: "kyushu",
    coords: [
      [33.9753, 131.0037], [33.9021, 130.9145], [33.9627, 130.7744],
      [33.9639, 130.6961], [33.8989, 130.6027], [33.9297, 130.4022],
      [33.8784, 130.3954], [33.8727, 130.4503], [33.7575, 130.4352],
      [33.6844, 130.3308], [33.7118, 130.2992], [33.6341, 130.269],
      [33.7026, 130.2484], [33.7095, 130.2113], [33.6215, 130.1289],
      [33.5826, 130.0287], [33.5265, 130.1015], [33.5242, 130.0465],
      [33.4841, 130.0136], [33.5448, 129.9957], [33.6226, 129.846],
      [33.5952, 129.8131], [33.538, 129.8131], [33.3959, 129.64],
      [33.4142, 129.5618], [33.4922, 129.6016], [33.5219, 129.5563],
      [33.475, 129.4876], [33.3776, 129.4931], [33.3948, 129.445],
      [33.4475, 129.4492], [33.4326, 129.4066], [33.3581, 129.386],
      [33.3179, 129.4162], [33.2364, 129.3571], [33.2685, 129.3448],
      [33.2525, 129.3201], [33.187, 129.3105], [33.1582, 129.3915],
      [33.1743, 129.4533], [33.3018, 129.5535], [33.2077, 129.5412],
      [33.141, 129.489], [33.1261, 129.5549], [33.1628, 129.6057],
      [33.0869, 129.6455], [33.0743, 129.5645], [33.0121, 129.5261],
      [33.0098, 129.6291], [32.943, 129.5769], [32.9119, 129.5879],
      [32.8796, 129.5343], [32.8496, 129.548], [32.8565, 129.6538],
      [32.7538, 129.7746], [32.7249, 129.7856], [32.7272, 129.7513],
      [32.5804, 129.7073], [32.5283, 129.7952], [32.7006, 129.949],
      [32.778, 130.1344], [32.7573, 130.1729], [32.7145, 130.1688],
      [32.6891, 130.1125], [32.6486, 130.0987], [32.5781, 130.1688],
      [32.6822, 130.3789], [32.7411, 130.4008], [32.8231, 130.383],
      [32.8888, 130.3171], [32.8819, 130.1646], [32.9465, 130.2388],
      [33.0996, 130.1537], [33.1605, 130.2512], [33.1203, 130.3473],
      [33.0536, 130.3995], [33.0087, 130.383], [32.9211, 130.4187],
      [32.7942, 130.5725], [32.7399, 130.5931], [32.6035, 130.3871],
      [32.5491, 130.3706], [32.4912, 130.2278], [32.5584, 130.1866],
      [32.5665, 130.1015], [32.5306, 129.9944], [32.4935, 130.0163],
      [32.2825, 129.9435], [32.15, 129.9545], [32.1372, 130.052],
      [32.1698, 130.0795], [32.0837, 130.107], [32.0605, 130.1523],
      [31.9953, 130.1454], [31.9195, 130.1962], [31.7994, 130.1413],
      [31.7293, 130.1674], [31.6966, 130.2484], [31.5844, 130.3143],
      [31.4357, 130.2429], [31.4626, 130.1715], [31.4357, 130.0905],
      [31.4041, 130.0836], [31.2328, 130.1935], [31.2269, 130.4366],
      [31.2069, 130.4723], [31.1599, 130.4736], [31.1458, 130.5409],
      [31.1611, 130.6549], [31.2668, 130.7002], [31.3349, 130.5849],
      [31.4334, 130.5505], [31.5341, 130.578], [31.5282, 130.6686],
      [31.4533, 130.6824], [31.3759, 130.7565], [31.1717, 130.7414],
      [31.0741, 130.6316], [30.9741, 130.6384], [31.1012, 130.9364],
      [31.2316, 131.1108], [31.2868, 131.152], [31.3396, 131.1287],
      [31.3689, 131.0559], [31.4322, 131.0765], [31.4357, 131.1836],
      [31.3724, 131.2303], [31.3431, 131.358], [31.5832, 131.4418],
      [31.6183, 131.4885], [31.7994, 131.5063], [31.8414, 131.4775],
      [32.1477, 131.5668], [32.4391, 131.7014], [32.4785, 131.7494],
      [32.5503, 131.7082], [32.6637, 131.8607], [32.7399, 131.8977],
      [32.8207, 132.0309], [32.8554, 132.0117], [32.9326, 132.0982],
      [32.9799, 132.0955], [32.9764, 131.976], [33.0075, 131.9609],
      [33.0351, 131.9527], [33.0455, 132.0323], [33.1111, 132.0351],
      [33.1272, 132.0117], [33.0984, 131.9705], [33.1571, 131.851],
      [33.2582, 131.9211], [33.2708, 131.976], [33.2869, 131.9582],
      [33.2766, 131.5366], [33.342, 131.5146], [33.3317, 131.5778],
      [33.3695, 131.6766], [33.4658, 131.7604], [33.6363, 131.722],
      [33.6924, 131.6588], [33.7049, 131.5791], [33.6958, 131.4871],
      [33.6009, 131.3855], [33.6581, 131.1163], [33.7917, 131.0326],
      [33.8259, 131.0532], [33.8761, 131.012], [33.9639, 131.0339],
      [33.9753, 131.0037],
    ],
  },
  {
    name: "okinawa",
    coords: [
      [26.8951, 128.2571], [26.7235, 128.0704], [26.7481, 128.0319],
      [26.7407, 127.9303], [26.7726, 127.8232], [26.7701, 127.7435],
      [26.7137, 127.7133], [26.6033, 127.8314], [26.564, 127.9193],
      [26.4853, 127.7271], [26.4411, 127.6804], [26.3107, 127.7216],
      [26.2417, 127.6117], [26.079, 127.6172], [26.0568, 127.7188],
      [26.1653, 127.9358], [26.1949, 127.9138], [26.2269, 127.8314],
      [26.2688, 127.8726], [26.2269, 127.9166], [26.2442, 127.9825],
      [26.3205, 128.0182], [26.4017, 128.0264], [26.4435, 127.9907],
      [26.5173, 128.1528], [26.5762, 128.1885], [26.6352, 128.2846],
      [26.7284, 128.3423], [26.8192, 128.356], [26.8951, 128.2571],
    ],
  },
  // Notable smaller islands (送電とは無関係だが地理的に目立つ離島)
  {
    name: "sado",
    coords: [
      [38.334, 138.236], [38.281, 138.187], [38.198, 138.257],
      [38.082, 138.231], [37.964, 138.278], [37.808, 138.295],
      [37.810, 138.370], [37.858, 138.411], [37.935, 138.390],
      [37.963, 138.445], [38.016, 138.509], [38.091, 138.504],
      [38.152, 138.451], [38.199, 138.474], [38.254, 138.513],
      [38.310, 138.467], [38.328, 138.385], [38.334, 138.236],
    ],
  },
  {
    name: "awaji",
    coords: [
      [34.608, 134.959], [34.573, 134.881], [34.491, 134.829],
      [34.404, 134.824], [34.341, 134.777], [34.274, 134.790],
      [34.233, 134.774], [34.215, 134.824], [34.254, 134.889],
      [34.314, 134.912], [34.347, 134.944], [34.408, 134.935],
      [34.449, 134.976], [34.504, 134.994], [34.557, 135.006],
      [34.608, 134.959],
    ],
  },
  {
    name: "shodoshima",
    coords: [
      [34.514, 134.167], [34.474, 134.139], [34.449, 134.186],
      [34.434, 134.276], [34.449, 134.350], [34.474, 134.366],
      [34.502, 134.342], [34.520, 134.265], [34.514, 134.167],
    ],
  },
  {
    name: "tsushima",
    coords: [
      [34.711, 129.463], [34.681, 129.411], [34.621, 129.379],
      [34.531, 129.367], [34.472, 129.315], [34.401, 129.277],
      [34.322, 129.239], [34.267, 129.251], [34.196, 129.194],
      [34.173, 129.216], [34.205, 129.271], [34.280, 129.310],
      [34.319, 129.357], [34.325, 129.410], [34.387, 129.463],
      [34.423, 129.496], [34.508, 129.500], [34.561, 129.475],
      [34.625, 129.509], [34.678, 129.522], [34.711, 129.463],
    ],
  },
  {
    name: "iki",
    coords: [
      [33.828, 129.684], [33.793, 129.652], [33.749, 129.661],
      [33.727, 129.703], [33.742, 129.746], [33.783, 129.766],
      [33.820, 129.745], [33.828, 129.684],
    ],
  },
  {
    name: "fukue",
    coords: [
      [32.892, 128.622], [32.837, 128.589], [32.778, 128.607],
      [32.711, 128.609], [32.665, 128.634], [32.636, 128.682],
      [32.655, 128.733], [32.695, 128.775], [32.736, 128.803],
      [32.778, 128.827], [32.823, 128.799], [32.860, 128.763],
      [32.892, 128.710], [32.892, 128.622],
    ],
  },
  {
    name: "amakusa_shimoshima",
    coords: [
      [32.522, 130.006], [32.476, 129.961], [32.405, 129.958],
      [32.345, 130.005], [32.302, 130.050], [32.267, 130.094],
      [32.286, 130.157], [32.340, 130.193], [32.397, 130.188],
      [32.445, 130.148], [32.484, 130.095], [32.522, 130.006],
    ],
  },
  {
    name: "yakushima",
    coords: [
      [30.430, 130.426], [30.389, 130.380], [30.333, 130.370],
      [30.286, 130.405], [30.262, 130.463], [30.289, 130.535],
      [30.341, 130.575], [30.390, 130.565], [30.423, 130.518],
      [30.430, 130.426],
    ],
  },
  {
    name: "tanegashima",
    coords: [
      [30.746, 131.013], [30.690, 130.962], [30.617, 130.947],
      [30.530, 130.949], [30.440, 130.929], [30.377, 130.914],
      [30.362, 130.946], [30.400, 130.978], [30.476, 130.989],
      [30.563, 131.005], [30.649, 131.032], [30.710, 131.047],
      [30.746, 131.013],
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
