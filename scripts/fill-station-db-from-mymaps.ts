import { inflateRawSync } from "node:zlib";
import { promises as fs } from "node:fs";
import path from "node:path";

type FacilityType = "SS" | "CS" | "PS" | "SWS" | "UNKNOWN";

type CandidateRecord = {
  area: string;
  name: string;
  aliases?: string[];
  facilityType: FacilityType;
  query: string;
  reason: string;
};

type CandidateFile = {
  generatedAt: string;
  records: CandidateRecord[];
};

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

type AreaMap = {
  area: string;
  title: string;
  mid: string;
};

type Placemark = {
  mapTitle: string;
  area: string;
  rawName: string;
  name: string;
  facilityType: FacilityType;
  lat: number;
  lon: number;
};

type MatchReport = {
  area: string;
  candidateName: string;
  facilityType: FacilityType;
  lat: number;
  lon: number;
  placemarkNames: string[];
  sourceMaps: string[];
};

const ROOT = process.cwd();
const CANDIDATE_PATH = path.join(ROOT, "data", "master", "station-location-candidates.json");
const DB_PATH = path.join(ROOT, "data", "master", "station-location-db.json");
const MATCH_REPORT_PATH = path.join(ROOT, "data", "master", "station-location-mymaps-matches.json");

const AREA_MAPS: AreaMap[] = [
  { area: "北海道", title: "北海道電力ネットワーク 送電系統図", mid: "1-HmH4N-Sw8i7Zr4odr7Uz_W0MjGO0BgZ" },
  { area: "東北", title: "東北電力ネットワーク 送電系統図", mid: "1IZlDZ1-FatJ_OBtMOVDdyOp5GrZGbeYs" },
  { area: "東京", title: "東京電力パワーグリッド 送電系統図", mid: "1Aa-mVinaIXmiPeR_FFpVLQTY2DDLv9WJ" },
  { area: "中部", title: "中部電力パワーグリッド 送電系統図", mid: "1u4WAJjuiRc__mltTVwXehQkkSfj-9ujy" },
  { area: "北陸", title: "北陸電力送配電 送電系統図", mid: "1NsLRsBX-r9WS1HZisoGepwN7aJU5cX4k" },
  { area: "関西", title: "関西電力送配電 送電系統図", mid: "1jWMeIYB9-5Bymo5GLGBWCBAOn5hPuZ-U" },
  { area: "中国", title: "中国電力ネットワーク 送電系統図", mid: "1-3RN2gOHR-xJhA1PimqqB1AmhBXojPM" },
  { area: "四国", title: "四国電力送配電 送電系統図", mid: "1hLz4bKdtb80by2jYCyJqVAPwlT_pgHBO" },
  { area: "九州", title: "九州電力送配電 送電系統図", mid: "178moQmYZbeUmPt-0WIWIz6OAuej36uDZ" },
  { area: "沖縄", title: "沖縄電力 送電系統図", mid: "1wAQiwmIi1ur2BhmWQ85ExlnHZpDDPUA" },
];

async function main(): Promise<void> {
  const candidates = JSON.parse(await fs.readFile(CANDIDATE_PATH, "utf8")) as CandidateFile;
  const db = await readDb();
  const existingKeys = new Set(db.records.map((r) => buildKey(r.area, canonicalizeForMatch(r.name))));
  const candidateAreas = new Set(candidates.records.map((r) => r.area));
  const mymapsIndex = await buildPlacemarkIndex(candidateAreas);

  const appended: StationDbRecord[] = [];
  const stillUnmatched: CandidateRecord[] = [];
  const reports: MatchReport[] = [];
  const now = new Date().toISOString();

  for (const candidate of candidates.records) {
    const key = buildKey(candidate.area, canonicalizeForMatch(candidate.name));
    if (existingKeys.has(key)) {
      continue;
    }

    const matches = findPlacemarkMatches(candidate, mymapsIndex);
    if (matches.length === 0) {
      stillUnmatched.push(candidate);
      continue;
    }

    const averaged = averageCoordinates(matches);
    const placemarkNames = dedupeStrings(matches.map((match) => match.rawName));
    const sourceMaps = dedupeStrings(matches.map((match) => match.mapTitle));

    appended.push({
      area: candidate.area,
      name: candidate.name,
      aliases: dedupeStrings([candidate.name, ...(candidate.aliases ?? []), ...placemarkNames]),
      facilityType: candidate.facilityType,
      address: `${candidate.area}エリア内（Google My Maps exact label match）`,
      lat: averaged.lat,
      lon: averaged.lon,
      source: "google_mymaps_exact_match",
      confidence: "medium",
      verifiedBy: "mymaps-import-script",
      verifiedAt: now,
      note: `Google My Maps KMZ の設備名一致: ${placemarkNames.join(" / ")} (${sourceMaps.join(" / ")})`,
    });

    reports.push({
      area: candidate.area,
      candidateName: candidate.name,
      facilityType: candidate.facilityType,
      lat: averaged.lat,
      lon: averaged.lon,
      placemarkNames,
      sourceMaps,
    });
    existingKeys.add(key);
  }

  const merged = [...db.records, ...appended].sort((a, b) =>
    a.area === b.area ? a.name.localeCompare(b.name, "ja-JP") : a.area.localeCompare(b.area, "ja-JP"),
  );

  if (appended.length > 0) {
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

  await fs.writeFile(
    CANDIDATE_PATH,
    JSON.stringify(
      {
        generatedAt: now,
        records: stillUnmatched,
      } satisfies CandidateFile,
      null,
      2,
    ),
    "utf8",
  );

  await fs.writeFile(
    MATCH_REPORT_PATH,
    JSON.stringify(
      {
        generatedAt: now,
        appendedCount: appended.length,
        matches: reports,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`[fill-db-mymaps] appended=${appended.length} total_db=${merged.length} unmatched=${stillUnmatched.length}`);
  console.log(`[fill-db-mymaps] wrote_report=${MATCH_REPORT_PATH}`);
}

async function buildPlacemarkIndex(candidateAreas: Set<string>): Promise<Map<string, Placemark[]>> {
  const index = new Map<string, Placemark[]>();
  for (const areaMap of AREA_MAPS) {
    if (!candidateAreas.has(areaMap.area)) continue;
    let kml: string;
    try {
      const payload = await downloadMapPayload(areaMap.mid);
      kml = extractKmlFromGoogleMapDownload(payload);
    } catch (error) {
      console.warn(`[fill-db-mymaps] skipped_map area=${areaMap.area} mid=${areaMap.mid} reason=${formatError(error)}`);
      continue;
    }
    const placemarks = parsePointPlacemarks(kml, areaMap);
    for (const placemark of placemarks) {
      const key = buildKey(placemark.area, canonicalizeForMatch(placemark.name));
      if (!key.endsWith("::")) {
        const bucket = index.get(key) ?? [];
        bucket.push(placemark);
        index.set(key, bucket);
      }
    }
  }
  return index;
}

async function downloadMapPayload(mid: string): Promise<Buffer> {
  const response = await fetch(`https://www.google.com/maps/d/kml?mid=${mid}`, {
    headers: {
      "User-Agent": "Codex/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to download KMZ for ${mid}: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function extractKmlFromGoogleMapDownload(buffer: Buffer): string {
  const prefix = buffer.subarray(0, Math.min(buffer.length, 256)).toString("utf8").trimStart();
  if (prefix.startsWith("<?xml") || prefix.startsWith("<kml")) {
    return buffer.toString("utf8");
  }
  if (prefix.startsWith("<html") || prefix.includes("<title>Error")) {
    throw new Error("received HTML error page instead of KML/KMZ");
  }
  return extractDocKmlFromKmz(buffer);
}

function extractDocKmlFromKmz(buffer: Buffer): string {
  let offset = 0;
  while (offset + 46 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== 0x02014b50) {
      offset += 1;
      continue;
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const filename = buffer.toString("utf8", offset + 46, offset + 46 + filenameLength);

    if (filename === "doc.kml") {
      const localFilenameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFilenameLength + localExtraLength;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

      if (compressionMethod === 0) {
        return compressed.toString("utf8");
      }
      if (compressionMethod === 8) {
        return inflateRawSync(compressed).toString("utf8");
      }
      throw new Error(`Unsupported KMZ compression method: ${compressionMethod}`);
    }

    offset += 46 + filenameLength + extraLength + commentLength;
  }
  throw new Error("doc.kml not found in KMZ");
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function parsePointPlacemarks(kml: string, areaMap: AreaMap): Placemark[] {
  const placemarks: Placemark[] = [];
  const blocks = kml.match(/<Placemark\b[\s\S]*?<\/Placemark>/g) ?? [];
  for (const block of blocks) {
    const rawName = extractTag(block, "name");
    const coordinateText = block.match(/<Point>\s*<coordinates>\s*([^<]+)\s*<\/coordinates>\s*<\/Point>/)?.[1];
    if (!rawName || !coordinateText) continue;

    const name = deriveFacilityName(rawName);
    if (!name) continue;

    const [lonText, latText] = coordinateText.split(",").map((value) => value.trim());
    const lat = Number(latText);
    const lon = Number(lonText);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    placemarks.push({
      mapTitle: areaMap.title,
      area: areaMap.area,
      rawName: decodeXml(rawName).replace(/\u00a0/g, " ").trim(),
      name,
      facilityType: inferFacilityType(name),
      lat,
      lon,
    });
  }
  return placemarks;
}

function extractTag(block: string, tagName: string): string | null {
  return block.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`))?.[1] ?? null;
}

function deriveFacilityName(rawName: string): string | null {
  const decoded = decodeXml(rawName).replace(/\u00a0/g, " ").trim();
  const parts = decoded
    .split("_")
    .map((part) => part.trim())
    .filter(Boolean);
  const facilityPart = parts.find((part) => /(発電所|発電設備|変電所|開閉所|変換所|ss|ps|cs|sws)/i.test(part));
  const base = (facilityPart ?? decoded)
    .replace(
      /^(?:北海道電力ネットワーク|東北電力ネットワーク|東京電力パワーグリッド|中部電力パワーグリッド|北陸電力送配電|関西電力送配電|中国電力ネットワーク|四国電力送配電|九州電力送配電|沖縄電力|北海道電力|東北電力|東京電力|中部電力|北陸電力|関西電力|中国電力|四国電力|九州電力|電源開発|J-POWER|JPOWER|中山共同発電|日本製鉄株式会社|日本製鉄\(株\)|日本製鉄|相生バイオエナジー)\s+/u,
      "",
    )
    .trim();

  if (!/(発電所|発電設備|変電所|開閉所|変換所|ss|ps|cs|sws)/i.test(base)) {
    return null;
  }
  return base;
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

function inferFacilityType(name: string): FacilityType {
  const lower = name.toLowerCase();
  if (name.includes("発電設備") || name.includes("発電所") || /ps$/.test(lower)) return "PS";
  if (name.includes("変換所") || /cs$/.test(lower)) return "CS";
  if (name.includes("開閉所") || /sws$/.test(lower)) return "SWS";
  if (name.includes("変電所") || /ss$/.test(lower)) return "SS";
  return "UNKNOWN";
}

function findPlacemarkMatches(candidate: CandidateRecord, index: Map<string, Placemark[]>): Placemark[] {
  const keys = dedupeStrings([candidate.name, ...(candidate.aliases ?? [])]).map((name) =>
    buildKey(candidate.area, canonicalizeForMatch(name)),
  );
  const matches = keys.flatMap((key) => index.get(key) ?? []);
  return dedupePlacemarks(matches).filter((match) => facilityTypesCompatible(candidate.facilityType, match.facilityType));
}

function facilityTypesCompatible(candidateType: FacilityType, placemarkType: FacilityType): boolean {
  if (candidateType === placemarkType) return true;
  return candidateType === "PS" && placemarkType === "PS";
}

function averageCoordinates(matches: Placemark[]): { lat: number; lon: number } {
  const lat = matches.reduce((sum, match) => sum + match.lat, 0) / matches.length;
  const lon = matches.reduce((sum, match) => sum + match.lon, 0) / matches.length;
  return {
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
  };
}

function dedupePlacemarks(matches: Placemark[]): Placemark[] {
  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = `${match.rawName}::${match.lat}::${match.lon}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalizeForMatch(name: string): string {
  return name
    .trim()
    .normalize("NFKC")
    .replace(/\u00a0/g, "")
    .replace(/\s+/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(
      /^(?:北海道電力ネットワーク|東北電力ネットワーク|東京電力パワーグリッド|中部電力パワーグリッド|北陸電力送配電|関西電力送配電|中国電力ネットワーク|四国電力送配電|九州電力送配電|北海道電力|東北電力|東京電力|中部電力|北陸電力|関西電力|中国電力|四国電力|九州電力|電源開発|J-POWER|JPOWER|中山共同発電|日本製鉄株式会社|日本製鉄\(株\)|日本製鉄|相生バイオエナジー)/u,
      "",
    )
    .replace(/[_-]/g, "")
    .replace(/発電設備|変電所|開閉所|変換所|発電所|SS|SWS|CS|PS/gi, "");
}

function buildKey(area: string, canonicalName: string): string {
  return `${area}::${canonicalName}`;
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
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
