/**
 * enrich-jepx.ts — Fetch JEPX spot market data and enrich existing dashboard JSON files.
 *
 * JEPX publishes yearly CSV files at:
 *   https://www.jepx.jp/market/excel/spot_YYYY.csv
 *
 * The CSV is Shift-JIS encoded with these columns:
 *   受渡日, 時刻コード, 売り入札量(kWh), 買い入札量(kWh), 約定総量(kWh),
 *   システムプライス(円/kWh), エリアプライス北海道(円/kWh), ..., エリアプライス九州(円/kWh)
 *
 * The CSV uses fiscal year (April→March). Date format is YYYY/MM/DD.
 * 時刻コード 1–48 maps to 00:00–23:30 in 30-minute slots.
 *
 * Usage:
 *   npx tsx scripts/enrich-jepx.ts
 *   npx tsx scripts/enrich-jepx.ts --date=2025/03/15
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import iconv from "iconv-lite";
import type { DashboardData, JepxSpotPrice } from "../src/lib/dashboard-types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NORMALIZED_DIR = path.join(process.cwd(), "data", "normalized");
const RAW_DIR_BASE = path.join(process.cwd(), "data", "raw");
const DASHBOARD_PATTERN = /^dashboard-(\d{8})\.json$/;

/** JEPX fiscal year CSV URL. Fiscal year starts in April. */
const JEPX_CSV_BASE = "https://www.jepx.jp/market/excel";

/** Map of JEPX area column suffix → internal area name */
const JEPX_AREA_COLUMNS: Record<string, string> = {
  "エリアプライス北海道(円/kWh)": "北海道",
  "エリアプライス東北(円/kWh)": "東北",
  "エリアプライス東京(円/kWh)": "東京",
  "エリアプライス中部(円/kWh)": "中部",
  "エリアプライス北陸(円/kWh)": "北陸",
  "エリアプライス関西(円/kWh)": "関西",
  "エリアプライス中国(円/kWh)": "中国",
  "エリアプライス四国(円/kWh)": "四国",
  "エリアプライス九州(円/kWh)": "九州",
};

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const specificDate = parseCliDate(process.argv.slice(2));

  if (specificDate) {
    // Enrich a single date
    await enrichDate(specificDate);
  } else {
    // Enrich all existing dashboard files
    await enrichAll();
  }
}

function parseCliDate(args: string[]): string | null {
  for (const arg of args) {
    if (arg.startsWith("--date=")) {
      const raw = arg.slice("--date=".length).trim();
      const normalized = raw.replaceAll("-", "/");
      if (/^\d{4}\/\d{2}\/\d{2}$/.test(normalized)) {
        return normalized;
      }
      throw new Error(`Invalid --date value: ${raw}. Use YYYY/MM/DD or YYYY-MM-DD.`);
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Enrich all dashboard files
// ---------------------------------------------------------------------------

async function enrichAll(): Promise<void> {
  const entries = await fs.readdir(NORMALIZED_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && DASHBOARD_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));

  // Group files by JEPX fiscal year to minimize CSV downloads
  const csvCache = new Map<string, Map<string, JepxSpotPrice>>();
  let enrichedCount = 0;

  for (const fileName of files) {
    const match = DASHBOARD_PATTERN.exec(fileName);
    if (!match) continue;

    const dateStamp = match[1];
    const targetDate = `${dateStamp.slice(0, 4)}/${dateStamp.slice(4, 6)}/${dateStamp.slice(6, 8)}`;
    const fiscalYear = getFiscalYear(targetDate);

    if (!csvCache.has(fiscalYear)) {
      const spotByDate = await fetchAndParseJepxCsv(fiscalYear, targetDate);
      if (spotByDate) {
        csvCache.set(fiscalYear, spotByDate);
      } else {
        console.log(`[enrich-jepx] skip ${fileName}: CSV not available for FY${fiscalYear}`);
        continue;
      }
    }

    const spotByDate = csvCache.get(fiscalYear)!;
    const spotData = spotByDate.get(targetDate);
    if (!spotData) {
      console.log(`[enrich-jepx] skip ${fileName}: no JEPX data for ${targetDate}`);
      continue;
    }

    const filePath = path.join(NORMALIZED_DIR, fileName);
    await enrichDashboardFile(filePath, spotData, targetDate);
    enrichedCount += 1;
  }

  // Also enrich dashboard-latest.json
  await enrichLatest(csvCache);

  console.log(`[enrich-jepx] done: enriched ${enrichedCount} files`);
}

// ---------------------------------------------------------------------------
// Enrich single date
// ---------------------------------------------------------------------------

async function enrichDate(targetDate: string): Promise<void> {
  const dateStamp = targetDate.replaceAll("/", "");
  const filePath = path.join(NORMALIZED_DIR, `dashboard-${dateStamp}.json`);

  try {
    await fs.access(filePath);
  } catch {
    console.error(`[enrich-jepx] dashboard file not found: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  const fiscalYear = getFiscalYear(targetDate);
  const spotByDate = await fetchAndParseJepxCsv(fiscalYear, targetDate);
  if (!spotByDate) {
    console.error(`[enrich-jepx] failed to fetch JEPX CSV for FY${fiscalYear}`);
    process.exitCode = 1;
    return;
  }

  const spotData = spotByDate.get(targetDate);
  if (!spotData) {
    console.error(`[enrich-jepx] no JEPX data for ${targetDate} in FY${fiscalYear} CSV`);
    process.exitCode = 1;
    return;
  }

  await enrichDashboardFile(filePath, spotData, targetDate);

  // Also update latest if it has the same date
  const latestPath = path.join(NORMALIZED_DIR, "dashboard-latest.json");
  try {
    const latestContent = await fs.readFile(latestPath, "utf-8");
    const latestDashboard = JSON.parse(latestContent) as DashboardData;
    if (latestDashboard.meta.targetDate === targetDate) {
      await enrichDashboardFile(latestPath, spotData, targetDate);
    }
  } catch {
    // dashboard-latest.json may not exist
  }

  console.log(`[enrich-jepx] done: enriched ${targetDate}`);
}

// ---------------------------------------------------------------------------
// Enrich dashboard-latest.json
// ---------------------------------------------------------------------------

async function enrichLatest(csvCache: Map<string, Map<string, JepxSpotPrice>>): Promise<void> {
  const latestPath = path.join(NORMALIZED_DIR, "dashboard-latest.json");
  try {
    const content = await fs.readFile(latestPath, "utf-8");
    const dashboard = JSON.parse(content) as DashboardData;
    const targetDate = dashboard.meta.targetDate;
    const fiscalYear = getFiscalYear(targetDate);

    if (!csvCache.has(fiscalYear)) {
      const spotByDate = await fetchAndParseJepxCsv(fiscalYear, targetDate);
      if (spotByDate) {
        csvCache.set(fiscalYear, spotByDate);
      }
    }

    const spotByDate = csvCache.get(fiscalYear);
    const spotData = spotByDate?.get(targetDate);
    if (spotData) {
      await enrichDashboardFile(latestPath, spotData, targetDate);
    }
  } catch {
    // no-op: dashboard-latest.json may not exist
  }
}

// ---------------------------------------------------------------------------
// Core: write enriched dashboard
// ---------------------------------------------------------------------------

async function enrichDashboardFile(
  filePath: string,
  spotData: JepxSpotPrice,
  targetDate: string,
): Promise<void> {
  const content = await fs.readFile(filePath, "utf-8");
  const dashboard = JSON.parse(content) as DashboardData;
  dashboard.jepx = { spot: spotData };
  dashboard.meta.sources = {
    ...dashboard.meta.sources,
    jepxSpotCsv: `spot_${getFiscalYear(targetDate)}.csv`,
  };
  await fs.writeFile(filePath, JSON.stringify(dashboard, null, 2), "utf-8");
  console.log(`[enrich-jepx] updated ${path.basename(filePath)} (${targetDate})`);
}

// ---------------------------------------------------------------------------
// JEPX CSV Fetch
// ---------------------------------------------------------------------------

/**
 * Fetch the JEPX spot_summary CSV for a given fiscal year and parse into
 * a Map keyed by date (YYYY/MM/DD).
 *
 * JEPX fiscal year for a date:
 *   - 2025/04/01 → 2025/03/31 of the next year → FY "2025"
 *   - 2025/01/01 → belongs to FY "2024" (April 2024 – March 2025)
 *
 * CSV URL examples:
 *   https://www.jepx.jp/market/excel/spot_2024.csv  (FY2024: 2024/04 – 2025/03)
 */
async function fetchAndParseJepxCsv(
  fiscalYear: string,
  targetDate: string,
): Promise<Map<string, JepxSpotPrice> | null> {
  const csvFileName = `spot_${fiscalYear}.csv`;
  const dateStamp = targetDate.replaceAll("/", "");

  // Try to use cached raw file first
  const rawDir = path.join(RAW_DIR_BASE, dateStamp);
  const rawPath = path.join(rawDir, csvFileName);

  let csvBuffer: Buffer | null = null;
  try {
    csvBuffer = await fs.readFile(rawPath);
    console.log(`[enrich-jepx] using cached ${rawPath}`);
  } catch {
    // Download from JEPX
    csvBuffer = await downloadJepxCsv(csvFileName);
    if (!csvBuffer) {
      return null;
    }
    // Cache the raw file
    try {
      await fs.mkdir(rawDir, { recursive: true });
      await fs.writeFile(rawPath, csvBuffer);
      console.log(`[enrich-jepx] cached ${rawPath}`);
    } catch {
      // caching failure is non-fatal
    }
  }

  return parseJepxCsv(csvBuffer);
}

async function downloadJepxCsv(csvFileName: string): Promise<Buffer | null> {
  // Try the direct /market/excel/ path (historically available)
  const directUrl = `${JEPX_CSV_BASE}/${csvFileName}`;
  console.log(`[enrich-jepx] fetching ${directUrl}`);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(directUrl, {
        headers: {
          "accept": "text/csv, application/octet-stream, */*",
          "accept-language": "ja,en-US;q=0.9,en;q=0.8",
          "referer": "https://www.jepx.jp/electricpower/market-data/spot/",
          "user-agent": "Mozilla/5.0 (compatible; occto-grid-observatory/1.0)",
        },
      });

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        console.log(`[enrich-jepx] downloaded ${csvFileName} (${buffer.length} bytes)`);
        return buffer;
      }

      if (response.status === 404) {
        console.warn(`[enrich-jepx] ${csvFileName} not found (404) — data may not be published yet`);
        return null;
      }

      console.warn(`[enrich-jepx] attempt ${attempt}/3: HTTP ${response.status} for ${csvFileName}`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[enrich-jepx] attempt ${attempt}/3: fetch error — ${msg}`);
    }

    if (attempt < 3) {
      await sleep(3000 * attempt);
    }
  }

  // Fallback: try the _download.php POST endpoint
  console.log(`[enrich-jepx] trying POST fallback for ${csvFileName}`);
  try {
    const response = await fetch(
      `https://www.jepx.jp/_download.php?timestamp=${Date.now()}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "referer": "https://www.jepx.jp/electricpower/market-data/spot/",
          "user-agent": "Mozilla/5.0 (compatible; occto-grid-observatory/1.0)",
        },
        body: `dir=spot_summary&file=spot_summary_${csvFileName.replace("spot_", "").replace(".csv", "")}.csv`,
      },
    );

    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      console.log(`[enrich-jepx] downloaded via POST fallback (${buffer.length} bytes)`);
      return buffer;
    }
    console.warn(`[enrich-jepx] POST fallback returned ${response.status}`);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[enrich-jepx] POST fallback failed: ${msg}`);
  }

  return null;
}

// ---------------------------------------------------------------------------
// JEPX CSV Parser
// ---------------------------------------------------------------------------

/**
 * Parse a JEPX spot_summary CSV (Shift-JIS) into a Map<date, JepxSpotPrice>.
 *
 * CSV structure:
 *   Row 0: may contain garbage bytes (BOM / encoding artifacts)
 *   Row 1: header row with column names
 *   Row 2+: data rows, 48 rows per day (時刻コード 1–48)
 *
 * We detect the header row by looking for "受渡日" in the line.
 */
function parseJepxCsv(buffer: Buffer): Map<string, JepxSpotPrice> {
  // Decode Shift-JIS → UTF-8
  let text = iconv.decode(buffer, "Shift_JIS");
  // Strip BOM if present
  text = text.replace(/^\uFEFF/, "");

  const lines = text.split(/\r?\n/);

  // Find the header row (first line containing "受渡日")
  let headerIndex = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (lines[i].includes("受渡日")) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex < 0) {
    console.warn("[enrich-jepx] could not find header row in CSV");
    return new Map();
  }

  const headers = parseCSVLine(lines[headerIndex]);
  const colIndex = buildColumnIndex(headers);

  if (colIndex.date < 0 || colIndex.slotCode < 0 || colIndex.systemPrice < 0) {
    console.warn("[enrich-jepx] essential columns missing in CSV header");
    console.warn(`[enrich-jepx] headers found: ${headers.join(", ")}`);
    return new Map();
  }

  // Parse data rows
  const dateMap = new Map<
    string,
    {
      systemPrices: number[];
      areaPrices: Record<string, number[]>;
      volumes: number[];
      sellVolumes: number[];
      buyVolumes: number[];
    }
  >();

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    const rawDate = cols[colIndex.date]?.trim();
    if (!rawDate || !/\d{4}\/\d{2}\/\d{2}/.test(rawDate)) continue;

    const slotCode = parseInt(cols[colIndex.slotCode], 10);
    if (isNaN(slotCode) || slotCode < 1 || slotCode > 48) continue;

    const slotIndex = slotCode - 1; // 0-based

    if (!dateMap.has(rawDate)) {
      dateMap.set(rawDate, {
        systemPrices: new Array(48).fill(0),
        areaPrices: Object.fromEntries(
          Object.values(JEPX_AREA_COLUMNS).map((area) => [area, new Array(48).fill(0)]),
        ),
        volumes: new Array(48).fill(0),
        sellVolumes: new Array(48).fill(0),
        buyVolumes: new Array(48).fill(0),
      });
    }

    const entry = dateMap.get(rawDate)!;

    entry.systemPrices[slotIndex] = parseFloat(cols[colIndex.systemPrice]) || 0;

    if (colIndex.volume >= 0) {
      // CSV volume is in kWh — convert to MWh for dashboard
      entry.volumes[slotIndex] = (parseFloat(cols[colIndex.volume]) || 0) / 1000;
    }
    if (colIndex.sellVolume >= 0) {
      entry.sellVolumes[slotIndex] = (parseFloat(cols[colIndex.sellVolume]) || 0) / 1000;
    }
    if (colIndex.buyVolume >= 0) {
      entry.buyVolumes[slotIndex] = (parseFloat(cols[colIndex.buyVolume]) || 0) / 1000;
    }

    // Area prices
    for (const [colName, area] of Object.entries(JEPX_AREA_COLUMNS)) {
      const idx = colIndex.areaPrices[colName];
      if (idx !== undefined && idx >= 0) {
        entry.areaPrices[area][slotIndex] = parseFloat(cols[idx]) || 0;
      }
    }
  }

  // Convert to JepxSpotPrice map
  const result = new Map<string, JepxSpotPrice>();
  for (const [date, entry] of dateMap) {
    const spot: JepxSpotPrice = {
      systemPrices: entry.systemPrices.map((v) => roundTo(v, 2)),
      areaPrices: Object.fromEntries(
        Object.entries(entry.areaPrices).map(([area, prices]) => [
          area,
          prices.map((v) => roundTo(v, 2)),
        ]),
      ),
      volumes: entry.volumes.map((v) => roundTo(v, 1)),
      sellVolumes: entry.sellVolumes.map((v) => roundTo(v, 1)),
      buyVolumes: entry.buyVolumes.map((v) => roundTo(v, 1)),
    };
    result.set(date, spot);
  }

  console.log(`[enrich-jepx] parsed ${result.size} days from CSV`);
  return result;
}

// ---------------------------------------------------------------------------
// CSV column index builder
// ---------------------------------------------------------------------------

type ColumnIndex = {
  date: number;
  slotCode: number;
  systemPrice: number;
  volume: number;
  sellVolume: number;
  buyVolume: number;
  areaPrices: Record<string, number>;
};

function buildColumnIndex(headers: string[]): ColumnIndex {
  const index: ColumnIndex = {
    date: -1,
    slotCode: -1,
    systemPrice: -1,
    volume: -1,
    sellVolume: -1,
    buyVolume: -1,
    areaPrices: {},
  };

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].trim();
    if (h === "受渡日") index.date = i;
    else if (h === "時刻コード") index.slotCode = i;
    else if (h === "システムプライス(円/kWh)") index.systemPrice = i;
    else if (h === "約定総量(kWh)") index.volume = i;
    else if (h.startsWith("売り入札量")) index.sellVolume = i;
    else if (h.startsWith("買い入札量")) index.buyVolume = i;
    else if (JEPX_AREA_COLUMNS[h]) index.areaPrices[h] = i;
  }

  return index;
}

// ---------------------------------------------------------------------------
// Simple CSV line parser (handles quoted fields)
// ---------------------------------------------------------------------------

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * JEPX fiscal year: April YYYY → March YYYY+1 = FY "YYYY".
 * e.g. 2025/01/15 → FY 2024, 2025/04/01 → FY 2025.
 */
function getFiscalYear(date: string): string {
  const matched = date.match(/^(\d{4})\/(\d{2})\//);
  if (!matched) return date.slice(0, 4);
  const year = parseInt(matched[1], 10);
  const month = parseInt(matched[2], 10);
  return String(month >= 4 ? year : year - 1);
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Exports for use in ingest.ts
// ---------------------------------------------------------------------------

export { fetchAndParseJepxCsv, getFiscalYear };
export type { JepxSpotPrice };

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[enrich-jepx] failed: ${message}`);
  process.exitCode = 1;
});
