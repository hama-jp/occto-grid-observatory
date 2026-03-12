import { promises as fs } from "node:fs";
import path from "node:path";

type FacilityType = "SS" | "CS" | "PS" | "SWS" | "UNKNOWN";

type StationDbRecord = {
  area: string;
  name: string;
  aliases: string[];
  facilityType: FacilityType;
  address: string;
  lat: number;
  lon: number;
  source: string;
  confidence: "medium";
  verifiedBy: string;
  verifiedAt: string;
  note: string;
};

type StationDb = {
  version: number;
  updatedAt: string;
  records: StationDbRecord[];
};

type CuratedSeed = {
  area: string;
  name: string;
  aliases?: string[];
  facilityType: FacilityType;
  address: string;
  lat: number;
  lon: number;
  source: string;
  note: string;
};

type PropagationSeed = {
  area: string;
  name: string;
  aliases?: string[];
  facilityType: FacilityType;
  fromName: string;
  address: string;
  note: string;
};

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, "data", "master", "station-location-db.json");

const CURATED_ADDITIONS: CuratedSeed[] = [
  {
    area: "関西",
    name: "泉北天然ガス第一発電所",
    aliases: ["Daigasグループ 泉北天然ガス発電所"],
    facilityType: "PS",
    address: "大阪府高石市高砂3丁目",
    lat: 34.543647,
    lon: 135.417977,
    source: "official_site_plus_google_maps",
    note: "Daigas公式資料の泉北天然ガス発電所情報と Google Maps exact query を照合。",
  },
  {
    area: "関西",
    name: "泉北天然ガス第二発電所",
    aliases: ["Daigasグループ 泉北天然ガス発電所"],
    facilityType: "PS",
    address: "大阪府高石市高砂3丁目",
    lat: 34.54175,
    lon: 135.402967,
    source: "official_site_plus_google_maps",
    note: "Daigas公式資料の泉北天然ガス発電所情報と Google Maps exact query を照合。",
  },
  {
    area: "関西",
    name: "電源開発池原発電所（関西）",
    aliases: ["電源開発池原発電所", "池原発電所"],
    facilityType: "PS",
    address: "奈良県吉野郡下北山村下池原",
    lat: 34.038209,
    lon: 135.974097,
    source: "official_site_plus_google_maps",
    note: "J-POWER公式資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "関西",
    name: "酉島エネルギーセンター発電所",
    aliases: ["酉島エネルギーセンター"],
    facilityType: "PS",
    address: "大阪市此花区酉島6-19-9",
    lat: 34.679854,
    lon: 135.431443,
    source: "official_site_plus_google_maps",
    note: "公開企業資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "関西",
    name: "日本製鉄(株) 広畑発電所 第7号発電設備",
    aliases: ["日本製鉄 瀬戸内製鉄所広畑地区", "日本製鉄(株) 広畑地区"],
    facilityType: "PS",
    address: "兵庫県姫路市広畑区富士町1",
    lat: 34.773427,
    lon: 134.639071,
    source: "official_site_plus_google_maps",
    note: "日本製鉄 広畑地区の公開住所と Google Maps exact address query を照合。発電設備は製鉄所構内のため事業所所在地を採用。",
  },
  {
    area: "九州",
    name: "高野sws",
    aliases: ["高野系統開閉所", "九州電力送配電高野系統開閉所"],
    facilityType: "SWS",
    address: "宮崎県都城市高野町1295-4",
    lat: 31.7848578,
    lon: 130.9457244,
    source: "official_doc_plus_google_maps",
    note: "九州電力系公開資料の高野系統開閉所記載と Google Maps exact query を照合。",
  },
  {
    area: "九州",
    name: "三池発電所",
    aliases: ["三池火力発電所", "株式会社三池火力発電所"],
    facilityType: "PS",
    address: "福岡県大牟田市新港町1-57",
    lat: 33.008072,
    lon: 130.419626,
    source: "official_site_plus_google_maps",
    note: "株式会社三池火力発電所の公開所在地と Google Maps exact query を照合。",
  },
  {
    area: "九州",
    name: "ひびき灘石炭・バイオマス発電所",
    facilityType: "PS",
    address: "福岡県北九州市若松区向洋町10番",
    lat: 33.941627,
    lon: 130.790182,
    source: "official_site_plus_google_maps",
    note: "事業者公開資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "九州",
    name: "響灘火力発電所",
    aliases: ["株式会社響灘火力発電所"],
    facilityType: "PS",
    address: "福岡県北九州市若松区響町1丁目108-2",
    lat: 33.938808,
    lon: 130.824247,
    source: "official_site_plus_google_maps",
    note: "事業者公開資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "中部",
    name: "奥矢作発電所",
    aliases: ["奥矢作揚水発電所"],
    facilityType: "PS",
    address: "愛知県豊田市・岐阜県恵那市",
    lat: 35.211879,
    lon: 137.454208,
    source: "official_site_plus_google_maps",
    note: "中部電力公式資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "中部",
    name: "木曽発電所",
    aliases: ["関西電力㈱木曽発電所", "関西電力 木曽発電所"],
    facilityType: "PS",
    address: "長野県木曽郡木曽町福島殿1183-17",
    lat: 35.6925622,
    lon: 137.6685368,
    source: "official_site_plus_google_maps",
    note: "関西電力の木曽エリア公開情報と Google Maps exact query を照合。",
  },
  {
    area: "中部",
    name: "田原バイオマス発電所",
    facilityType: "PS",
    address: "愛知県田原市白浜二号4-8",
    lat: 34.701292,
    lon: 137.25626,
    source: "official_site_plus_google_maps",
    note: "事業者公式サイトの所在地と Google Maps exact query を照合。",
  },
  {
    area: "中部",
    name: "電源開発御母衣発電所",
    aliases: ["御母衣発電所", "電源開発株式会社 御母衣電力所"],
    facilityType: "PS",
    address: "岐阜県大野郡白川村牧",
    lat: 36.145811,
    lon: 136.908448,
    source: "official_site_plus_google_maps",
    note: "J-POWER公式資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "東京",
    name: "カナデビア株式会社茨城工場第一発電所",
    aliases: ["カナデビア（株）茨城工場 茨城第一発電所"],
    facilityType: "PS",
    address: "茨城県常陸大宮市工業団地4",
    lat: 36.539712,
    lon: 140.378259,
    source: "official_site_plus_google_maps",
    note: "カナデビア公式資料の設備情報と Google Maps exact query を照合。",
  },
  {
    area: "東京",
    name: "安曇発電所",
    facilityType: "PS",
    address: "長野県松本市安曇",
    lat: 36.132959,
    lon: 137.719787,
    source: "official_site_plus_google_maps",
    note: "東京電力リニューアブルパワー公式資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "東京",
    name: "塩原発電所",
    facilityType: "PS",
    address: "栃木県那須塩原市",
    lat: 36.973747,
    lon: 139.881286,
    source: "official_site_plus_google_maps",
    note: "東京電力リニューアブルパワー公式資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "東京",
    name: "葛野川発電所",
    facilityType: "PS",
    address: "山梨県大月市",
    lat: 35.713492,
    lon: 138.909425,
    source: "official_site_plus_google_maps",
    note: "東京電力リニューアブルパワー公式資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "東京",
    name: "玉原発電所",
    facilityType: "PS",
    address: "群馬県利根郡みなかみ町",
    lat: 36.789191,
    lon: 139.05086,
    source: "official_site_plus_google_maps",
    note: "東京電力リニューアブルパワー公式資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "東京",
    name: "新高瀬川発電所",
    aliases: ["東京電力リニューアブルパワー 新高瀬川発電所"],
    facilityType: "PS",
    address: "長野県大町市",
    lat: 36.483191,
    lon: 137.720002,
    source: "official_site_plus_google_maps",
    note: "東京電力リニューアブルパワー公式資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "東京",
    name: "神栖火力発電所",
    aliases: ["かみすパワー(株) 神栖火力発電所"],
    facilityType: "PS",
    address: "茨城県神栖市奥野谷6170-32",
    lat: 35.908299,
    lon: 140.703566,
    source: "official_site_plus_google_maps",
    note: "自治体公開資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "東京",
    name: "鈴川エネルギーセンター発電所",
    aliases: ["鈴川エネルギーセンター㈱"],
    facilityType: "PS",
    address: "静岡県富士市今井4-1-1",
    lat: 35.143563,
    lon: 138.714905,
    source: "official_site_plus_google_maps",
    note: "中部電力系公開資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "東京",
    name: "ゼロワットパワー株式会社　市原発電所",
    aliases: ["ゼロワットパワー株式会社 市原発電所", "ゼロワットパワー市原発電所"],
    facilityType: "PS",
    address: "千葉県市原市五井南海岸8-9",
    lat: 35.5237406,
    lon: 140.0451556,
    source: "official_site_plus_google_maps",
    note: "J-POWER とゼロワットパワーの公開資料にある市原発電所所在地と Google Maps exact address query を照合。",
  },
  {
    area: "東京",
    name: "横浜火力発電所８号系列１軸",
    aliases: ["横浜火力発電所", "JERA 横浜火力発電所"],
    facilityType: "PS",
    address: "神奈川県横浜市鶴見区大黒町11-1",
    lat: 35.4769577,
    lon: 139.6774088,
    source: "official_site_plus_google_maps",
    note: "JERA公開所在地と Google Maps exact query を照合。候補名は号系列だが公開位置は横浜火力発電所サイト座標を採用。",
  },
  {
    area: "東京",
    name: "根岸 ガス化複合発電所",
    aliases: ["ENEOS㈱ ガス化複合発電所", "ENEOS ガス化複合発電所"],
    facilityType: "PS",
    address: "神奈川県横浜市中区千鳥町3-1",
    lat: 35.4145421,
    lon: 139.6433973,
    source: "official_site_plus_google_maps",
    note: "根岸地区の公開資料と Google Maps exact query を照合。",
  },
  {
    area: "東京",
    name: "中袖クリーンパワー発電所",
    aliases: ["中袖クリーンパワー", "丸紅クリーンパワー中袖クリーンパワー"],
    facilityType: "PS",
    address: "千葉県袖ケ浦市中袖5-1",
    lat: 35.4508248,
    lon: 139.9784979,
    source: "official_site_plus_google_maps",
    note: "千葉県の公表資料にある中袖クリーンパワー所在地と Google Maps exact address query を照合。",
  },
  {
    area: "東北",
    name: "相馬共同火力発電株式会社新地火力発電所",
    aliases: ["相馬共同火力発電 新地発電所", "新地火力発電所"],
    facilityType: "PS",
    address: "福島県相馬郡新地町駒ヶ嶺字今神159-2",
    lat: 37.843892,
    lon: 140.945294,
    source: "official_site_plus_google_maps",
    note: "相馬共同火力発電公開資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "東北",
    name: "電源開発奥清津第二発電所",
    aliases: ["奥清津第二発電所"],
    facilityType: "PS",
    address: "新潟県南魚沼郡湯沢町",
    lat: 36.846733,
    lon: 138.766354,
    source: "official_site_plus_google_maps",
    note: "J-POWER公式資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "東北",
    name: "電源開発奥清津発電所",
    aliases: ["奥清津発電所"],
    facilityType: "PS",
    address: "新潟県南魚沼郡湯沢町",
    lat: 36.846142,
    lon: 138.766276,
    source: "official_site_plus_google_maps",
    note: "J-POWER公式資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "東北",
    name: "電源開発奥只見発電所",
    aliases: ["奥只見発電所"],
    facilityType: "PS",
    address: "新潟県魚沼市",
    lat: 37.244617,
    lon: 139.257703,
    source: "official_site_plus_google_maps",
    note: "J-POWER公式資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "東北",
    name: "電源開発下郷発電所",
    aliases: ["下郷発電所", "電源開発 下郷事務所"],
    facilityType: "PS",
    address: "福島県南会津郡下郷町",
    lat: 37.345349,
    lon: 139.908435,
    source: "official_site_plus_google_maps",
    note: "J-POWER公式資料の所在地と Google Maps exact query を照合。",
  },
  {
    area: "東北",
    name: "相馬石炭・バイオマス発電所",
    aliases: ["相馬エネルギーパーク", "相馬エネルギーパーク合同会社"],
    facilityType: "PS",
    address: "福島県相馬市光陽2丁目",
    lat: 37.8316316,
    lon: 140.9406578,
    source: "official_site_plus_google_maps",
    note: "相馬エネルギーパークの公開情報と Google Maps exact query を照合。",
  },
  {
    area: "東北",
    name: "日本製鉄(株) 釜石火力発電所",
    aliases: ["日本製鉄㈱ 北日本製鉄所釜石地区", "日本製鉄(株) 釜石地区"],
    facilityType: "PS",
    address: "岩手県釜石市鈴子町23-15",
    lat: 39.2717266,
    lon: 141.8693912,
    source: "official_site_plus_google_maps",
    note: "日本製鉄 釜石地区の公開住所と Google Maps exact address query を照合。発電設備は製鉄所構内のため事業所所在地を採用。",
  },
];

const PROPAGATIONS: PropagationSeed[] = [
  {
    area: "東京",
    name: "姉崎火力発電所新３号機",
    aliases: ["姉崎火力発電所"],
    facilityType: "PS",
    fromName: "姉崎火力発電所",
    address: "東京エリア内（既存サイト座標展開）",
    note: "既存設備 姉崎火力発電所 の座標を号機レコードへ展開。",
  },
  {
    area: "東京",
    name: "電源開発磯子火力発電所新２号機",
    aliases: ["電源開発磯子火力発電所"],
    facilityType: "PS",
    fromName: "電源開発磯子火力発電所",
    address: "東京エリア内（既存サイト座標展開）",
    note: "既存設備 電源開発磯子火力発電所 の座標を号機レコードへ展開。",
  },
];

async function main(): Promise<void> {
  const db = await readDb();
  const now = new Date().toISOString();
  const existingKeys = new Set(db.records.map((record) => buildKey(record.area, record.name)));

  const additions: StationDbRecord[] = [];

  for (const seed of CURATED_ADDITIONS) {
    const key = buildKey(seed.area, seed.name);
    if (existingKeys.has(key)) continue;
    additions.push(materializeSeed(seed, now));
    existingKeys.add(key);
  }

  for (const seed of PROPAGATIONS) {
    const key = buildKey(seed.area, seed.name);
    if (existingKeys.has(key)) continue;
    const sourceRecord = db.records.find((record) => record.area === seed.area && record.name === seed.fromName);
    if (!sourceRecord) {
      throw new Error(`Propagation source not found: ${seed.area} / ${seed.fromName}`);
    }
    additions.push({
      area: seed.area,
      name: seed.name,
      aliases: dedupeStrings([seed.name, ...(seed.aliases ?? []), sourceRecord.name]),
      facilityType: seed.facilityType,
      address: seed.address,
      lat: sourceRecord.lat,
      lon: sourceRecord.lon,
      source: "propagated_from_verified_plant",
      confidence: "medium",
      verifiedBy: "curated-geocode-script",
      verifiedAt: now,
      note: seed.note,
    });
    existingKeys.add(key);
  }

  const merged = [...db.records, ...additions].sort((a, b) =>
    a.area === b.area ? a.name.localeCompare(b.name, "ja-JP") : a.area.localeCompare(b.area, "ja-JP"),
  );

  if (additions.length > 0) {
    await fs.writeFile(
      DB_PATH,
      JSON.stringify(
        {
          version: (db.version ?? 1) + 1,
          updatedAt: now,
          records: merged,
        } satisfies StationDb,
        null,
        2,
      ),
      "utf8",
    );
  }

  console.log(`[fill-db-curated] appended=${additions.length} total_db=${merged.length}`);
  for (const record of additions) {
    console.log(`[fill-db-curated] + ${record.area} ${record.name}`);
  }
}

function materializeSeed(seed: CuratedSeed, verifiedAt: string): StationDbRecord {
  return {
    area: seed.area,
    name: seed.name,
    aliases: dedupeStrings([seed.name, ...(seed.aliases ?? [])]),
    facilityType: seed.facilityType,
    address: seed.address,
    lat: seed.lat,
    lon: seed.lon,
    source: seed.source,
    confidence: "medium",
    verifiedBy: "curated-geocode-script",
    verifiedAt,
    note: seed.note,
  };
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function buildKey(area: string, name: string): string {
  return `${area}::${name}`;
}

async function readDb(): Promise<StationDb> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StationDb>;
    return {
      version: parsed.version ?? 1,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      records: parsed.records ?? [],
    };
  } catch {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      records: [],
    };
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
