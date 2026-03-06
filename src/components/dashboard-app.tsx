"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { DashboardData } from "@/lib/dashboard-types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const numberFmt = new Intl.NumberFormat("ja-JP");
const decimalFmt = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });
const manKwFmt = new Intl.NumberFormat("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type DashboardAppProps = {
  initialData: DashboardData;
  availableDates: string[];
};

const SOURCE_COLORS = [
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

const FLOW_AREA_COLORS: Record<string, string> = {
  北海道: "#355070",
  東北: "#4f6d7a",
  東京: "#f77f00",
  中部: "#2a9d8f",
  北陸: "#3a86ff",
  関西: "#f4a261",
  中国: "#bc4749",
  四国: "#6a4c93",
  九州: "#e76f51",
  沖縄: "#00afb9",
  default: "#577590",
};

const AREA_ANCHORS: Record<string, { x: number; y: number }> = {
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

const MAP_CORRIDOR_ORDER = ["沖縄", "九州", "中国", "関西", "中部", "東京", "東北", "北海道"];
const MAP_VIEWBOX = {
  width: 920,
  height: 560,
  padding: 30,
};

const FLOW_AREA_NAME_SET = new Set<string>([
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

type GeoHint = {
  keyword: string;
  lat: number;
  lon: number;
};

type CanvasOffsetHint = {
  keyword: string;
  dx: number;
  dy: number;
};

const JAPAN_GEO_BOUNDS = {
  latMin: 24.0,
  latMax: 45.8,
  lonMin: 122.8,
  lonMax: 146.2,
};

const STATION_GEO_HINTS_BY_AREA: Record<string, GeoHint[]> = {
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
    { keyword: "麻", lat: 34.17, lon: 134.12 },
    { keyword: "阿波", lat: 34.066, lon: 134.556 },
    { keyword: "鳴門", lat: 34.1739, lon: 134.6085 },
    { keyword: "国府", lat: 34.0733, lon: 134.5207 },
    { keyword: "松山", lat: 33.8392, lon: 132.7657 },
    { keyword: "東予", lat: 33.92, lon: 133.18 },
    { keyword: "西条", lat: 33.92, lon: 133.18 },
    { keyword: "川内", lat: 33.79, lon: 132.95 },
    { keyword: "井川", lat: 33.96, lon: 133.8 },
    { keyword: "新改", lat: 33.61, lon: 133.75 },
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

const STATION_CANVAS_OFFSETS_BY_AREA: Record<string, CanvasOffsetHint[]> = {
  中国: [{ keyword: "山陰", dx: -8, dy: -46 }],
  四国: [
    { keyword: "麻", dx: 26, dy: -16 },
    { keyword: "新改", dx: 30, dy: 30 },
  ],
};

const INTERTIE_STATION_HINTS: Record<string, Record<string, string[]>> = {
  "北海道・本州間電力連系設備": {
    北海道: ["函館", "北斗"],
    東北: ["上北", "青森"],
  },
  相馬双葉幹線: {
    東北: ["南相馬", "いわき"],
    東京: ["南いわき", "新福島"],
  },
  周波数変換設備: {
    東京: ["新信濃", "新宿"],
    中部: ["信濃", "東信"],
  },
  三重東近江線: {
    中部: ["三重", "鈴鹿"],
    関西: ["東近江", "湖南", "甲賀"],
  },
  "南福光連系所・南福光変電所の連系設備": {
    北陸: ["南福光"],
    関西: ["東近江", "嶺南"],
  },
  越前嶺南線: {
    北陸: ["越前", "南条"],
    関西: ["嶺南"],
  },
  "西播東岡山線・山崎智頭線": {
    関西: ["山崎", "西播"],
    中国: ["東岡山", "智頭", "新岡山"],
  },
  阿南紀北直流幹線: {
    四国: ["阿南", "鳴門"],
    関西: ["紀北"],
  },
  本四連系線: {
    中国: ["新倉敷", "岡山"],
    四国: ["讃岐", "阿波", "鳴門"],
  },
  関門連系線: {
    中国: ["東山口", "山口", "新山口"],
    九州: ["門司", "北九州"],
  },
  北陸フェンス: {
    中部: ["南福光", "東信", "信濃"],
    北陸: ["南福光", "新富山"],
  },
};

export function DashboardApp({ initialData, availableDates }: DashboardAppProps) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [selectedDate, setSelectedDate] = useState<string>(initialData.meta.targetDate);
  const [isDateLoading, setIsDateLoading] = useState<boolean>(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const selectableDates = useMemo(() => {
    const merged = new Set<string>([...availableDates, initialData.meta.targetDate, data.meta.targetDate]);
    return Array.from(merged).sort((a, b) => toDateStamp(b).localeCompare(toDateStamp(a), "en"));
  }, [availableDates, data.meta.targetDate, initialData.meta.targetDate]);

  useEffect(() => {
    if (selectedDate === data.meta.targetDate) {
      return;
    }

    let cancelled = false;
    const previousDate = data.meta.targetDate;

    const fetchByDate = async (): Promise<void> => {
      setIsDateLoading(true);
      setDateError(null);

      try {
        const dateStamp = toDateStamp(selectedDate);
        const response = await fetch(`data/normalized/dashboard-${dateStamp}.json`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`data not found for ${selectedDate}`);
        }
        const nextData = (await response.json()) as DashboardData;
        if (cancelled) {
          return;
        }
        setData(nextData);
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }
        setDateError(error instanceof Error ? error.message : "対象日のデータを読み込めませんでした");
        setSelectedDate(previousDate);
      } finally {
        if (!cancelled) {
          setIsDateLoading(false);
        }
      }
    };

    void fetchByDate();
    return () => {
      cancelled = true;
    };
  }, [data.meta.targetDate, selectedDate]);

  const areas = useMemo(() => {
    const set = new Set<string>();
    data.generation.areaTotals.forEach((item) => set.add(item.area));
    data.flows.areaSummaries.forEach((item) => set.add(item.area));
    return ["全エリア", ...Array.from(set)];
  }, [data]);
  const generationAreas = useMemo(
    () => ["全エリア", ...data.generation.areaTotals.map((item) => item.area)],
    [data.generation.areaTotals],
  );

  const [selectedArea, setSelectedArea] = useState<string>("全エリア");
  const [generationTrendArea, setGenerationTrendArea] = useState<string>("全エリア");
  const [sourceDonutArea, setSourceDonutArea] = useState<string>("全エリア");
  const flowSlotLabels = data.meta.slotLabels.flow ?? [];
  const maxFlowSlotIndex = Math.max(flowSlotLabels.length - 1, 0);
  const [networkFlowSlotIndex, setNetworkFlowSlotIndex] = useState<number>(maxFlowSlotIndex);
  const clampedNetworkFlowSlotIndex = clamp(Math.round(networkFlowSlotIndex), 0, maxFlowSlotIndex);
  const selectedFlowSlotLabel = flowSlotLabels[clampedNetworkFlowSlotIndex] ?? "-";
  const selectedFlowDateTimeLabel = `${data.meta.targetDate} ${selectedFlowSlotLabel}`;

  const sourceTotalsByArea = useMemo(() => {
    const byArea: Record<string, Array<{ source: string; totalKwh: number }>> = {};
    const areaSeries = data.generation.hourlyBySourceByArea ?? {};

    for (const [area, points] of Object.entries(areaSeries)) {
      const totals = new Map<string, number>();
      points.forEach((point) => {
        Object.entries(point.values).forEach(([source, value]) => {
          totals.set(source, (totals.get(source) ?? 0) + value);
        });
      });
      byArea[area] = Array.from(totals.entries())
        .map(([source, totalKwh]) => ({ source, totalKwh }))
        .sort((a, b) => b.totalKwh - a.totalKwh);
    }

    return byArea;
  }, [data.generation.hourlyBySourceByArea]);

  const filteredTopUnits = useMemo(
    () =>
      data.generation.topUnits.filter((unit) =>
        selectedArea === "全エリア" ? true : unit.area === selectedArea,
      ),
    [data.generation.topUnits, selectedArea],
  );

  const networkPowerPlants = useMemo(() => {
    if (data.generation.plantSummaries && data.generation.plantSummaries.length > 0) {
      return data.generation.plantSummaries
        .filter((plant) => isNetworkPowerPlantSource(plant.sourceType))
        .map((plant) => ({
          area: plant.area,
          plantName: plant.plantName,
          sourceType: plant.sourceType,
          dailyKwh: plant.dailyKwh,
          avgOutputMw: plant.dailyKwh / 24 / 1000,
          maxOutputManKw: plant.maxOutputManKw,
        }));
    }

    const fallback = new Map<string, { area: string; plantName: string; sourceType: string; dailyKwh: number; maxOutputManKw: number }>();
    data.generation.topUnits.forEach((unit) => {
      if (!isNetworkPowerPlantSource(unit.sourceType)) {
        return;
      }
      const key = `${unit.area}::${unit.plantName}`;
      const current = fallback.get(key) ?? {
        area: unit.area,
        plantName: unit.plantName,
        sourceType: unit.sourceType,
        dailyKwh: 0,
        maxOutputManKw: 0,
      };
      current.dailyKwh += unit.dailyKwh;
      current.maxOutputManKw = Math.max(current.maxOutputManKw, unit.maxOutputManKw ?? 0);
      fallback.set(key, current);
    });
    return Array.from(fallback.values()).map((plant) => ({
      area: plant.area,
      plantName: plant.plantName,
      sourceType: plant.sourceType,
      dailyKwh: plant.dailyKwh,
      avgOutputMw: plant.dailyKwh / 24 / 1000,
      maxOutputManKw: plant.maxOutputManKw,
    }));
  }, [data.generation.plantSummaries, data.generation.topUnits]);

  const filteredLines = useMemo(
    () =>
      data.flows.lineSeries.filter((line) =>
        selectedArea === "全エリア" ? true : line.area === selectedArea,
      ),
    [data.flows.lineSeries, selectedArea],
  );

  const generationLineOption = useMemo(() => {
    const scopedSeries =
      generationTrendArea === "全エリア"
        ? data.generation.hourlyBySource
        : (data.generation.hourlyBySourceByArea?.[generationTrendArea] ?? []);
    const fallbackKeys = Object.keys(data.generation.hourlyBySource[0]?.values ?? {});
    const sourceKeys = Object.keys(scopedSeries[0]?.values ?? {}).length
      ? Object.keys(scopedSeries[0]?.values ?? {})
      : fallbackKeys;

    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      legend: {
        type: "scroll",
        top: 8,
        textStyle: { color: "#264653" },
        formatter: (name: string) => normalizeSourceName(name),
      },
      grid: { top: 48, left: 48, right: 20, bottom: 36 },
      xAxis: {
        type: "category",
        data: data.meta.slotLabels.generation,
        axisLabel: { color: "#4a5568", interval: 3 },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#4a5568", formatter: (v: number) => numberFmt.format(v) },
      },
      graphic:
        sourceKeys.length > 0
          ? undefined
          : [
              {
                type: "text",
                left: "center",
                top: "middle",
                style: {
                  text: "このエリアの発電方式別データはありません",
                  fill: "#475569",
                  font: "14px sans-serif",
                },
                silent: true,
              },
            ],
      series: sourceKeys.map((source, idx) => ({
        name: normalizeSourceName(source),
        type: "line",
        stack: "generation",
        smooth: true,
        areaStyle: { opacity: 0.12 },
        symbol: "none",
        lineStyle: { width: 2 },
        color: SOURCE_COLORS[idx % SOURCE_COLORS.length],
        data: scopedSeries.map((point) => point.values[source] ?? 0),
      })),
    };
  }, [data.generation.hourlyBySource, data.generation.hourlyBySourceByArea, data.meta.slotLabels.generation, generationTrendArea]);

  const sourceDonutOption = useMemo(() => {
    const rows =
      sourceDonutArea === "全エリア"
        ? data.generation.sourceTotals
        : (sourceTotalsByArea[sourceDonutArea] ?? []);
    const totalKwh = rows.reduce((sum, item) => sum + item.totalKwh, 0);
    let cumulativePercent = 0;
    const rightLegend: string[] = [];
    const leftLegend: string[] = [];

    rows.forEach((item) => {
      const percent = totalKwh > 0 ? (item.totalKwh / totalKwh) * 100 : 0;
      cumulativePercent += percent;
      const name = normalizeSourceName(item.source);
      if (cumulativePercent <= 50) {
        rightLegend.push(name);
      } else {
        leftLegend.push(name);
      }
    });

    return {
      tooltip: { trigger: "item" },
      legend: [
        {
          type: "scroll",
          orient: "vertical",
          left: 0,
          top: "middle",
          width: "24%",
          align: "left",
          itemGap: 8,
          textStyle: { color: "#264653" },
          data: leftLegend,
        },
        {
          type: "scroll",
          orient: "vertical",
          right: 0,
          top: "middle",
          width: "24%",
          align: "left",
          itemGap: 8,
          textStyle: { color: "#264653" },
          data: rightLegend,
        },
      ],
      series: [
        {
          name: "発電方式",
          type: "pie",
          radius: ["40%", "60%"],
          center: ["50%", "50%"],
          avoidLabelOverlap: true,
          label: {
            formatter: (params: { percent?: number; name: string }) => {
              const percent = params.percent ?? 0;
              if (percent < 4) {
                return "";
              }
              return `${normalizeSourceName(params.name)}\n${percent.toFixed(0)}%`;
            },
            color: "#1b3a4b",
          },
          labelLine: {
            length: 10,
            length2: 8,
          },
          data: rows.map((item, idx) => ({
            name: normalizeSourceName(item.source),
            value: item.totalKwh,
            itemStyle: { color: SOURCE_COLORS[idx % SOURCE_COLORS.length] },
          })),
        },
      ],
    };
  }, [data.generation.sourceTotals, sourceDonutArea, sourceTotalsByArea]);

  const areaTotalsOption = useMemo(
    () => {
      const sortedAreaTotals = [...data.generation.areaTotals].sort((a, b) => b.totalKwh - a.totalKwh);
      return {
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
        grid: { top: 18, left: 74, right: 18, bottom: 30 },
        xAxis: {
          type: "value",
          axisLabel: { formatter: (v: number) => `${Math.round(v / 1_000_000)}M` },
        },
        yAxis: {
          type: "category",
          inverse: true,
          data: sortedAreaTotals.map((item) => item.area),
          axisLabel: { color: "#4a5568" },
        },
        series: [
          {
            type: "bar",
            data: sortedAreaTotals.map((item, idx) => ({
              value: item.totalKwh,
              itemStyle: {
                color: idx % 2 === 0 ? "#2a9d8f" : "#1d3557",
                borderRadius: [0, 6, 6, 0],
              },
            })),
          },
        ],
      };
    },
    [data.generation.areaTotals],
  );

  const flowHeatmapOption = useMemo(() => {
    const topLines = filteredLines.slice(0, 18);
    const yLabels = topLines.map((line) => `${line.area} | ${line.lineName}`);
    const heatmapData: Array<[number, number, number]> = [];

    topLines.forEach((line, rowIdx) => {
      line.values.forEach((value, colIdx) => {
        heatmapData.push([colIdx, rowIdx, Math.round(value)]);
      });
    });

    return {
      tooltip: {
        position: "top",
        formatter: (params: { data: [number, number, number] }) => {
          const [col, row, value] = params.data;
          return `${yLabels[row]}<br/>${data.meta.slotLabels.flow[col]}: ${numberFmt.format(value)} MW`;
        },
      },
      grid: { top: 20, left: 160, right: 20, bottom: 44 },
      xAxis: {
        type: "category",
        data: data.meta.slotLabels.flow,
        splitArea: { show: true },
        axisLabel: { interval: 3 },
      },
      yAxis: {
        type: "category",
        data: yLabels,
        splitArea: { show: true },
      },
      visualMap: {
        min: -800,
        max: 800,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        inRange: {
          color: ["#0b132b", "#1c2541", "#4f772d", "#f77f00", "#d62828"],
        },
      },
      series: [
        {
          name: "潮流",
          type: "heatmap",
          data: heatmapData,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: "rgba(0, 0, 0, 0.35)",
            },
          },
        },
      ],
    };
  }, [data.meta.slotLabels.flow, filteredLines]);

  const flowNetworkOption = useMemo(() => {
    type NetworkLink = {
      kind: "intra" | "intertie" | "plant";
      source: string;
      target: string;
      value: number;
      absAvgMw: number;
      area?: string;
      lineName?: string;
      intertieName?: string;
      voltageKv?: string;
      positiveDirection?: string;
      peakAbsMw?: number;
      sourceArea?: string;
      targetArea?: string;
      sourceStation?: string;
      targetStation?: string;
      plantName?: string;
      dailyKwh?: number;
      avgOutputMw?: number;
      converterRoute?: boolean;
      converterPair?: boolean;
    };

    const scopedInterties = (data.flows.intertieSeries ?? []).filter((row) =>
      selectedArea === "全エリア" ? true : row.sourceArea === selectedArea || row.targetArea === selectedArea,
    );

    const areaScope = new Set<string>();
    if (selectedArea === "全エリア") {
      data.flows.areaSummaries.forEach((row) => areaScope.add(row.area));
    } else {
      areaScope.add(selectedArea);
      scopedInterties.forEach((row) => {
        areaScope.add(row.sourceArea);
        areaScope.add(row.targetArea);
      });
    }

    const networkLines =
      selectedArea === "全エリア"
        ? data.flows.lineSeries
        : data.flows.lineSeries.filter((line) => areaScope.has(line.area));

    const visibleAreas = new Set<string>();
    const stationsByArea = new Map<string, Set<string>>();
    const nodeDegree = new Map<string, number>();
    const links: NetworkLink[] = [];

    networkLines.forEach((line) => {
      const direction = parseDirection(line.positiveDirection);
      if (!direction) {
        return;
      }
      visibleAreas.add(line.area);
      const slotMw = line.values[clampedNetworkFlowSlotIndex] ?? line.avgMw ?? 0;

      const sourceName = slotMw >= 0 ? direction.source : direction.target;
      const targetName = slotMw >= 0 ? direction.target : direction.source;
      if (
        isPseudoAreaNodeName(sourceName) ||
        isPseudoAreaNodeName(targetName) ||
        isLineLikeNodeName(sourceName) ||
        isLineLikeNodeName(targetName)
      ) {
        return;
      }
      const source = buildStationNodeId(line.area, sourceName);
      const target = buildStationNodeId(line.area, targetName);

      const stationSet = stationsByArea.get(line.area) ?? new Set<string>();
      stationSet.add(sourceName);
      stationSet.add(targetName);
      stationsByArea.set(line.area, stationSet);

      nodeDegree.set(source, (nodeDegree.get(source) ?? 0) + 1);
      nodeDegree.set(target, (nodeDegree.get(target) ?? 0) + 1);

      links.push({
        kind: "intra",
        source,
        target,
        value: slotMw,
        absAvgMw: Math.abs(slotMw),
        area: line.area,
        lineName: line.lineName,
        voltageKv: line.voltageKv,
        positiveDirection: line.positiveDirection,
        peakAbsMw: line.peakAbsMw,
      });
    });

    const stationPositions = buildStationLayout(stationsByArea);

    scopedInterties.forEach((line) => {
      visibleAreas.add(line.sourceArea);
      visibleAreas.add(line.targetArea);

      const sourceStationId = pickIntertieStationNodeId({
        intertieName: line.intertieName,
        area: line.sourceArea,
        oppositeArea: line.targetArea,
        stationsByArea,
        stationPositions,
        nodeDegree,
      });
      const targetStationId = pickIntertieStationNodeId({
        intertieName: line.intertieName,
        area: line.targetArea,
        oppositeArea: line.sourceArea,
        stationsByArea,
        stationPositions,
        nodeDegree,
      });

      if (!sourceStationId || !targetStationId || sourceStationId === targetStationId) {
        return;
      }

      nodeDegree.set(sourceStationId, (nodeDegree.get(sourceStationId) ?? 0) + 1);
      nodeDegree.set(targetStationId, (nodeDegree.get(targetStationId) ?? 0) + 1);

      const slotMw = line.values[clampedNetworkFlowSlotIndex] ?? line.avgMw ?? 0;
      const flowSource = slotMw >= 0 ? sourceStationId : targetStationId;
      const flowTarget = slotMw >= 0 ? targetStationId : sourceStationId;
      const sourceStationName = stationNameFromNodeId(sourceStationId);
      const targetStationName = stationNameFromNodeId(targetStationId);
      const sourceIsConverter = isConverterStationName(sourceStationName);
      const targetIsConverter = isConverterStationName(targetStationName);

      links.push({
        kind: "intertie",
        source: flowSource,
        target: flowTarget,
        value: slotMw,
        absAvgMw: Math.abs(slotMw),
        intertieName: line.intertieName,
        peakAbsMw: line.peakAbsMw,
        sourceArea: line.sourceArea,
        targetArea: line.targetArea,
        sourceStation: sourceStationName,
        targetStation: targetStationName,
        converterRoute: sourceIsConverter || targetIsConverter,
        converterPair: sourceIsConverter && targetIsConverter,
      });
    });

    if (selectedArea === "全エリア" && visibleAreas.size === 0) {
      data.flows.areaSummaries.forEach((row) => visibleAreas.add(row.area));
    }
    if (selectedArea !== "全エリア") {
      visibleAreas.add(selectedArea);
    }

    const areaCategories = Array.from(visibleAreas).sort(compareAreaOrder);
    const categoryIndex = new Map(areaCategories.map((area, index) => [area, index]));
    const stationLabelIds = new Set(
      Array.from(nodeDegree.entries())
        .filter(([nodeId, degree]) => nodeId.startsWith("station::") && degree >= (selectedArea === "全エリア" ? 3 : 2))
        .sort((a, b) => b[1] - a[1])
        .slice(0, selectedArea === "全エリア" ? 70 : 110)
        .map(([nodeId]) => nodeId),
    );

    const nodes: Array<Record<string, unknown>> = [];
    const stationNodeIdsByArea = new Map<string, string[]>();
    stationsByArea.forEach((stationSet, area) => {
      Array.from(stationSet)
        .sort((a, b) => a.localeCompare(b, "ja-JP"))
        .forEach((station) => {
          const stationNodeId = buildStationNodeId(area, station);
          const degree = nodeDegree.get(stationNodeId) ?? 0;
          const anchor = AREA_ANCHORS[area] ?? AREA_ANCHORS.default;
          const position = stationPositions.get(stationNodeId) ?? anchor;
          nodes.push({
            id: stationNodeId,
            name: station,
            area,
            category: categoryIndex.get(area) ?? 0,
            value: degree,
            nodeType: isConverterStationName(station) ? "converter" : "ss",
            shouldLabel: stationLabelIds.has(stationNodeId),
            x: position.x,
            y: position.y,
            symbolSize: isConverterStationName(station) ? 10 : 8,
            symbol: isConverterStationName(station) ? "diamond" : "circle",
            itemStyle: {
              color: isConverterStationName(station)
                ? "#0f766e"
                : (FLOW_AREA_COLORS[area] ?? FLOW_AREA_COLORS.default),
              borderColor: "#ffffff",
              borderWidth: 1,
            },
          });
          const ids = stationNodeIdsByArea.get(area) ?? [];
          ids.push(stationNodeId);
          stationNodeIdsByArea.set(area, ids);
        });
    });

    const scopedPowerPlants = networkPowerPlants
      .filter((plant) => areaScope.has(plant.area))
      .sort((a, b) => b.dailyKwh - a.dailyKwh);
    const maxPlantDaily = Math.max(...scopedPowerPlants.map((item) => item.dailyKwh), 1);
    const powerOccupiedCells = new Set<string>();

    scopedPowerPlants.forEach((plant, plantIndex) => {
      const base = resolveStationGeoBase(plant.area, plant.plantName) ?? (AREA_ANCHORS[plant.area] ?? AREA_ANCHORS.default);
      const attachStationNodeId = pickPlantAttachStationNodeId({
        area: plant.area,
        plantName: plant.plantName,
        stationsByArea,
        stationPositions,
      });
      const attachPos = attachStationNodeId
        ? stationPositions.get(attachStationNodeId) ?? (AREA_ANCHORS[plant.area] ?? AREA_ANCHORS.default)
        : base;
      const angle = ((hashSeed(`${plant.area}-${plant.plantName}`) % 360) * Math.PI) / 180;
      const ratio = plant.dailyKwh / maxPlantDaily;
      const radius = 14 + ratio * 28 + (plantIndex % 3) * 2;
      const radialCandidate = {
        x: clamp(attachPos.x + Math.cos(angle) * radius, MAP_VIEWBOX.padding, MAP_VIEWBOX.width - MAP_VIEWBOX.padding),
        y: clamp(attachPos.y + Math.sin(angle) * radius * 0.66, MAP_VIEWBOX.padding, MAP_VIEWBOX.height - MAP_VIEWBOX.padding),
      };
      const position = placePointAvoidingOverlap(
        radialCandidate,
        `power-${plant.area}-${plant.plantName}`,
        powerOccupiedCells,
      );
      const powerNodeId = buildPowerNodeId(plant.area, plant.plantName);
      nodes.push({
        id: powerNodeId,
        name: plant.plantName,
        area: plant.area,
        category: categoryIndex.get(plant.area) ?? 0,
        value: roundTo(plant.avgOutputMw, 1),
        nodeType: "power",
        sourceType: plant.sourceType,
        dailyKwh: plant.dailyKwh,
        maxOutputManKw: roundTo(plant.maxOutputManKw, 2),
        shouldLabel: ratio >= (selectedArea === "全エリア" ? 0.5 : 0.3),
        x: position.x,
        y: position.y,
        symbolSize: 5.2 + ratio * 10.8,
        itemStyle: {
          color: FLOW_AREA_COLORS[plant.area] ?? FLOW_AREA_COLORS.default,
          borderColor: "#ffffff",
          borderWidth: 1,
          shadowBlur: 4,
          shadowColor: "rgba(15,23,42,0.16)",
        },
      });

      if (attachStationNodeId) {
        links.push({
          kind: "plant",
          source: powerNodeId,
          target: attachStationNodeId,
          value: plant.avgOutputMw,
          absAvgMw: plant.avgOutputMw,
          area: plant.area,
          plantName: plant.plantName,
          dailyKwh: plant.dailyKwh,
          avgOutputMw: plant.avgOutputMw,
          sourceStation: plant.plantName,
          targetStation: stationNameFromNodeId(attachStationNodeId),
        });
      }
    });

    const maxAbsIntra = Math.max(
      ...links.filter((line) => line.kind === "intra").map((line) => line.absAvgMw),
      1,
    );
    const maxAbsIntertie = Math.max(
      ...links.filter((line) => line.kind === "intertie").map((line) => line.absAvgMw),
      1,
    );
    const maxPlantFlow = Math.max(
      ...links.filter((line) => line.kind === "plant").map((line) => line.absAvgMw),
      1,
    );

    const renderedLinks = links.map((line) => {
      if (line.kind === "plant") {
        const ratio = line.absAvgMw / maxPlantFlow;
        return {
          ...line,
          lineStyle: {
            width: 1.4 + ratio * 3.2,
            opacity: 0.62,
            curveness: 0.02,
            color: "rgba(20,184,166,0.75)",
          },
          z: 3,
        };
      }

      if (line.kind === "intertie") {
        const ratio = line.absAvgMw / maxAbsIntertie;
        const baseColor = line.value >= 0 ? "#ef4444" : "#1d4ed8";
        const converterColor = line.value >= 0 ? "#f97316" : "#0891b2";
        return {
          ...line,
          lineStyle: {
            width: (line.converterRoute ? 3.4 : 2.8) + ratio * (line.converterRoute ? 5.4 : 4.8),
            opacity: line.converterRoute ? 0.94 : 0.86,
            curveness: line.converterRoute ? 0.16 : 0.12,
            type: line.converterRoute ? "dashed" : "solid",
            color: line.converterRoute ? converterColor : baseColor,
          },
          z: 4,
        };
      }

      const ratio = line.absAvgMw / maxAbsIntra;
      return {
        ...line,
        lineStyle: {
          width: 0.7 + ratio * 2.8,
          opacity: 0.58,
          curveness: 0.06,
          color: line.value >= 0 ? "rgba(249,115,22,0.9)" : "rgba(30,64,175,0.9)",
        },
        z: 2,
      };
    });

    const nodePointById = new Map<string, { x: number; y: number }>();
    nodes.forEach((node) => {
      const id = String(node.id ?? "");
      const x = Number(node.x);
      const y = Number(node.y);
      if (id && Number.isFinite(x) && Number.isFinite(y)) {
        nodePointById.set(id, { x, y });
      }
    });
    const animatedFlowLines = renderedLinks
      .filter((line) => line.kind !== "plant" && !line.converterRoute)
      .map((line) => {
        const from = nodePointById.get(String(line.source));
        const to = nodePointById.get(String(line.target));
        if (!from || !to) {
          return null;
        }
        return {
          coords: [
            [from.x, from.y],
            [to.x, to.y],
          ],
          lineStyle: {
            color: line.lineStyle.color,
            width: 0,
            opacity: 0,
          },
        };
      })
      .filter((item) => item !== null);
    const animatedConverterLines = renderedLinks
      .filter((line) => line.kind === "intertie" && line.converterRoute)
      .map((line) => {
        const from = nodePointById.get(String(line.source));
        const to = nodePointById.get(String(line.target));
        if (!from || !to) {
          return null;
        }
        return {
          coords: [
            [from.x, from.y],
            [to.x, to.y],
          ],
          lineStyle: {
            color: line.lineStyle.color,
            width: 0,
            opacity: 0,
          },
        };
      })
      .filter((item) => item !== null);

    const guideGraphics = buildJapanGuideGraphics();

    return {
      animationDurationUpdate: 360,
      tooltip: {
        trigger: "item",
        confine: true,
        formatter: (params: {
          dataType: "node" | "edge";
          name: string;
          data: {
            kind?: "intra" | "intertie" | "plant";
            value: number;
            area?: string;
            lineName?: string;
            intertieName?: string;
            voltageKv?: string;
            positiveDirection?: string;
            peakAbsMw?: number;
            sourceArea?: string;
            targetArea?: string;
            sourceStation?: string;
            targetStation?: string;
            nodeType?: "ss" | "power" | "converter";
            sourceType?: string;
            dailyKwh?: number;
            maxOutputManKw?: number;
            avgOutputMw?: number;
            converterRoute?: boolean;
            converterPair?: boolean;
          };
        }) => {
          if (params.dataType === "edge") {
            if (params.data.kind === "plant") {
              return `${params.data.area} | ${params.data.sourceStation}<br/>区分: 電源接続<br/>接続SS: ${
                params.data.targetStation
              }<br/>平均出力: ${decimalFmt.format(params.data.avgOutputMw ?? params.data.value)} MW<br/>日量: ${numberFmt.format(
                Math.round(params.data.dailyKwh ?? 0),
              )} kWh`;
            }
            if (params.data.kind === "intertie") {
              return `${params.data.intertieName}<br/>区分: 連系線<br/>接続: ${params.data.sourceArea} ⇄ ${
                params.data.targetArea
              }<br/>接続SS: ${params.data.sourceStation} ⇄ ${params.data.targetStation}<br/>変換所連系: ${
                params.data.converterPair ? "変換所-変換所" : params.data.converterRoute ? "含む" : "なし"
              }<br/>表示時刻: ${selectedFlowDateTimeLabel}<br/>潮流: ${decimalFmt.format(
                params.data.value,
              )} MW<br/>最大|潮流|: ${numberFmt.format(
                params.data.peakAbsMw ?? 0,
              )} MW`;
            }
            if (params.data.kind === "intra") {
              return `${params.data.area} | ${params.data.lineName}<br/>区分: 地域内送電線<br/>定義方向: ${
                params.data.positiveDirection
              }<br/>表示時刻: ${selectedFlowDateTimeLabel}<br/>潮流: ${decimalFmt.format(params.data.value)} MW<br/>最大|潮流|: ${numberFmt.format(
                params.data.peakAbsMw ?? 0,
              )} MW<br/>電圧: ${params.data.voltageKv}`;
            }
            return "";
          }
          if (params.data.nodeType === "power") {
            return `${params.data.area} | ${params.name}<br/>区分: 電源<br/>平均出力: ${decimalFmt.format(
              params.data.value,
            )} MW<br/>方式: ${params.data.sourceType ?? "不明"}<br/>最大出力: ${decimalFmt.format(
              params.data.maxOutputManKw ?? 0,
            )} 万kW<br/>日量: ${numberFmt.format(
              Math.round(params.data.dailyKwh ?? 0),
            )} kWh`;
          }
          if (params.data.nodeType === "converter") {
            return `${params.data.area} | ${params.name}<br/>区分: 変換所<br/>接続本数: ${numberFmt.format(
              params.data.value,
            )} 本`;
          }
          return `${params.data.area ?? "不明"} | ${params.name}<br/>接続本数: ${numberFmt.format(
            params.data.value,
          )} 本`;
        },
      },
      legend: [
        {
          type: "scroll",
          top: 10,
          data: areaCategories,
          textStyle: { color: "#334155" },
        },
      ],
      graphic: guideGraphics,
      series: [
        {
          type: "graph",
          layout: "none",
          roam: true,
          draggable: false,
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          data: nodes,
          links: renderedLinks,
          categories: areaCategories.map((name) => ({
            name,
            itemStyle: { color: FLOW_AREA_COLORS[name] ?? FLOW_AREA_COLORS.default },
          })),
          edgeSymbol: ["none", "arrow"],
          edgeSymbolSize: [0, 8],
          lineStyle: {
            opacity: 0.72,
          },
          label: {
            show: true,
            formatter: (params: {
              data: { nodeType?: "ss" | "power" | "converter"; shouldLabel?: boolean; value?: number };
              name: string;
            }) => {
              if (params.data.shouldLabel) {
                return params.name;
              }
              return "";
            },
            position: "right",
            color: "#1f2937",
            fontSize: 10,
            backgroundColor: "rgba(255,255,255,0.72)",
            borderRadius: 4,
            padding: [1, 3],
          },
          labelLayout: {
            hideOverlap: true,
          },
          emphasis: {
            focus: "adjacency",
            label: {
              show: true,
            },
            lineStyle: {
              opacity: 0.95,
            },
          },
        },
        {
          type: "lines",
          coordinateSystem: "none",
          polyline: false,
          silent: true,
          z: 7,
          data: animatedFlowLines,
          effect: {
            show: true,
            constantSpeed: 26,
            trailLength: 0,
            symbol: "arrow",
            symbolSize: 6,
            color: "rgba(15,23,42,0.9)",
          },
          lineStyle: {
            width: 0,
            opacity: 0,
          },
        },
        {
          type: "lines",
          coordinateSystem: "none",
          polyline: false,
          silent: true,
          z: 8,
          data: animatedConverterLines,
          effect: {
            show: true,
            constantSpeed: 20,
            trailLength: 0.24,
            symbol: "arrow",
            symbolSize: 7,
            color: "#0f766e",
          },
          lineStyle: {
            width: 0,
            opacity: 0,
          },
        },
      ],
    };
  }, [
    data.flows.areaSummaries,
    data.flows.intertieSeries,
    data.flows.lineSeries,
    clampedNetworkFlowSlotIndex,
    networkPowerPlants,
    selectedArea,
    selectedFlowDateTimeLabel,
  ]);

  const interAreaFlowTextRows = useMemo(() => {
    const scopedInterties = (data.flows.intertieSeries ?? []).filter((row) =>
      selectedArea === "全エリア" ? true : row.sourceArea === selectedArea || row.targetArea === selectedArea,
    );
    const pairMap = new Map<
      string,
      {
        sourceArea: string;
        targetArea: string;
        upMw: number;
        downMw: number;
        intertieNames: Set<string>;
      }
    >();

    scopedInterties.forEach((row) => {
      const key = `${row.sourceArea}::${row.targetArea}`;
      const slotMw = row.values[clampedNetworkFlowSlotIndex] ?? row.avgMw ?? 0;
      const current = pairMap.get(key) ?? {
        sourceArea: row.sourceArea,
        targetArea: row.targetArea,
        upMw: 0,
        downMw: 0,
        intertieNames: new Set<string>(),
      };
      if (slotMw >= 0) {
        current.upMw += slotMw;
      } else {
        current.downMw += Math.abs(slotMw);
      }
      current.intertieNames.add(row.intertieName);
      pairMap.set(key, current);
    });

    const rows = Array.from(pairMap.values()).map((row) => ({
      sourceArea: row.sourceArea,
      targetArea: row.targetArea,
      upMw: roundTo(row.upMw, 1),
      downMw: roundTo(row.downMw, 1),
      magnitudeMw: roundTo(row.upMw + row.downMw, 1),
      intertieNames: Array.from(row.intertieNames),
    }));

    if (rows.length > 0) {
      return rows.sort((a, b) => b.magnitudeMw - a.magnitudeMw).slice(0, selectedArea === "全エリア" ? 14 : 22);
    }

    return (data.flows.interAreaFlows ?? [])
      .filter((row) =>
        selectedArea === "全エリア" ? true : row.sourceArea === selectedArea || row.targetArea === selectedArea,
      )
      .map((row) => ({
        sourceArea: row.sourceArea,
        targetArea: row.targetArea,
        upMw: roundTo(Math.max(row.avgMw, 0), 1),
        downMw: roundTo(Math.max(-row.avgMw, 0), 1),
        magnitudeMw: roundTo(row.avgAbsMw, 1),
        intertieNames: row.intertieNames,
      }))
      .sort((a, b) => b.magnitudeMw - a.magnitudeMw)
      .slice(0, selectedArea === "全エリア" ? 14 : 22);
  }, [clampedNetworkFlowSlotIndex, data.flows.interAreaFlows, data.flows.intertieSeries, selectedArea]);

  const intertieTrendOption = useMemo(() => {
    const scopedSeries = (data.flows.intertieSeries ?? []).filter((row) =>
      selectedArea === "全エリア" ? true : row.sourceArea === selectedArea || row.targetArea === selectedArea,
    );
    const topSeries = [...scopedSeries]
      .sort((a, b) => b.avgAbsMw - a.avgAbsMw)
      .slice(0, selectedArea === "全エリア" ? 6 : 8);
    const hasData = topSeries.length > 0;

    const netImportSeries =
      selectedArea === "全エリア"
        ? null
        : data.meta.slotLabels.flow.map((_, idx) => {
            let sum = 0;
            for (const row of scopedSeries) {
              const value = row.values[idx] ?? 0;
              if (row.sourceArea === selectedArea) {
                sum -= value;
              }
              if (row.targetArea === selectedArea) {
                sum += value;
              }
            }
            return roundTo(sum, 1);
          });

    return {
      tooltip: {
        trigger: "axis",
        valueFormatter: (value: number) => `${decimalFmt.format(value)} MW`,
      },
      legend: {
        top: 10,
        type: "scroll",
        textStyle: { color: "#334155" },
      },
      grid: { top: 58, left: 52, right: 20, bottom: 34 },
      xAxis: {
        type: "category",
        data: data.meta.slotLabels.flow,
        axisLabel: { interval: 3 },
      },
      yAxis: {
        type: "value",
        name: "潮流実績(MW)",
      },
      graphic: hasData
        ? undefined
        : [
            {
              type: "text",
              left: "center",
              top: "middle",
              style: {
                text: "連系線潮流実績データが未取得です",
                fill: "#475569",
                font: "14px sans-serif",
              },
              silent: true,
            },
          ],
      series: [
        ...(netImportSeries
          ? [
              {
                name: `${selectedArea} 純流入(+)`,
                type: "line",
                data: netImportSeries,
                smooth: true,
                symbol: "none",
                lineStyle: { width: 3, color: "#111827", type: "dashed" },
              },
            ]
          : []),
        ...topSeries.map((row) => ({
          name: `${row.sourceArea}→${row.targetArea}`,
          type: "line",
          data: row.values,
          smooth: true,
          symbol: "none",
          lineStyle: {
            width: 2.3,
            color: FLOW_AREA_COLORS[row.sourceArea] ?? FLOW_AREA_COLORS.default,
          },
        })),
      ],
    };
  }, [data.flows.intertieSeries, data.meta.slotLabels.flow, selectedArea]);

  const areaBalanceOption = useMemo(
    () => ({
      tooltip: {
        formatter: (params: { data: [number, number, number, string] }) => {
          const [dailyKwh, peakAbsMw, stress, area] = params.data;
          return `${area}<br/>日量: ${numberFmt.format(dailyKwh)} kWh<br/>最大|潮流|: ${numberFmt.format(
            peakAbsMw,
          )} MW<br/>Stress: ${stress}`;
        },
      },
      xAxis: {
        name: "日量発電(kWh)",
        axisLabel: { formatter: (v: number) => `${Math.round(v / 1_000_000)}M` },
      },
      yAxis: {
        name: "最大|潮流|(MW)",
      },
      series: [
        {
          type: "scatter",
          symbolSize: (value: [number, number, number]) => 12 + value[2] * 3,
          itemStyle: { color: "#1d3557" },
          data: data.insights.areaBalance.map((item) => [
            item.dailyKwh,
            item.peakAbsMw,
            item.stressIndex,
            item.area,
          ]),
        },
      ],
    }),
    [data.insights.areaBalance],
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f4f1de_0%,_#f6f8fb_38%,_#e9f5f2_100%)] text-slate-800">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-4 py-6 md:px-8">
        <header className="rounded-3xl border border-white/70 bg-white/80 px-5 py-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs tracking-[0.18em] text-teal-700">OCCTO GRID OBSERVATORY</p>
              <h1 className="text-2xl font-semibold leading-tight md:text-3xl">
                送電潮流 × ユニット発電実績 ダッシュボード
              </h1>
              <p className="text-sm text-slate-600">
                対象日: {data.meta.targetDate} / 最終取り込み:{" "}
                {new Date(data.meta.fetchedAt).toLocaleString("ja-JP")}
              </p>
            </div>
            <div className="flex flex-col items-start gap-2 md:items-end">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="dashboard-date" className="text-sm font-medium text-slate-600">
                  対象日
                </label>
                <select
                  id="dashboard-date"
                  className="rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  value={selectedDate}
                  onChange={(event) => {
                    setDateError(null);
                    setSelectedDate(event.target.value);
                  }}
                  disabled={isDateLoading}
                >
                  {selectableDates.map((date) => (
                    <option key={date} value={date}>
                      {date}
                    </option>
                  ))}
                </select>
                {isDateLoading ? <span className="text-xs text-teal-700">読み込み中...</span> : null}
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="area" className="text-sm font-medium text-slate-600">
                  エリア
                </label>
                <select
                  id="area"
                  className="rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                  value={selectedArea}
                  onChange={(event) => setSelectedArea(event.target.value)}
                >
                  {areas.map((area) => (
                    <option key={area} value={area}>
                      {area}
                    </option>
                  ))}
                </select>
              </div>
              {dateError ? <p className="text-xs text-rose-700">{dateError}</p> : null}
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel title="発電方式別 30分推移" className="lg:col-span-2">
            <div className="mb-2 flex justify-end">
              <label htmlFor="generation-area" className="mr-2 text-sm text-slate-600">
                表示エリア
              </label>
              <select
                id="generation-area"
                className="rounded-lg border border-teal-200 bg-white px-2 py-1 text-sm focus:border-teal-500 focus:outline-none"
                value={generationTrendArea}
                onChange={(event) => setGenerationTrendArea(event.target.value)}
              >
                {generationAreas.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>
            <ReactECharts option={generationLineOption} style={{ height: 360 }} />
          </Panel>
          <Panel title="発電方式 構成比">
            <div className="mb-2 flex justify-end">
              <label htmlFor="source-donut-area" className="mr-2 text-sm text-slate-600">
                表示エリア
              </label>
              <select
                id="source-donut-area"
                className="rounded-lg border border-teal-200 bg-white px-2 py-1 text-sm focus:border-teal-500 focus:outline-none"
                value={sourceDonutArea}
                onChange={(event) => setSourceDonutArea(event.target.value)}
              >
                {generationAreas.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>
            <ReactECharts option={sourceDonutOption} style={{ height: 360 }} />
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="エリア別 日量発電">
            <ReactECharts option={areaTotalsOption} style={{ height: 320 }} />
          </Panel>
          <Panel title="連系線潮流トレンド（時系列）">
            <ReactECharts option={intertieTrendOption} style={{ height: 320 }} />
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel title="エリアネットワーク潮流（連系線＋地域内送電線）" className="lg:col-span-2">
            <div className="mb-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span>表示日時: {selectedFlowDateTimeLabel}</span>
                <span>
                  スロット {flowSlotLabels.length === 0 ? 0 : clampedNetworkFlowSlotIndex + 1} / {flowSlotLabels.length}
                </span>
              </div>
              <input
                aria-label="ネットワーク潮流の表示時刻"
                type="range"
                min={0}
                max={maxFlowSlotIndex}
                step={1}
                value={clampedNetworkFlowSlotIndex}
                onChange={(event) => setNetworkFlowSlotIndex(Number(event.target.value))}
                disabled={flowSlotLabels.length === 0}
                className="w-full accent-teal-600"
              />
              <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                <span>{flowSlotLabels[0] ?? "-"}</span>
                <span>{flowSlotLabels[maxFlowSlotIndex] ?? "-"}</span>
              </div>
            </div>
            <ReactECharts option={flowNetworkOption} style={{ height: 620 }} />
          </Panel>
          <Panel title="エリア間連系潮流（実績）">
            <div className="mb-2 text-xs text-slate-600">表示日時: {selectedFlowDateTimeLabel}</div>
            <div className="h-[594px] space-y-2 overflow-y-auto pr-1">
              {interAreaFlowTextRows.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  連系線潮流実績データが未取得です
                </div>
              ) : (
                interAreaFlowTextRows.map((row) => (
                  <article
                    key={`${row.sourceArea}-${row.targetArea}`}
                    className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-800">
                        {row.sourceArea} ⇄ {row.targetArea}
                      </p>
                      <p className="text-xs text-slate-500">{row.intertieNames.length}線路</p>
                    </div>
                    <p className="mt-1 font-mono text-sm">
                      <span className="text-emerald-700">{decimalFmt.format(row.upMw)}MW ↑</span>
                      <span className="mx-2 text-slate-400">|</span>
                      <span className="text-rose-700">{decimalFmt.format(row.downMw)}MW ↓</span>
                    </p>
                    <p className="mt-1 truncate text-[11px] text-slate-500" title={row.intertieNames.join(" / ")}>
                      {row.intertieNames.join(" / ")}
                    </p>
                  </article>
                ))
              )}
            </div>
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel title="主要線路の潮流ヒートマップ" className="lg:col-span-2">
            <ReactECharts option={flowHeatmapOption} style={{ height: 420 }} />
          </Panel>
          <Panel title="エリア負荷バランス">
            <ReactECharts option={areaBalanceOption} style={{ height: 420 }} />
          </Panel>
        </section>

        <section className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">高発電ユニット上位</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-3">エリア</th>
                  <th className="py-2 pr-3">発電所</th>
                  <th className="py-2 pr-3">ユニット</th>
                  <th className="py-2 pr-3">方式</th>
                  <th className="py-2 text-right">最大出力(万kW)</th>
                  <th className="py-2 text-right">日量(kWh)</th>
                </tr>
              </thead>
              <tbody>
                {filteredTopUnits.slice(0, 24).map((unit) => (
                  <tr key={`${unit.area}-${unit.plantName}-${unit.unitName}`} className="border-b border-slate-100">
                    <td className="py-2 pr-3">{unit.area}</td>
                    <td className="py-2 pr-3">{unit.plantName}</td>
                    <td className="py-2 pr-3">{unit.unitName}</td>
                    <td className="py-2 pr-3">{unit.sourceType}</td>
                    <td className="py-2 text-right">
                      {typeof unit.maxOutputManKw === "number" ? manKwFmt.format(unit.maxOutputManKw) : "-"}
                    </td>
                    <td className="py-2 text-right">{numberFmt.format(unit.dailyKwh)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function Panel({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-3xl border border-white/70 bg-white/90 p-4 shadow-sm ${className ?? ""}`}>
      <h2 className="mb-2 text-base font-semibold text-slate-800">{title}</h2>
      {children}
    </section>
  );
}

function toDateStamp(dateText: string): string {
  return dateText.trim().replaceAll("/", "").replaceAll("-", "");
}

function parseDirection(
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

function buildStationNodeId(area: string, station: string): string {
  return `station::${area.trim()}::${station.trim()}`;
}

function buildPowerNodeId(area: string, plantName: string): string {
  return `power::${area.trim()}::${plantName.trim()}`;
}

function stationNameFromNodeId(nodeId: string): string {
  const marker = nodeId.indexOf("::", "station::".length);
  if (marker === -1) {
    return nodeId;
  }
  return nodeId.slice(marker + 2);
}

function pickIntertieStationNodeId(args: {
  intertieName: string;
  area: string;
  oppositeArea: string;
  stationsByArea: Map<string, Set<string>>;
  stationPositions: Map<string, { x: number; y: number }>;
  nodeDegree: Map<string, number>;
}): string | null {
  const stationSet = args.stationsByArea.get(args.area);
  if (!stationSet || stationSet.size === 0) {
    return null;
  }

  const stations = Array.from(stationSet).filter(
    (station) => !isPseudoAreaNodeName(station) && !isLineLikeNodeName(station),
  );
  if (stations.length === 0) {
    return null;
  }
  const intertieHints = INTERTIE_STATION_HINTS[args.intertieName]?.[args.area] ?? [];

  for (const keyword of intertieHints) {
    const normalizedKeyword = normalizeStationName(keyword);
    const matched = stations.filter((station) =>
      normalizeStationName(station).includes(normalizedKeyword),
    );
    if (matched.length === 0) {
      continue;
    }
    const best = matched.sort((a, b) => {
      const aId = buildStationNodeId(args.area, a);
      const bId = buildStationNodeId(args.area, b);
      return (args.nodeDegree.get(bId) ?? 0) - (args.nodeDegree.get(aId) ?? 0);
    })[0];
    return buildStationNodeId(args.area, best);
  }

  const areaAnchor = AREA_ANCHORS[args.area] ?? AREA_ANCHORS.default;
  const oppositeAnchor = AREA_ANCHORS[args.oppositeArea] ?? AREA_ANCHORS.default;
  let bestNodeId: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const station of stations) {
    const nodeId = buildStationNodeId(args.area, station);
    const position = args.stationPositions.get(nodeId) ?? areaAnchor;
    const degree = args.nodeDegree.get(nodeId) ?? 0;
    const distanceToOpposite = Math.hypot(position.x - oppositeAnchor.x, position.y - oppositeAnchor.y);
    const distanceToAreaCenter = Math.hypot(position.x - areaAnchor.x, position.y - areaAnchor.y);
    const score = degree * 24 - distanceToOpposite * 0.5 - distanceToAreaCenter * 0.09;
    if (score > bestScore) {
      bestScore = score;
      bestNodeId = nodeId;
    }
  }

  return bestNodeId;
}

function pickPlantAttachStationNodeId(args: {
  area: string;
  plantName: string;
  stationsByArea: Map<string, Set<string>>;
  stationPositions: Map<string, { x: number; y: number }>;
}): string | null {
  const stationSet = args.stationsByArea.get(args.area);
  if (!stationSet || stationSet.size === 0) {
    return null;
  }

  const candidates = Array.from(stationSet).filter((station) => !isPseudoAreaNodeName(station));
  if (candidates.length === 0) {
    return null;
  }
  const base = resolveStationGeoBase(args.area, args.plantName) ?? (AREA_ANCHORS[args.area] ?? AREA_ANCHORS.default);

  let bestNodeId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const station of candidates) {
    const nodeId = buildStationNodeId(args.area, station);
    const point = args.stationPositions.get(nodeId) ?? (AREA_ANCHORS[args.area] ?? AREA_ANCHORS.default);
    const distance = Math.hypot(point.x - base.x, point.y - base.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestNodeId = nodeId;
    }
  }
  return bestNodeId;
}

function buildStationLayout(stationsByArea: Map<string, Set<string>>): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const occupiedCells = new Set<string>();

  stationsByArea.forEach((stations, area) => {
    const anchor = AREA_ANCHORS[area] ?? AREA_ANCHORS.default;
    const sorted = Array.from(stations).sort((a, b) => a.localeCompare(b, "ja-JP"));

    sorted.forEach((station, index) => {
      const seed = `${area}-${station}-${index}`;
      const hinted = resolveStationGeoBase(area, station);
      const base = hinted ?? {
        x: anchor.x + ((hashSeed(seed) % 13) - 6),
        y: anchor.y + (((hashSeed(seed + "-y") % 13) - 6) * 0.85),
      };
      const placed = placePointAvoidingOverlap(base, seed, occupiedCells);
      positions.set(buildStationNodeId(area, station), placed);
    });
  });

  return positions;
}

function resolveStationGeoBase(area: string, station: string): { x: number; y: number } | null {
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
  const directionalNudge = getDirectionalNudge(normalized);
  return {
    x: clamp(point.x + directionalNudge.dx, MAP_VIEWBOX.padding, MAP_VIEWBOX.width - MAP_VIEWBOX.padding),
    y: clamp(point.y + directionalNudge.dy, MAP_VIEWBOX.padding, MAP_VIEWBOX.height - MAP_VIEWBOX.padding),
  };
}

function resolveStationCanvasOverride(area: string, normalizedStation: string): { x: number; y: number } | null {
  const hints = STATION_CANVAS_OFFSETS_BY_AREA[area] ?? [];
  const matched = hints.find((hint) => normalizedStation.includes(hint.keyword));
  if (!matched) {
    return null;
  }
  const anchor = AREA_ANCHORS[area] ?? AREA_ANCHORS.default;
  return {
    x: clamp(anchor.x + matched.dx, MAP_VIEWBOX.padding, MAP_VIEWBOX.width - MAP_VIEWBOX.padding),
    y: clamp(anchor.y + matched.dy, MAP_VIEWBOX.padding, MAP_VIEWBOX.height - MAP_VIEWBOX.padding),
  };
}

function resolveGlobalStationGeoBase(normalizedStation: string): { x: number; y: number } | null {
  if (!normalizedStation.includes("山陰")) {
    return null;
  }
  const saninPoint = geoToCanvas(35.4681, 133.0484);
  return {
    x: clamp(saninPoint.x, MAP_VIEWBOX.padding, MAP_VIEWBOX.width - MAP_VIEWBOX.padding),
    y: clamp(saninPoint.y, MAP_VIEWBOX.padding, MAP_VIEWBOX.height - MAP_VIEWBOX.padding),
  };
}

function normalizeStationName(station: string): string {
  return station
    .trim()
    .replace(/\s+/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/変電所|開閉所|変換所|発電所|火力|幹線|連系線|SS|ss|SWS|sws|CS|cs|PS|ps/g, "");
}

function isPseudoAreaNodeName(name: string): boolean {
  const normalized = name
    .trim()
    .replace(/[!！?？]/g, "")
    .replace(/\s+/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/エリア/g, "");
  return FLOW_AREA_NAME_SET.has(normalized);
}

function isLineLikeNodeName(name: string): boolean {
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

function isConverterStationName(name: string): boolean {
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

function getDirectionalNudge(station: string): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  if (station.includes("東")) {
    dx += 9;
  }
  if (station.includes("西")) {
    dx -= 9;
  }
  if (station.includes("北")) {
    dy -= 9;
  }
  if (station.includes("南")) {
    dy += 9;
  }
  if (station.includes("新")) {
    dx += 3;
    dy -= 3;
  }
  return { dx, dy };
}

function geoToCanvas(lat: number, lon: number): { x: number; y: number } {
  const xRatio = (lon - JAPAN_GEO_BOUNDS.lonMin) / (JAPAN_GEO_BOUNDS.lonMax - JAPAN_GEO_BOUNDS.lonMin);
  const yRatio = (JAPAN_GEO_BOUNDS.latMax - lat) / (JAPAN_GEO_BOUNDS.latMax - JAPAN_GEO_BOUNDS.latMin);
  return {
    x: MAP_VIEWBOX.padding + xRatio * (MAP_VIEWBOX.width - MAP_VIEWBOX.padding * 2),
    y: MAP_VIEWBOX.padding + yRatio * (MAP_VIEWBOX.height - MAP_VIEWBOX.padding * 2),
  };
}

function placePointAvoidingOverlap(
  base: { x: number; y: number },
  seedText: string,
  occupiedCells: Set<string>,
): { x: number; y: number } {
  const cellSize = 7;
  const maxTry = 42;
  const hash = hashSeed(seedText);

  for (let attempt = 0; attempt < maxTry; attempt += 1) {
    const radius = attempt === 0 ? 0 : 3 + Math.floor((attempt - 1) / 6) * 2;
    const angle = ((hash + attempt * 53) % 360) * (Math.PI / 180);
    const x = clamp(base.x + Math.cos(angle) * radius, MAP_VIEWBOX.padding, MAP_VIEWBOX.width - MAP_VIEWBOX.padding);
    const y = clamp(base.y + Math.sin(angle) * radius, MAP_VIEWBOX.padding, MAP_VIEWBOX.height - MAP_VIEWBOX.padding);
    const key = `${Math.round(x / cellSize)}:${Math.round(y / cellSize)}`;
    if (!occupiedCells.has(key)) {
      occupiedCells.add(key);
      return { x, y };
    }
  }

  return {
    x: clamp(base.x, MAP_VIEWBOX.padding, MAP_VIEWBOX.width - MAP_VIEWBOX.padding),
    y: clamp(base.y, MAP_VIEWBOX.padding, MAP_VIEWBOX.height - MAP_VIEWBOX.padding),
  };
}

function compareAreaOrder(a: string, b: string): number {
  const aIndex = MAP_CORRIDOR_ORDER.indexOf(a);
  const bIndex = MAP_CORRIDOR_ORDER.indexOf(b);
  if (aIndex === -1 && bIndex === -1) {
    return a.localeCompare(b, "ja-JP");
  }
  if (aIndex === -1) {
    return 1;
  }
  if (bIndex === -1) {
    return -1;
  }
  return aIndex - bIndex;
}

function buildJapanGuideGraphics(): Array<Record<string, unknown>> {
  return [];
}

function hashSeed(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizeSourceName(source: string): string {
  const trimmed = source.trim();
  return trimmed.length > 0 ? trimmed : "不明";
}

function isNetworkPowerPlantSource(sourceType: string): boolean {
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

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
