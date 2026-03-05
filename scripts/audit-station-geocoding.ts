import { promises as fs } from "node:fs";
import path from "node:path";

type FlowLine = {
  area: string;
  positiveDirection: string;
};

type StationEntry = {
  area: string;
  station: string;
  stationNormalized: string;
  query: string;
};

type NominatimResult = {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  category?: string;
};

type CacheRecord = {
  fetchedAt: string;
  query: string;
  results: NominatimResult[];
};

type AuditRow = {
  area: string;
  station: string;
  stationNormalized: string;
  query: string;
  confidence: "high" | "medium" | "low" | "none";
  score: number;
  lat: number | null;
  lon: number | null;
  displayName: string;
  reason: string;
  resultCount: number;
};

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const CACHE_PATH = path.join(process.cwd(), "data", "normalized", "station-geocode-cache.json");

async function main(): Promise<void> {
  const refresh = process.argv.includes("--refresh");
  const latestPath = path.join(process.cwd(), "data", "normalized", "dashboard-latest.json");
  const raw = await fs.readFile(latestPath, "utf-8");
  const parsed = JSON.parse(raw) as {
    meta: { targetDate: string };
    flows: { lineSeries: FlowLine[] };
  };

  const stations = extractStations(parsed.flows.lineSeries);
  const cache = refresh ? {} : await readCache();

  const rows: AuditRow[] = [];
  let fetchedCount = 0;
  for (const entry of stations) {
    const key = `${entry.area}::${entry.station}`;
    let cached = cache[key];
    if (!cached) {
      const results = await searchNominatim(entry.query);
      cached = {
        fetchedAt: new Date().toISOString(),
        query: entry.query,
        results,
      };
      cache[key] = cached;
      fetchedCount += 1;
      await sleep(1100);
    }

    const evaluated = evaluateCandidates(entry, cached.results);
    rows.push({
      area: entry.area,
      station: entry.station,
      stationNormalized: entry.stationNormalized,
      query: entry.query,
      confidence: evaluated.confidence,
      score: roundTo(evaluated.score, 3),
      lat: evaluated.lat,
      lon: evaluated.lon,
      displayName: evaluated.displayName,
      reason: evaluated.reason,
      resultCount: cached.results.length,
    });
  }

  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");

  const dateStamp = parsed.meta.targetDate.replaceAll("/", "");
  const outDir = path.join(process.cwd(), "data", "normalized");
  const jsonPath = path.join(outDir, `station-geo-audit-${dateStamp}.json`);
  const csvPath = path.join(outDir, `station-geo-audit-${dateStamp}.csv`);

  rows.sort((a, b) => {
    if (a.confidence === b.confidence) {
      if (a.area === b.area) {
        return a.station.localeCompare(b.station, "ja-JP");
      }
      return a.area.localeCompare(b.area, "ja-JP");
    }
    return confidenceRank(a.confidence) - confidenceRank(b.confidence);
  });

  await fs.writeFile(jsonPath, JSON.stringify(rows, null, 2), "utf-8");
  await fs.writeFile(csvPath, toCsv(rows), "utf-8");

  const summary = rows.reduce(
    (acc, row) => {
      acc[row.confidence] += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0, none: 0 },
  );

  console.log(`[audit] stations=${rows.length}, fetched=${fetchedCount}, cache=${rows.length - fetchedCount}`);
  console.log(
    `[audit] confidence high=${summary.high}, medium=${summary.medium}, low=${summary.low}, none=${summary.none}`,
  );
  console.log(`[audit] json=${jsonPath}`);
  console.log(`[audit] csv=${csvPath}`);
}

function extractStations(lineSeries: FlowLine[]): StationEntry[] {
  const areaStation = new Map<string, Set<string>>();
  for (const line of lineSeries) {
    const direction = parseDirection(line.positiveDirection);
    if (!direction) {
      continue;
    }
    const set = areaStation.get(line.area) ?? new Set<string>();
    if (!isAreaToken(direction.source)) {
      set.add(direction.source);
    }
    if (!isAreaToken(direction.target)) {
      set.add(direction.target);
    }
    areaStation.set(line.area, set);
  }

  const rows: StationEntry[] = [];
  for (const [area, stations] of areaStation.entries()) {
    for (const station of stations.values()) {
      const normalized = normalizeStationName(station);
      const query = buildQuery(area, station);
      rows.push({
        area,
        station,
        stationNormalized: normalized,
        query,
      });
    }
  }

  return rows.sort((a, b) => {
    if (a.area === b.area) {
      return a.station.localeCompare(b.station, "ja-JP");
    }
    return a.area.localeCompare(b.area, "ja-JP");
  });
}

function buildQuery(area: string, station: string): string {
  const lower = station.toLowerCase();
  const kind = lower.includes("ps")
    ? "発電所"
    : lower.includes("cs")
      ? "変換所"
      : lower.includes("sws")
        ? "開閉所"
        : station.includes("開閉所")
          ? "開閉所"
          : station.includes("変換所")
            ? "変換所"
            : station.includes("発電所")
              ? "発電所"
              : "変電所";
  return `${station} ${area} ${kind} 日本`;
}

async function searchNominatim(query: string): Promise<NominatimResult[]> {
  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("countrycodes", "jp");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "ja");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "occto-grid-observatory station geo audit",
    },
  });
  if (!response.ok) {
    return [];
  }

  const json = (await response.json()) as NominatimResult[];
  return Array.isArray(json) ? json : [];
}

function evaluateCandidates(
  entry: StationEntry,
  results: NominatimResult[],
): {
  confidence: "high" | "medium" | "low" | "none";
  score: number;
  lat: number | null;
  lon: number | null;
  displayName: string;
  reason: string;
} {
  if (results.length === 0) {
    return {
      confidence: "none",
      score: 0,
      lat: null,
      lon: null,
      displayName: "",
      reason: "no_result",
    };
  }

  let bestScore = Number.NEGATIVE_INFINITY;
  let best: NominatimResult | null = null;
  let bestReason = "";
  for (const result of results) {
    const evaluated = scoreResult(entry, result);
    if (evaluated.score > bestScore) {
      bestScore = evaluated.score;
      best = result;
      bestReason = evaluated.reason;
    }
  }

  if (!best) {
    return {
      confidence: "none",
      score: 0,
      lat: null,
      lon: null,
      displayName: "",
      reason: "no_best",
    };
  }

  const confidence =
    bestScore >= 0.78 ? "high" : bestScore >= 0.52 ? "medium" : bestScore >= 0.25 ? "low" : "none";

  return {
    confidence,
    score: Math.max(0, bestScore),
    lat: Number.isFinite(Number(best.lat)) ? Number(best.lat) : null,
    lon: Number.isFinite(Number(best.lon)) ? Number(best.lon) : null,
    displayName: best.display_name,
    reason: bestReason,
  };
}

function scoreResult(
  entry: StationEntry,
  result: NominatimResult,
): {
  score: number;
  reason: string;
} {
  const stationNorm = entry.stationNormalized;
  const displayNorm = normalizeForCompare(result.display_name);
  const queryNorm = normalizeForCompare(entry.query);
  const displayHasKind = /変電所|開閉所|変換所|発電所|substation|converter/i.test(result.display_name);
  const stationContained = stationNorm.length > 0 && displayNorm.includes(stationNorm);
  const overlap = overlapRatio(stationNorm, displayNorm);
  const queryOverlap = overlapRatio(queryNorm, displayNorm);

  let score = 0;
  if (stationContained) {
    score += 0.6;
  } else {
    score += overlap * 0.45;
  }
  score += queryOverlap * 0.2;
  if (displayHasKind) {
    score += 0.25;
  }
  if (/台湾|中國|中国|北京|香港|韓国|대한민국|韓國|taiwan|china|beijing/i.test(result.display_name)) {
    score -= 0.8;
  }
  if (/都道府県|県|市|区|町|村$/.test(result.display_name) && !displayHasKind) {
    score -= 0.25;
  }

  const reason = `stationContained=${String(stationContained)}, displayHasKind=${String(
    displayHasKind,
  )}, overlap=${roundTo(overlap, 3)}, queryOverlap=${roundTo(queryOverlap, 3)}`;
  return { score, reason };
}

function parseDirection(rawDirection: string): { source: string; target: string } | null {
  const normalized = rawDirection.replace(/\s+/g, " ").trim();
  const parts = normalized.split(/\s*(?:→|⇒|⇢|->|＞)\s*/).map((part) => part.trim());
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return { source: parts[0], target: parts[1] };
}

function normalizeStationName(station: string): string {
  return station
    .trim()
    .replace(/\s+/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/変電所|開閉所|変換所|発電所|火力|幹線|連系線|SS|ss|SWS|sws|CS|cs|PS|ps/g, "");
}

function normalizeForCompare(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[，、,.\-_/]/g, "");
}

function overlapRatio(needle: string, haystack: string): number {
  if (!needle || !haystack) {
    return 0;
  }
  const chars = Array.from(new Set(needle.split("")));
  if (chars.length === 0) {
    return 0;
  }
  const matched = chars.filter((char) => haystack.includes(char)).length;
  return matched / chars.length;
}

function isAreaToken(station: string): boolean {
  const normalized = station
    .trim()
    .replace(/[!！?？]/g, "")
    .replace(/\s+/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/エリア/g, "");
  return [
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
  ].includes(normalized);
}

async function readCache(): Promise<Record<string, CacheRecord>> {
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf-8");
    return JSON.parse(raw) as Record<string, CacheRecord>;
  } catch {
    return {};
  }
}

function confidenceRank(confidence: AuditRow["confidence"]): number {
  if (confidence === "high") return 0;
  if (confidence === "medium") return 1;
  if (confidence === "low") return 2;
  return 3;
}

function toCsv(rows: AuditRow[]): string {
  const header = [
    "area",
    "station",
    "stationNormalized",
    "query",
    "confidence",
    "score",
    "lat",
    "lon",
    "displayName",
    "reason",
    "resultCount",
  ];
  const lines = rows.map((row) =>
    [
      row.area,
      row.station,
      row.stationNormalized,
      row.query,
      row.confidence,
      String(row.score),
      row.lat === null ? "" : String(row.lat),
      row.lon === null ? "" : String(row.lon),
      row.displayName,
      row.reason,
      String(row.resultCount),
    ]
      .map(csvEscape)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("[audit] failed:", error);
  process.exitCode = 1;
});

