/**
 * 電源種別ごとの色マップ — 直感的かつ区別しやすい配色
 *
 * 火力（ガス）  : 青        — LNG/ガスタービンの「青い炎」
 * 火力（石炭）  : 茶/褐色   — 石炭のイメージ
 * 火力（石油）  : 赤橙      — 石油の炎
 * 原子力        : 紫        — 放射線マーク等でよく使われる色
 * 水力          : 水色      — 水のイメージ
 * 太陽光        : 黄色/琥珀 — 太陽
 * 風力          : ティール   — 風/空
 * バイオマス    : 緑        — 植物由来
 * その他        : グレー
 * 不明（空文字）: スレートグレー
 */
export const SOURCE_COLOR_MAP: Record<string, string> = {
  "火力（ガス）": "#2563eb",   // blue-600
  "火力（石炭）": "#92400e",   // amber-800 (brown)
  "火力（石油）": "#dc2626",   // red-600
  "原子力":       "#7c3aed",   // violet-600
  "水力":         "#0891b2",   // cyan-600
  "太陽光":       "#d97706",   // amber-600
  "風力":         "#0d9488",   // teal-600
  "バイオマス":   "#16a34a",   // green-600
  "その他":       "#6b7280",   // gray-500
  "":             "#475569",   // slate-600
};

/** Fallback palette for unknown source types */
export const SOURCE_COLORS = [
  "#2563eb",
  "#92400e",
  "#7c3aed",
  "#0891b2",
  "#d97706",
  "#dc2626",
  "#0d9488",
  "#16a34a",
  "#6b7280",
  "#475569",
];

// 電力会社コーポレートカラー / エリア近傍JR各社カラーを参考に設定
// 10エリアすべて異なる色相ファミリーで視認性を確保
export const FLOW_AREA_COLORS: Record<string, string> = {
  北海道: "#8fc31f", // 黄緑 — JR北海道の萌黄色
  東北: "#1b813e",   // 緑 — 東北電力コーポレートカラー
  東京: "#ec222e",   // 赤 — 東京電力コーポレートカラー
  中部: "#f77f00",   // オレンジ — 中部電力 / JR東海カラー
  北陸: "#2a56c6",   // 青 — 北陸電力ブルー
  関西: "#d4a017",   // 琥珀 — 関西電力暖色系（中部オレンジと差別化した黄系）
  中国: "#e85298",   // マゼンタ — 中国電力の赤系を色相シフト
  四国: "#7b54a3",   // 紫 — 四国電力（水色は北陸・沖縄と近いため独自色）
  九州: "#a0522d",   // テラコッタ — JR九州の赤系を褐色方向へ
  沖縄: "#00afb9",   // ティール — 沖縄電力
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

export const MAX_ANIMATED_FLOW_LINES_PER_AREA = 16;

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
  | "jepx"
  | "areaCards"
  | "generatorStatus"
  | "generation"
  | "composition"
  | "reserve"
  | "totals"
  | "congestion"
  | "network"
  | "diagnostics"
  | "rankings";

export const DASHBOARD_SECTION_OPTIONS: Array<{ id: DashboardSectionId; label: string }> = [
  { id: "summary", label: "全国サマリー" },
  { id: "jepx", label: "JEPXスポット" },
  // ── 発電グループ ──
  { id: "generation", label: "発電トレンド" },
  { id: "composition", label: "発電構成" },
  { id: "totals", label: "発電・連系概要" },
  { id: "generatorStatus", label: "発電機別状況" },
  { id: "rankings", label: "ランキング" },
  // ── 需給・潮流グループ ──
  { id: "reserve", label: "需要・予備率" },
  { id: "congestion", label: "連系線混雑度" },
  { id: "diagnostics", label: "潮流詳細" },
  { id: "areaCards", label: "エリア需給" },
  { id: "network", label: "ネットワーク" },
];

/**
 * 地域間連系線の運用容量（MW）
 *
 * 出典: OCCTO「2025〜2034年度の連系線の運用容量（年間・長期）」(2025年3月公表)
 * https://www.occto.or.jp/news/renkeisenriyou_oshirase_2024_250301_renkeisen_unyouyouryou.html
 *
 * 運用容量は年度・季節・作業停止計画により変動するため、ここでは
 * 2025年度の代表的な値（年間ベース）を設定しています。
 * 実際の日別運用容量は系統情報サービスで確認できます。
 */
export const INTERTIE_RATED_CAPACITY_MW: Record<string, { capacityMw: number; label: string }> = {
  "北海道・本州間電力連系設備": { capacityMw: 900,   label: "北海道↔東北" },
  "相馬双葉幹線":             { capacityMw: 5730,  label: "東北↔東京" },
  "周波数変換設備":           { capacityMw: 2100,  label: "東京↔中部 (FC)" },
  "三重東近江線":             { capacityMw: 2780,  label: "中部↔関西" },
  "北陸フェンス":             { capacityMw: 1200,  label: "中部↔北陸" },
  "越前嶺南線":               { capacityMw: 1930,  label: "北陸↔関西" },
  "南福光連系所・南福光変電所の連系設備": { capacityMw: 300, label: "北陸↔関西 (DC)" },
  "西播東岡山線・山崎智頭線":  { capacityMw: 4710,  label: "関西↔中国" },
  "本四連系線":               { capacityMw: 1200,  label: "中国↔四国" },
  "関門連系線":               { capacityMw: 2780,  label: "中国↔九州" },
  "阿南紀北直流幹線":         { capacityMw: 1400,  label: "四国↔関西 (DC)" },
  "関西フェンス":             { capacityMw: 2600,  label: "関西エリア内" },
  "中部フェンス":             { capacityMw: 1800,  label: "中部エリア内" },
};

export const JAPAN_GEO_BOUNDS = {
  latMin: 24.0,
  latMax: 45.8,
  lonMin: 122.8,
  lonMax: 146.2,
};
