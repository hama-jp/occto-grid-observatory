import { promises as fs } from "node:fs";
import path from "node:path";

type DashboardLatest = {
  flows?: { lineSeries?: Array<{ area: string; positiveDirection: string }> };
  generation?: { plantSummaries?: Array<{ area: string; plantName: string }> };
};

type FacilityType = "SS" | "CS" | "PS" | "SWS" | "UNKNOWN";

type StationLocationRecord = {
  area: string;
  name: string;
  aliases?: string[];
  facilityType: FacilityType;
  address: string;
  lat: number;
  lon: number;
  source: string;
  confidence: "high" | "medium";
  verifiedBy: string;
  verifiedAt: string;
  note?: string;
};

type StationLocationDb = {
  version: number;
  updatedAt: string;
  records: StationLocationRecord[];
};

type CandidateRecord = {
  area: string;
  name: string;
  aliases: string[];
  facilityType: FacilityType;
  query: string;
  reason: string;
};

const ROOT = process.cwd();
const DASHBOARD_LATEST_PATH = path.join(ROOT, "data", "normalized", "dashboard-latest.json");
const DB_PATH = path.join(ROOT, "data", "master", "station-location-db.json");
const CANDIDATE_PATH = path.join(ROOT, "data", "master", "station-location-candidates.json");

async function main(): Promise<void> {
  const latest = JSON.parse(await fs.readFile(DASHBOARD_LATEST_PATH, "utf-8")) as DashboardLatest;
  const existing = await readDb();

  const discovered = discoverFacilities(latest);
  const dbIndex = new Set(existing.records.map((r) => buildKey(r.area, normalizeName(r.name))));

  const unresolved: CandidateRecord[] = discovered
    .filter((facility) => facility.type !== "UNKNOWN")
    .filter((facility) => !dbIndex.has(buildKey(facility.area, normalizeName(facility.name))))
    .map((facility) => ({
      area: facility.area,
      name: facility.name,
      aliases: [facility.name],
      facilityType: facility.type,
      query: buildManualQuery(facility.name, facility.area, facility.type),
      reason: "db_missing_verified_coordinate",
    }))
    .sort((a, b) => (a.area === b.area ? a.name.localeCompare(b.name, "ja-JP") : a.area.localeCompare(b.area, "ja-JP")));

  await fs.writeFile(CANDIDATE_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), records: unresolved }, null, 2));

  const byType = summarizeByType(unresolved);
  console.log(`[geocode-db] verified_records=${existing.records.length}`);
  console.log(`[geocode-db] unresolved_records=${unresolved.length}`);
  console.log(`[geocode-db] unresolved_by_type SS=${byType.SS} CS=${byType.CS} SWS=${byType.SWS} PS=${byType.PS} UNKNOWN=${byType.UNKNOWN}`);
  console.log(`[geocode-db] wrote_candidates=${CANDIDATE_PATH}`);
}

async function readDb(): Promise<StationLocationDb> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf-8");
    const parsed = JSON.parse(raw) as StationLocationDb;
    return {
      ...parsed,
      records: (parsed.records ?? []).filter((record) => record.confidence === "high" || record.confidence === "medium"),
    };
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), records: [] };
  }
}

function discoverFacilities(latest: DashboardLatest): Array<{ area: string; name: string; type: FacilityType }> {
  const rows = new Map<string, { area: string; name: string; type: FacilityType }>();
  for (const line of latest.flows?.lineSeries ?? []) {
    const parsed = parseDirection(line.positiveDirection);
    if (!parsed) continue;
    for (const station of [parsed.source, parsed.target]) {
      if (!station || isAreaToken(station) || !isLikelyFacilityName(station)) continue;
      const key = buildKey(line.area, normalizeName(station));
      rows.set(key, { area: line.area, name: station, type: inferFacilityType(station) });
    }
  }

  for (const plant of latest.generation?.plantSummaries ?? []) {
    if (!isLikelyFacilityName(plant.plantName)) continue;
    const key = buildKey(plant.area, normalizeName(plant.plantName));
    rows.set(key, { area: plant.area, name: plant.plantName, type: "PS" });
  }

  return Array.from(rows.values());
}

function parseDirection(rawDirection: string): { source: string; target: string } | null {
  const parts = rawDirection.replace(/\s+/g, " ").trim().split(/\s*(?:→|⇒|⇢|->|＞)\s*/);
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  return { source: parts[0].trim(), target: parts[1].trim() };
}

function inferFacilityType(name: string): FacilityType {
  const lower = name.toLowerCase();
  if (name.includes("発電所") || /ps$/.test(lower)) return "PS";
  if (name.includes("変換所") || /cs$/.test(lower)) return "CS";
  if (name.includes("開閉所") || /sws$/.test(lower)) return "SWS";
  if (name.includes("変電所") || /ss$/.test(lower)) return "SS";
  return "UNKNOWN";
}

function isCompositeFacilityName(name: string): boolean {
  const compact = name.trim().replace(/\s+/g, "");
  if (!/[・,，、\/／]/.test(compact)) return false;
  const matches = compact.match(/(変電所|開閉所|変換所|発電所|SS|PS|CS|SWS)/gi) ?? [];
  return matches.length >= 2;
}

function isLikelyFacilityName(name: string): boolean {
  const compact = name.trim().replace(/\s+/g, "").normalize("NFKC");
  if (!compact) return false;
  if (/[0-9]+T(?:[（(].*)?$/i.test(compact)) return false;
  if (["電名", "分岐点"].includes(compact)) return false;
  if (isCompositeFacilityName(compact)) return false;
  if (/(?:泉南東大阪線|北大阪線|北神線|幹線|連系線)$/.test(compact)) return false;
  if (compact.endsWith("線") && !/(発電所|変電所|開閉所|変換所|SS|PS|CS|SWS)$/i.test(compact)) return false;
  return true;
}

function normalizeName(name: string): string {
  return name
    .trim()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/第?[0-9]+号(?:機|系列)?/g, "")
    .replace(/[0-9]+(?:号機|号系列|系列|軸)/g, "")
    .replace(/新[0-9]+号機/g, "")
    .replace(/変電所|開閉所|変換所|発電所|火力|幹線|連系線|SS|SWS|CS|PS/gi, "");
}

function buildKey(area: string, normalizedName: string): string {
  return `${area}::${normalizedName}`;
}

function buildManualQuery(name: string, area: string, type: FacilityType): string {
  const kind = type === "CS" ? "変換所" : type === "SWS" ? "開閉所" : type === "PS" ? "発電所" : "変電所";
  return `${name} ${area} ${kind} 日本`;
}

function isAreaToken(station: string): boolean {
  const token = station.trim().replace(/\s+/g, "").replace(/エリア/g, "");
  return new Set(["北海道", "東北", "東京", "中部", "北陸", "関西", "中国", "四国", "九州", "沖縄"]).has(token);
}

function summarizeByType(rows: CandidateRecord[]): Record<FacilityType, number> {
  return rows.reduce(
    (acc, row) => {
      acc[row.facilityType] += 1;
      return acc;
    },
    { SS: 0, CS: 0, PS: 0, SWS: 0, UNKNOWN: 0 },
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
