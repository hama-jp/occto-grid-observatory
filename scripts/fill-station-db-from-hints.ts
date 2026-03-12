import { promises as fs } from "node:fs";
import path from "node:path";

type FacilityType = "SS" | "CS" | "PS" | "SWS" | "UNKNOWN";

type CandidateFile = {
  generatedAt: string;
  records: Array<{
    area: string;
    name: string;
    aliases?: string[];
    facilityType: FacilityType;
    query: string;
    reason: string;
  }>;
};

type Hint = { keyword: string; lat: number; lon: number };

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

const ROOT = process.cwd();
const DASHBOARD_APP = path.join(ROOT, "src", "components", "dashboard-app.tsx");
const CANDIDATE_PATH = path.join(ROOT, "data", "master", "station-location-candidates.json");
const DB_PATH = path.join(ROOT, "data", "master", "station-location-db.json");

async function main(): Promise<void> {
  const source = await fs.readFile(DASHBOARD_APP, "utf8");
  const stationHints = parseHintsByArea(source, "STATION_GEO_HINTS_BY_AREA");
  const plantHints = parseHintsByArea(source, "PLANT_GEO_HINTS_BY_AREA");

  const candidates = JSON.parse(await fs.readFile(CANDIDATE_PATH, "utf8")) as CandidateFile;
  const existingDb = await readDb();
  const existingKeys = new Set(existingDb.records.map((r) => `${r.area}::${normalize(r.name)}`));

  const byAreaCanonical = buildAreaCanonicalIndex(existingDb.records);
  const byGlobalCanonical = buildGlobalCanonicalIndex(existingDb.records);

  const appended: StationDbRecord[] = [];
  const stillUnmatched: CandidateFile["records"] = [];

  for (const row of candidates.records) {
    const key = `${row.area}::${normalize(row.name)}`;
    if (existingKeys.has(key)) {
      continue;
    }

    const hintMatch = matchByHints(row, stationHints, plantHints);
    if (hintMatch) {
      appended.push({
        area: row.area,
        name: row.name,
        aliases: dedupeAliases([row.name, ...(row.aliases ?? [])]),
        facilityType: row.facilityType,
        address: `${row.area}エリア内（キーワード照合）`,
        lat: hintMatch.lat,
        lon: hintMatch.lon,
        source: "legacy_area_keyword_hint",
        confidence: "medium",
        verifiedBy: "hint-migration-script",
        verifiedAt: new Date().toISOString(),
        note: `dashboard-app.tsx のヒント keyword=${hintMatch.keyword} から抽出。`,
      });
      existingKeys.add(key);
      continue;
    }

    const propagated = propagateFromExisting(row, byAreaCanonical[row.area] ?? [], byGlobalCanonical);
    if (propagated) {
      appended.push(propagated);
      existingKeys.add(key);
      continue;
    }

    stillUnmatched.push(row);
  }

  const merged = [...existingDb.records, ...appended].sort((a, b) =>
    a.area === b.area ? a.name.localeCompare(b.name, "ja-JP") : a.area.localeCompare(b.area, "ja-JP"),
  );

  const dbChanged = appended.length > 0;
  if (dbChanged) {
    await fs.writeFile(
      DB_PATH,
      JSON.stringify(
        {
          version: Math.max(4, existingDb.version ?? 1),
          updatedAt: new Date().toISOString(),
          records: merged,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  const candidateChanged =
    stillUnmatched.length !== candidates.records.length ||
    stillUnmatched.some((record, index) => record.area !== candidates.records[index]?.area || record.name !== candidates.records[index]?.name);

  if (candidateChanged) {
    await fs.writeFile(
      CANDIDATE_PATH,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          records: stillUnmatched,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  console.log(
    `[fill-db] appended=${appended.length} total_db=${merged.length} unmatched=${stillUnmatched.length} db_changed=${dbChanged} candidates_changed=${candidateChanged}`,
  );
}

function matchByHints(
  row: CandidateFile["records"][number],
  stationHints: Record<string, Hint[]>,
  plantHints: Record<string, Hint[]>,
): Hint | null {
  const normalizedName = normalize(row.name);
  const pool = [...(stationHints[row.area] ?? []), ...(plantHints[row.area] ?? [])];
  let best: Hint | null = null;
  for (const hint of pool) {
    const keyword = normalize(hint.keyword);
    if (!keyword || !normalizedName.includes(keyword)) continue;
    if (!best || keyword.length > normalize(best.keyword).length) {
      best = hint;
    }
  }
  return best;
}

function buildAreaCanonicalIndex(records: StationDbRecord[]): Record<string, Array<{ key: string; record: StationDbRecord }>> {
  const index: Record<string, Array<{ key: string; record: StationDbRecord }>> = {};
  for (const record of records) {
    const arr = index[record.area] ?? [];
    arr.push({ key: canonicalize(record.name), record });
    index[record.area] = arr;
  }
  return index;
}


function buildGlobalCanonicalIndex(records: StationDbRecord[]): Record<string, StationDbRecord[]> {
  const index: Record<string, StationDbRecord[]> = {};
  for (const record of records) {
    const key = canonicalize(record.name);
    if (!key) continue;
    const arr = index[key] ?? [];
    arr.push(record);
    index[key] = arr;
  }
  return index;
}

function propagateFromExisting(
  row: CandidateFile["records"][number],
  areaRecords: Array<{ key: string; record: StationDbRecord }>,
  globalIndex: Record<string, StationDbRecord[]>,
): StationDbRecord | null {
  if (row.facilityType !== "PS") {
    return null;
  }
  const target = canonicalize(row.name);
  if (!target) {
    return null;
  }

  let best: { key: string; record: StationDbRecord } | null = null;
  for (const entry of areaRecords) {
    if (!entry.key) continue;
    if (!(target.includes(entry.key) || entry.key.includes(target))) continue;
    if (!best || entry.key.length > best.key.length) {
      best = entry;
    }
  }

  if (!best) {
    const globalMatches = globalIndex[target] ?? [];
    if (globalMatches.length === 1) {
      best = { key: target, record: globalMatches[0] };
    }
  }

  if (!best) {
    return null;
  }

  return {
    area: row.area,
    name: row.name,
    aliases: dedupeAliases([row.name, ...(row.aliases ?? []), best.record.name]),
    facilityType: row.facilityType,
    address: `${row.area}エリア内（既存発電所座標の号機展開）`,
    lat: best.record.lat,
    lon: best.record.lon,
    source: "propagated_from_verified_plant",
    confidence: "medium",
    verifiedBy: "plant-unit-propagation",
    verifiedAt: new Date().toISOString(),
    note: `既存設備 ${best.record.name} の座標を号機名 ${row.name} に展開。`,
  };
}

async function readDb(): Promise<{ version: number; records: StationDbRecord[] }> {
  try {
    const parsed = JSON.parse(await fs.readFile(DB_PATH, "utf8")) as { version?: number; records?: StationDbRecord[] };
    return { version: parsed.version ?? 1, records: parsed.records ?? [] };
  } catch {
    return { version: 1, records: [] };
  }
}

function parseHintsByArea(source: string, constName: string): Record<string, Hint[]> {
  const startToken = `const ${constName}`;
  const start = source.indexOf(startToken);
  if (start < 0) return {};

  const begin = source.indexOf("{", start);
  const end = source.indexOf("};", begin);
  const block = source.slice(begin + 1, end);
  const lines = block.split("\n");

  const result: Record<string, Hint[]> = {};
  let currentArea: string | null = null;
  for (const line of lines) {
    const areaMatch = line.match(/^\s*([\p{Script=Han}ぁ-んァ-ヶーA-Za-z]+):\s*\[/u);
    if (areaMatch) {
      currentArea = areaMatch[1];
      if (!result[currentArea]) result[currentArea] = [];
      continue;
    }
    if (line.includes("],")) {
      currentArea = null;
      continue;
    }
    if (!currentArea) continue;

    const hintMatch = line.match(/\{\s*keyword:\s*"([^"]+)",\s*lat:\s*([\d.-]+),\s*lon:\s*([\d.-]+)\s*\}/);
    if (!hintMatch) continue;

    result[currentArea].push({
      keyword: hintMatch[1],
      lat: Number(hintMatch[2]),
      lon: Number(hintMatch[3]),
    });
  }

  return result;
}

function normalize(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/変電所|開閉所|変換所|発電所|火力|幹線|連系線|SS|SWS|CS|PS/gi, "");
}

function canonicalize(name: string): string {
  return normalize(name)
    .replace(/[0-9０-９]+号?機?/g, "")
    .replace(/[A-Za-zＡ-Ｚａ-ｚ]+$/g, "")
    .replace(/第[一二三四五六七八九十]+/g, "")
    .replace(/^(電源開発|日本製鉄|JERA|関西電力|東京電力|中部電力|中国電力|東北電力|北海道電力|四国電力|九州電力)/, "")
    .replace(/[\(（].*[\)）]/g, "")
    .trim();
}

function dedupeAliases(aliases: string[]): string[] {
  return Array.from(new Set(aliases.map((a) => a.trim()).filter(Boolean)));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
