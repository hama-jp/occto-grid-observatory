export const SOURCE_COLORS = [
  "#0b525b",
  "#197278",
  "#2d6a4f",
  "#f77f00",
  "#f4a261",
  "#d62828",
  "#1d3557",
  "#6c757d",
  "#2a9d8f",
];

// 電力会社コーポレートカラー / エリア近傍JR各社カラーを参考に設定
// 重複する場合はJRカラーで代替し、10色の視認性を確保
export const FLOW_AREA_COLORS: Record<string, string> = {
  北海道: "#2cb44a", // JR北海道グリーン（北電の赤は東電と重複するため）
  東北: "#006838",   // 東北電力コーポレートカラー（緑）
  東京: "#ec222e",   // 東京電力コーポレートカラー（赤）
  中部: "#f77f00",   // 中部電力オレンジ ≒ JR東海カラー
  北陸: "#3a86ff",   // 北陸電力ブルー
  関西: "#0072bc",   // JR西日本ブルー（関電のイメージカラーが不明確なため）
  中国: "#9b2335",   // 中国電力エネルギア（ワインレッド・東電赤と差別化）
  四国: "#00a0de",   // 四国電力 / JR四国ライトブルー
  九州: "#14317e",   // 九州電力コーポレートカラー（ネイビー）
  沖縄: "#00afb9",   // 沖縄電力ティール
  default: "#577590",
};

export const AREA_ANCHOR_FALLBACKS: Record<string, { x: number; y: number }> = {
  北海道: { x: 760, y: 82 },
  東北: { x: 695, y: 155 },
  東京: { x: 724, y: 236 },
  中部: { x: 620, y: 292 },
  北陸: { x: 598, y: 220 },
  関西: { x: 540, y: 342 },
  中国: { x: 436, y: 366 },
  四国: { x: 482, y: 426 },
  九州: { x: 360, y: 462 },
  沖縄: { x: 230, y: 520 },
  default: { x: 610, y: 300 },
};

export const AREA_LAYOUT_BOUND_FALLBACKS: Record<string, { xMin: number; xMax: number; yMin: number; yMax: number }> = {
  北海道: { xMin: 640, xMax: 845, yMin: 38, yMax: 156 },
  東北: { xMin: 610, xMax: 770, yMin: 116, yMax: 226 },
  東京: { xMin: 650, xMax: 820, yMin: 194, yMax: 292 },
  中部: { xMin: 520, xMax: 700, yMin: 244, yMax: 350 },
  北陸: { xMin: 528, xMax: 655, yMin: 174, yMax: 264 },
  関西: { xMin: 472, xMax: 595, yMin: 302, yMax: 392 },
  中国: { xMin: 338, xMax: 504, yMin: 320, yMax: 406 },
  四国: { xMin: 418, xMax: 540, yMin: 392, yMax: 476 },
  九州: { xMin: 246, xMax: 430, yMin: 404, yMax: 528 },
  沖縄: { xMin: 146, xMax: 306, yMin: 468, yMax: 540 },
  default: { xMin: 30, xMax: 890, yMin: 30, yMax: 530 },
};

export const AREA_DISPLAY_ORDER = ["北海道", "東北", "東京", "中部", "北陸", "関西", "中国", "四国", "九州", "沖縄"];

export const MAP_VIEWBOX = {
  width: 920,
  height: 560,
  padding: 30,
};

export const MAX_ANIMATED_FLOW_LINES_PER_AREA = 8;

export const FLOW_AREA_NAME_SET = new Set<string>([
  "北海道",
  "東北",
  "東京",
  "中部",
  "北陸",
  "関西",
  "中国",
  "四国",
  "九州",
  "沖縄",
]);

export type DashboardSectionId =
  | "summary"
  | "areaCards"
  | "generation"
  | "composition"
  | "reserve"
  | "totals"
  | "network"
  | "diagnostics"
  | "rankings";

export const DASHBOARD_SECTION_OPTIONS: Array<{ id: DashboardSectionId; label: string }> = [
  { id: "summary", label: "全国サマリー" },
  { id: "areaCards", label: "エリア需給" },
  { id: "generation", label: "発電トレンド" },
  { id: "composition", label: "発電構成" },
  { id: "reserve", label: "需要・予備率" },
  { id: "totals", label: "発電・連系概要" },
  { id: "network", label: "ネットワーク" },
  { id: "diagnostics", label: "潮流詳細" },
  { id: "rankings", label: "ランキング" },
];

export const JAPAN_GEO_BOUNDS = {
  latMin: 24.0,
  latMax: 45.8,
  lonMin: 122.8,
  lonMax: 146.2,
};
