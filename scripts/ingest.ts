import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium, type Download, type Page } from "playwright";
import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import type {
  AreaBalance,
  AreaFlowSummary,
  DashboardData,
  FlowRow,
  GenerationRow,
  HourlyAreaPoint,
  HourlySourcePoint,
  LineSeries,
} from "../src/lib/dashboard-types";

const HKS_BASE = "https://hatsuden-kokai.occto.or.jp/hks-web-public";
const OCCTO_LOGIN_URL =
  "https://occtonet3.occto.or.jp/public/dfw/RP11/OCCTO/SD/LOGIN_login#";

const FLOW_AREAS = [
  { code: "01", name: "北海道" },
  { code: "02", name: "東北" },
  { code: "03", name: "東京" },
  { code: "04", name: "中部" },
  { code: "05", name: "北陸" },
  { code: "06", name: "関西" },
  { code: "07", name: "中国" },
  { code: "08", name: "四国" },
  { code: "09", name: "九州" },
  { code: "10", name: "沖縄" },
] as const;

type CliArgs = {
  mode: "daily" | "now" | "backfill";
  targetDates: string[];
  force: boolean;
};

type DownloadResult = {
  generationCsv: string;
  flowCsvByArea: string[];
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const normalizedDir = path.join(process.cwd(), "data", "normalized");
  await fs.mkdir(normalizedDir, { recursive: true });

  console.log(`[ingest] mode=${args.mode}, force=${String(args.force)}`);
  console.log(`[ingest] dates=${args.targetDates.join(", ")}`);

  let latestPayload = "";
  let latestDate = "";
  let updatedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < args.targetDates.length; i += 1) {
    const targetDate = args.targetDates[i];
    const dateStamp = targetDate.replaceAll("/", "");
    const rawDir = path.join(process.cwd(), "data", "raw", dateStamp);
    const datedOutputPath = path.join(normalizedDir, `dashboard-${dateStamp}.json`);

    if (!args.force && (await fileExists(datedOutputPath))) {
      skippedCount += 1;
      console.log(`[ingest] skip existing: ${datedOutputPath}`);
      continue;
    }

    await fs.mkdir(rawDir, { recursive: true });
    const downloadResult = await downloadCsvFiles(targetDate, rawDir);
    const generationRows = await parseGenerationCsv(downloadResult.generationCsv);
    const flowRows = await parseFlowCsv(downloadResult.flowCsvByArea);

    const dashboard = buildDashboardData({
      targetDate,
      generationRows,
      flowRows,
      generationCsvName: path.basename(downloadResult.generationCsv),
      flowCsvName: downloadResult.flowCsvByArea.map((file) => path.basename(file)).join(","),
    });

    const payload = JSON.stringify(dashboard, null, 2);
    await fs.writeFile(datedOutputPath, payload, "utf-8");

    latestPayload = payload;
    latestDate = targetDate;
    updatedCount += 1;

    console.log(
      `[ingest] generated ${targetDate}: generation=${generationRows.length}, flow=${flowRows.length}`,
    );
    console.log(`[ingest] wrote ${datedOutputPath}`);

    if (i < args.targetDates.length - 1) {
      await sleep(3000);
    }
  }

  if (latestPayload) {
    const latestOutputPath = path.join(normalizedDir, "dashboard-latest.json");
    await fs.writeFile(latestOutputPath, latestPayload, "utf-8");
    console.log(`[ingest] wrote ${latestOutputPath} (from ${latestDate})`);
  } else {
    console.log("[ingest] no new data generated");
  }

  console.log(`[ingest] summary: updated=${updatedCount}, skipped=${skippedCount}`);
}

function parseArgs(args: string[]): CliArgs {
  const options = new Map<string, string>();
  const flags = new Set<string>();

  for (const arg of args) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      const key = body.slice(0, eq);
      const value = body.slice(eq + 1);
      options.set(key, value);
    } else {
      flags.add(body);
    }
  }

  const modeRaw = options.get("mode") ?? "daily";
  if (modeRaw !== "daily" && modeRaw !== "now" && modeRaw !== "backfill") {
    throw new Error("`--mode` must be one of: daily | now | backfill.");
  }

  let targetDates: string[] = [];
  if (modeRaw === "daily") {
    const dateInput = options.get("date");
    const date = normalizeDate(dateInput ?? defaultYesterdayJst());
    if (!date) {
      throw new Error("`--date` is invalid. Use YYYY-MM-DD or YYYY/MM/DD.");
    }
    targetDates = [date];
  }

  if (modeRaw === "now") {
    const dateInput = options.get("date");
    const date = normalizeDate(dateInput ?? defaultTodayJst());
    if (!date) {
      throw new Error("`--date` is invalid. Use YYYY-MM-DD or YYYY/MM/DD.");
    }
    targetDates = [date];
  }

  if (modeRaw === "backfill") {
    const from = normalizeDate(options.get("from") ?? "");
    const to = normalizeDate(options.get("to") ?? "");
    if (!from || !to) {
      throw new Error("`--mode=backfill` requires both `--from` and `--to`.");
    }
    targetDates = enumerateDateRange(from, to);
    if (targetDates.length === 0) {
      throw new Error("`--from` must be earlier than or equal to `--to`.");
    }
  }

  const defaultForce = modeRaw === "backfill" ? false : true;
  const force = parseBooleanOption(options.get("force"), flags, defaultForce);

  return {
    mode: modeRaw,
    targetDates,
    force,
  };
}

function defaultTodayJst(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const jstNow = new Date(utc + 9 * 60 * 60_000);

  const yyyy = String(jstNow.getUTCFullYear());
  const mm = String(jstNow.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(jstNow.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function defaultYesterdayJst(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const jstNow = new Date(utc + 9 * 60 * 60_000);
  const yesterdayJst = new Date(jstNow.getTime() - 24 * 60 * 60_000);

  const yyyy = String(yesterdayJst.getUTCFullYear());
  const mm = String(yesterdayJst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(yesterdayJst.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function normalizeDate(input: string): string | null {
  const unified = input.trim().replaceAll("-", "/");
  const matched = unified.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!matched) {
    return null;
  }

  const [, y, m, d] = matched;
  const date = new Date(`${y}-${m}-${d}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `${y}/${m}/${d}`;
}

function enumerateDateRange(from: string, to: string): string[] {
  const start = toUtcDate(from);
  const end = toUtcDate(to);
  if (!start || !end || start.getTime() > end.getTime()) {
    return [];
  }

  const dates: string[] = [];
  const current = new Date(start.getTime());
  while (current.getTime() <= end.getTime()) {
    dates.push(formatUtcDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function toUtcDate(normalized: string): Date | null {
  const matched = normalized.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!matched) {
    return null;
  }
  const [, y, m, d] = matched;
  return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
}

function formatUtcDate(date: Date): string {
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function parseBooleanOption(
  value: string | undefined,
  flags: ReadonlySet<string>,
  defaultValue: boolean,
): boolean {
  if (flags.has("force")) {
    return true;
  }
  if (flags.has("no-force")) {
    return false;
  }
  if (value === undefined) {
    return defaultValue;
  }

  const lowered = value.toLowerCase();
  if (lowered === "true" || lowered === "1") {
    return true;
  }
  if (lowered === "false" || lowered === "0") {
    return false;
  }
  throw new Error("`--force` must be true/false.");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadCsvFiles(targetDate: string, rawDir: string): Promise<DownloadResult> {
  const generationCsv = await downloadGenerationCsv(targetDate, rawDir);
  const flowCsvByArea = await downloadFlowCsvByArea(targetDate, rawDir);
  return { generationCsv, flowCsvByArea };
}

async function downloadGenerationCsv(targetDate: string, rawDir: string): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    await page.goto(`${HKS_BASE}/disclaimer-agree`, { waitUntil: "domcontentloaded" });

    const agreedCheckbox = page.locator("#agreed");
    if (await agreedCheckbox.isVisible()) {
      await agreedCheckbox.check();
      await Promise.all([
        page.waitForURL("**/info/home", { timeout: 60_000 }),
        page.locator("#next").click(),
      ]);
    }

    await page.goto(`${HKS_BASE}/info/hks`, { waitUntil: "domcontentloaded" });
    await page.fill('input[name="tgtDateDateFrom"]', targetDate);
    await page.fill('input[name="tgtDateDateTo"]', targetDate);

    await page.locator("#search_btn").click();
    await page.waitForSelector("#csv_btn:not([disabled])", { timeout: 120_000 });

    const download = await captureDownload(page, async () => {
      await page.locator("#csv_btn").click();
    });

    const outputPath = path.join(rawDir, `generation-${targetDate.replaceAll("/", "")}.csv`);
    await download.saveAs(outputPath);
    return outputPath;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function downloadFlowCsvByArea(targetDate: string, rawDir: string): Promise<string[]> {
  const outputFiles: string[] = [];
  for (const area of FLOW_AREAS) {
    const outputPath = await downloadFlowCsvForSingleArea(targetDate, rawDir, area.code, area.name);
    outputFiles.push(outputPath);
    console.log(`[ingest] downloaded flow csv for ${area.name}`);
  }
  return outputFiles;
}

async function downloadFlowCsvForSingleArea(
  targetDate: string,
  rawDir: string,
  areaCode: string,
  areaName: string,
): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    await page.goto(OCCTO_LOGIN_URL, { waitUntil: "domcontentloaded" });
    await page.locator("#menu1-2").click();

    const popupPromise = context.waitForEvent("page");
    await page.locator("#menu1-2-2-1").click();
    const flowPage = await popupPromise;
    await flowPage.waitForLoadState("domcontentloaded");

    await flowPage.fill("#tgtNngp", targetDate);
    await flowPage.selectOption("#areaCdAreaSumNon", areaCode);
    await flowPage.locator("#searchBtn").click();
    await flowPage.waitForSelector("#csvBtn:not([disabled])", { timeout: 120_000 });

    const download = await captureDownload(flowPage, async () => {
      await flowPage.locator("#csvBtn").click();
      await flowPage.getByRole("button", { name: "OK" }).click();
    });

    const outputPath = path.join(
      rawDir,
      `flow-${targetDate.replaceAll("/", "")}-${areaCode}-${areaName}.csv`,
    );
    await download.saveAs(outputPath);
    return outputPath;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function captureDownload(page: Page, trigger: () => Promise<void>): Promise<Download> {
  const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
  await trigger();
  return downloadPromise;
}

async function parseGenerationCsv(filePath: string): Promise<GenerationRow[]> {
  const raw = await fs.readFile(filePath);
  const text = raw.toString("utf-8").replace(/^\uFEFF/, "");
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  if (rows.length === 0) {
    return [];
  }

  const slotLabels = Object.keys(rows[0]).filter((key) => /^\d{2}:\d{2}\[kWh\]$/.test(key));

  return rows.map((row) => ({
    plantCode: row["発電所コード"] ?? "",
    area: row["エリア"] ?? "",
    plantName: row["発電所名"] ?? "",
    unitName: row["ユニット名"] ?? "",
    sourceType: row["発電方式・燃種"] ?? "",
    targetDate: row["対象日"] ?? "",
    values: slotLabels.map((label) => parseNumber(row[label])),
    dailyKwh: parseNumber(row["日量[kWh]"]),
    updatedAt: row["更新日時"] ?? "",
  }));
}

async function parseFlowCsv(filePaths: string[]): Promise<FlowRow[]> {
  const parsed: FlowRow[] = [];

  for (const filePath of filePaths) {
    const raw = await fs.readFile(filePath);
    const text = iconv.decode(raw, "cp932");
    const rows = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    if (rows.length === 0) {
      continue;
    }

    const slotLabels = Object.keys(rows[0]).filter((key) => /^([01]\d|2[0-3]):[03]0$/.test(key));

    for (const row of rows) {
      parsed.push({
        targetDate: row["対象年月日"] ?? "",
        area: row["対象エリア"] ?? "",
        voltageKv: row["電圧"] ?? "",
        lineName: row["送電線名"] ?? "",
        positiveDirection: row["潮流方向(正方向)"] ?? "",
        values: slotLabels.map((label) => parseNumber(row[label])),
      });
    }
  }

  return parsed;
}

function parseNumber(raw: string | undefined): number {
  if (!raw) {
    return 0;
  }

  const normalized = raw.replaceAll(",", "").trim();
  if (normalized.length === 0) {
    return 0;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildDashboardData(args: {
  targetDate: string;
  generationRows: GenerationRow[];
  flowRows: FlowRow[];
  generationCsvName: string;
  flowCsvName: string;
}): DashboardData {
  const generationSlotCount = args.generationRows[0]?.values.length ?? 48;
  const flowSlotCount = args.flowRows[0]?.values.length ?? 48;
  const slotCount = Math.max(generationSlotCount, flowSlotCount);

  const generationLabels = buildTimeLabels(30, slotCount, 30);
  const flowLabels = buildTimeLabels(0, slotCount, 30);

  const areaTotalsMap = new Map<string, number>();
  const sourceTotalsMap = new Map<string, number>();
  const hourlyByAreaMap = new Map<string, number[]>();
  const hourlyBySourceMap = new Map<string, number[]>();

  for (const row of args.generationRows) {
    areaTotalsMap.set(row.area, (areaTotalsMap.get(row.area) ?? 0) + row.dailyKwh);
    sourceTotalsMap.set(row.sourceType, (sourceTotalsMap.get(row.sourceType) ?? 0) + row.dailyKwh);

    const areaSeries = hourlyByAreaMap.get(row.area) ?? new Array(slotCount).fill(0);
    const sourceSeries = hourlyBySourceMap.get(row.sourceType) ?? new Array(slotCount).fill(0);
    for (let i = 0; i < slotCount; i += 1) {
      areaSeries[i] += row.values[i] ?? 0;
      sourceSeries[i] += row.values[i] ?? 0;
    }
    hourlyByAreaMap.set(row.area, areaSeries);
    hourlyBySourceMap.set(row.sourceType, sourceSeries);
  }

  const lineSeries: LineSeries[] = args.flowRows.map((row) => {
    const peakAbs = row.values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    const avg = row.values.reduce((sum, value) => sum + value, 0) / Math.max(row.values.length, 1);

    return {
      area: row.area,
      voltageKv: row.voltageKv,
      lineName: row.lineName,
      positiveDirection: row.positiveDirection,
      peakAbsMw: peakAbs,
      avgMw: roundTo(avg, 1),
      values: row.values,
    };
  });

  const flowAreaAccum = new Map<
    string,
    {
      lineCount: number;
      peakAbsMw: number;
      sumAbsMw: number;
      sampleCount: number;
    }
  >();
  const hourlyAbsAreaMap = new Map<string, number[]>();
  const hourlyAbsAll: number[][] = Array.from({ length: slotCount }, () => []);

  for (const row of args.flowRows) {
    const peakAbs = row.values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    const absValues = row.values.map((value) => Math.abs(value));
    const areaAccum = flowAreaAccum.get(row.area) ?? {
      lineCount: 0,
      peakAbsMw: 0,
      sumAbsMw: 0,
      sampleCount: 0,
    };

    areaAccum.lineCount += 1;
    areaAccum.peakAbsMw = Math.max(areaAccum.peakAbsMw, peakAbs);
    areaAccum.sumAbsMw += absValues.reduce((sum, value) => sum + value, 0);
    areaAccum.sampleCount += absValues.length;
    flowAreaAccum.set(row.area, areaAccum);

    const hourlyAreaSeries = hourlyAbsAreaMap.get(row.area) ?? new Array(slotCount).fill(0);
    for (let i = 0; i < slotCount; i += 1) {
      const value = absValues[i] ?? 0;
      hourlyAreaSeries[i] += value;
      hourlyAbsAll[i].push(value);
    }
    hourlyAbsAreaMap.set(row.area, hourlyAreaSeries);
  }

  const hourlyAbsByArea: HourlyAreaPoint[] = flowLabels.map((time, idx) => {
    const values: Record<string, number> = {};
    for (const [area, series] of hourlyAbsAreaMap.entries()) {
      const areaLineCount = flowAreaAccum.get(area)?.lineCount ?? 1;
      values[area] = roundTo((series[idx] ?? 0) / areaLineCount, 1);
    }
    return { time, values };
  });

  const hourlyAbsStats = flowLabels.map((time, idx) => {
    const values = hourlyAbsAll[idx];
    const avg = values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
    return {
      time,
      avgAbsMw: roundTo(avg, 1),
      p95AbsMw: roundTo(quantile(values, 0.95), 1),
    };
  });

  const areaSummaries: AreaFlowSummary[] = Array.from(flowAreaAccum.entries())
    .map(([area, values]) => ({
      area,
      lineCount: values.lineCount,
      peakAbsMw: roundTo(values.peakAbsMw, 1),
      avgAbsMw: roundTo(values.sumAbsMw / Math.max(values.sampleCount, 1), 1),
    }))
    .sort((a, b) => b.peakAbsMw - a.peakAbsMw);

  const generationAreaTotals = Array.from(areaTotalsMap.entries())
    .map(([area, totalKwh]) => ({ area, totalKwh: roundTo(totalKwh, 0) }))
    .sort((a, b) => b.totalKwh - a.totalKwh);
  const generationSourceTotals = Array.from(sourceTotalsMap.entries())
    .map(([source, totalKwh]) => ({ source, totalKwh: roundTo(totalKwh, 0) }))
    .sort((a, b) => b.totalKwh - a.totalKwh);

  const hourlyTotalByArea: HourlyAreaPoint[] = generationLabels.map((time, idx) => {
    const values: Record<string, number> = {};
    for (const [area, series] of hourlyByAreaMap.entries()) {
      values[area] = roundTo(series[idx] ?? 0, 0);
    }
    return { time, values };
  });

  const hourlyBySource: HourlySourcePoint[] = generationLabels.map((time, idx) => {
    const values: Record<string, number> = {};
    for (const [source, series] of hourlyBySourceMap.entries()) {
      values[source] = roundTo(series[idx] ?? 0, 0);
    }
    return { time, values };
  });

  const topUnits = [...args.generationRows]
    .sort((a, b) => b.dailyKwh - a.dailyKwh)
    .slice(0, 60)
    .map((row) => ({
      area: row.area,
      plantName: row.plantName,
      unitName: row.unitName,
      sourceType: row.sourceType,
      dailyKwh: row.dailyKwh,
    }));

  const areaBalance: AreaBalance[] = generationAreaTotals.map((generation) => {
    const flow = areaSummaries.find((item) => item.area === generation.area);
    const peakAbsMw = flow?.peakAbsMw ?? 0;
    const lineCount = flow?.lineCount ?? 0;
    const baseMw = generation.totalKwh / 1000 / 48;
    const stress = baseMw === 0 ? 0 : peakAbsMw / baseMw;

    return {
      area: generation.area,
      dailyKwh: generation.totalKwh,
      peakAbsMw,
      lineCount,
      stressIndex: roundTo(stress, 2),
    };
  });

  return {
    meta: {
      targetDate: args.targetDate,
      fetchedAt: new Date().toISOString(),
      generationRows: args.generationRows.length,
      flowRows: args.flowRows.length,
      slotCount,
      slotLabels: {
        generation: generationLabels,
        flow: flowLabels,
      },
      sources: {
        generationCsv: args.generationCsvName,
        flowCsv: args.flowCsvName,
      },
    },
    generation: {
      areaTotals: generationAreaTotals,
      sourceTotals: generationSourceTotals,
      hourlyBySource,
      hourlyTotalByArea,
      topUnits,
    },
    flows: {
      areaSummaries,
      hourlyAbsByArea,
      hourlyAbsStats,
      lineSeries: lineSeries.sort((a, b) => b.peakAbsMw - a.peakAbsMw).slice(0, 200),
    },
    insights: {
      areaBalance: areaBalance.sort((a, b) => b.stressIndex - a.stressIndex),
    },
  };
}

function buildTimeLabels(startMinute: number, points: number, stepMinute: number): string[] {
  const labels: string[] = [];
  let totalMinutes = startMinute;
  for (let i = 0; i < points; i += 1) {
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const mm = String(totalMinutes % 60).padStart(2, "0");
    labels.push(`${hh}:${mm}`);
    totalMinutes += stepMinute;
  }
  return labels;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * q;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

void main().catch((error) => {
  console.error("[ingest] failed");
  console.error(error);
  process.exitCode = 1;
});
