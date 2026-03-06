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
  InterAreaFlow,
  IntertieSeries,
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
  intertieCsvByLine: string[];
};

type IntertieFlowRow = {
  intertieName: string;
  targetDate: string;
  time: string;
  actualMw: number;
};

type IntertieAreaDefinition = {
  sourceArea: string;
  targetArea: string;
};

const INTERTIE_AREA_MAP: Record<string, IntertieAreaDefinition> = {
  "北海道・本州間電力連系設備": { sourceArea: "北海道", targetArea: "東北" },
  相馬双葉幹線: { sourceArea: "東北", targetArea: "東京" },
  周波数変換設備: { sourceArea: "東京", targetArea: "中部" },
  三重東近江線: { sourceArea: "中部", targetArea: "関西" },
  "南福光連系所・南福光変電所の連系設備": { sourceArea: "北陸", targetArea: "関西" },
  越前嶺南線: { sourceArea: "北陸", targetArea: "関西" },
  "西播東岡山線・山崎智頭線": { sourceArea: "関西", targetArea: "中国" },
  阿南紀北直流幹線: { sourceArea: "四国", targetArea: "関西" },
  本四連系線: { sourceArea: "中国", targetArea: "四国" },
  関門連系線: { sourceArea: "中国", targetArea: "九州" },
  北陸フェンス: { sourceArea: "中部", targetArea: "北陸" },
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
    const intertieRows = await parseIntertieCsv(downloadResult.intertieCsvByLine);

    const dashboard = buildDashboardData({
      targetDate,
      generationRows,
      flowRows,
      intertieRows,
      generationCsvName: path.basename(downloadResult.generationCsv),
      flowCsvName: downloadResult.flowCsvByArea.map((file) => path.basename(file)).join(","),
      intertieCsvName: downloadResult.intertieCsvByLine.map((file) => path.basename(file)).join(","),
    });

    const payload = JSON.stringify(dashboard, null, 2);
    await fs.writeFile(datedOutputPath, payload, "utf-8");

    latestPayload = payload;
    latestDate = targetDate;
    updatedCount += 1;

    console.log(
      `[ingest] generated ${targetDate}: generation=${generationRows.length}, flow=${flowRows.length}, intertie=${intertieRows.length}`,
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
  const intertieCsvByLine = await downloadIntertieCsvByLine(targetDate, rawDir);
  return { generationCsv, flowCsvByArea, intertieCsvByLine };
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

async function downloadIntertieCsvByLine(targetDate: string, rawDir: string): Promise<string[]> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const outputFiles: string[] = [];

  try {
    await page.goto(OCCTO_LOGIN_URL, { waitUntil: "domcontentloaded" });
    await page.locator("#menu1-1").click();

    const popupPromise = context.waitForEvent("page");
    await page.locator("#menu1-1-3-1").click();
    const intertiePage = await popupPromise;
    await intertiePage.waitForLoadState("domcontentloaded");
    await intertiePage.waitForSelector("#tgtRkl", { timeout: 60_000 });

    const options = await intertiePage.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLSelectElement>("#tgtRkl option"))
        .map((option) => ({
          value: option.value.trim(),
          label: option.textContent?.trim() ?? "",
        }))
        .filter((option) => option.value.length > 0),
    );

    for (let i = 0; i < options.length; i += 1) {
      const option = options[i];
      console.log(`[ingest] downloading intertie csv for ${option.label}`);
      try {
        await intertiePage.fill("#spcDay", targetDate);
        await intertiePage.selectOption("#tgtRkl", option.value);
        await intertiePage.locator("#searchBtn").click();
        await intertiePage.waitForLoadState("networkidle").catch(() => {});

        const csvButton = intertiePage.locator("#csvBtn");
        await intertiePage.waitForTimeout(700);
        if (!(await csvButton.isEnabled())) {
          console.log(`[ingest] skip intertie csv (no data): ${option.label}`);
          continue;
        }

        const download = await captureDownload(
          intertiePage,
          async () => {
            await csvButton.click();
            const okButton = intertiePage.locator('.ui-dialog-buttonset button:has-text("OK")').first();
            await okButton.click({ timeout: 10_000 }).catch(() => {});
            await intertiePage.locator(".ui-widget-overlay").first().waitFor({ state: "hidden" }).catch(() => {});
          },
          30_000,
        );

        const fileIndex = String(i + 1).padStart(2, "0");
        const safeLabel = sanitizeFilePart(option.label);
        const outputPath = path.join(
          rawDir,
          `intertie-${targetDate.replaceAll("/", "")}-${fileIndex}-${safeLabel}.csv`,
        );
        await download.saveAs(outputPath);
        outputFiles.push(outputPath);
        console.log(`[ingest] downloaded intertie csv for ${option.label}`);
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        console.warn(`[ingest] skip intertie csv for ${option.label}: ${detail}`);

        const cancelButton = intertiePage
          .locator('.ui-dialog-buttonset button:has-text("cancel"), .ui-dialog-titlebar-close')
          .first();
        if (await cancelButton.isVisible().catch(() => false)) {
          await cancelButton.click().catch(() => {});
        }
        await intertiePage.keyboard.press("Escape").catch(() => {});
      }

      await intertiePage.waitForTimeout(800);
    }

    return outputFiles;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function captureDownload(
  page: Page,
  trigger: () => Promise<void>,
  timeoutMs = 120_000,
): Promise<Download> {
  const downloadPromise = page.waitForEvent("download", { timeout: timeoutMs });
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

async function parseIntertieCsv(filePaths: string[]): Promise<IntertieFlowRow[]> {
  const parsed: IntertieFlowRow[] = [];

  for (const filePath of filePaths) {
    const raw = await fs.readFile(filePath);
    const text = iconv.decode(raw, "cp932");
    const rows = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    for (const row of rows) {
      parsed.push({
        intertieName: row["連系線"] ?? "",
        targetDate: row["対象日付"] ?? "",
        time: row["対象時刻"] ?? "",
        actualMw: parseNumber(row["潮流実績"]),
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

function sanitizeFilePart(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned : "intertie";
}

function buildDashboardData(args: {
  targetDate: string;
  generationRows: GenerationRow[];
  flowRows: FlowRow[];
  intertieRows: IntertieFlowRow[];
  generationCsvName: string;
  flowCsvName: string;
  intertieCsvName: string;
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
  const hourlyByAreaSourceMap = new Map<string, Map<string, number[]>>();
  const plantSummaryMap = new Map<
    string,
    { area: string; plantName: string; sourceType: string; dailyKwh: number; maxSlotKwh: number }
  >();

  for (const row of args.generationRows) {
    areaTotalsMap.set(row.area, (areaTotalsMap.get(row.area) ?? 0) + row.dailyKwh);
    sourceTotalsMap.set(row.sourceType, (sourceTotalsMap.get(row.sourceType) ?? 0) + row.dailyKwh);

    const areaSeries = hourlyByAreaMap.get(row.area) ?? new Array(slotCount).fill(0);
    const sourceSeries = hourlyBySourceMap.get(row.sourceType) ?? new Array(slotCount).fill(0);
    const areaSourceMap = hourlyByAreaSourceMap.get(row.area) ?? new Map<string, number[]>();
    const areaSourceSeries = areaSourceMap.get(row.sourceType) ?? new Array(slotCount).fill(0);
    for (let i = 0; i < slotCount; i += 1) {
      areaSeries[i] += row.values[i] ?? 0;
      sourceSeries[i] += row.values[i] ?? 0;
      areaSourceSeries[i] += row.values[i] ?? 0;
    }
    hourlyByAreaMap.set(row.area, areaSeries);
    hourlyBySourceMap.set(row.sourceType, sourceSeries);
    areaSourceMap.set(row.sourceType, areaSourceSeries);
    hourlyByAreaSourceMap.set(row.area, areaSourceMap);

    const plantKey = `${row.area}::${row.plantName}`;
    const currentPlant = plantSummaryMap.get(plantKey) ?? {
      area: row.area,
      plantName: row.plantName,
      sourceType: row.sourceType,
      dailyKwh: 0,
      maxSlotKwh: 0,
    };
    currentPlant.dailyKwh += row.dailyKwh;
    currentPlant.maxSlotKwh = Math.max(
      currentPlant.maxSlotKwh,
      row.values.reduce((max, value) => Math.max(max, value), 0),
    );
    if (!currentPlant.sourceType && row.sourceType) {
      currentPlant.sourceType = row.sourceType;
    }
    plantSummaryMap.set(plantKey, currentPlant);
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

  const hourlyBySourceByArea: Record<string, HourlySourcePoint[]> = {};
  for (const [area, sourceSeriesMap] of hourlyByAreaSourceMap.entries()) {
    hourlyBySourceByArea[area] = generationLabels.map((time, idx) => {
      const values: Record<string, number> = {};
      for (const [source, series] of sourceSeriesMap.entries()) {
        values[source] = roundTo(series[idx] ?? 0, 0);
      }
      return { time, values };
    });
  }

  const topUnits = [...args.generationRows]
    .sort((a, b) => b.dailyKwh - a.dailyKwh)
    .slice(0, 60)
    .map((row) => {
      const maxSlotKwh = row.values.reduce((max, value) => Math.max(max, value), 0);
      const maxOutputManKw = roundTo(maxSlotKwh / 5000, 2);
      return {
        area: row.area,
        plantName: row.plantName,
        unitName: row.unitName,
        sourceType: row.sourceType,
        maxOutputManKw,
        dailyKwh: row.dailyKwh,
      };
    });

  const plantSummaries = Array.from(plantSummaryMap.values())
    .map((row) => ({
      area: row.area,
      plantName: row.plantName,
      sourceType: row.sourceType,
      dailyKwh: roundTo(row.dailyKwh, 0),
      maxOutputManKw: roundTo(row.maxSlotKwh / 5000, 2),
    }))
    .sort((a, b) => b.dailyKwh - a.dailyKwh);

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

  const intertieSeries = buildIntertieSeries(args.intertieRows, slotCount);
  const interAreaFlows = buildInterAreaFlows(intertieSeries);

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
        intertieCsv: args.intertieCsvName,
      },
    },
    generation: {
      areaTotals: generationAreaTotals,
      sourceTotals: generationSourceTotals,
      hourlyBySource,
      hourlyBySourceByArea,
      hourlyTotalByArea,
      topUnits,
      plantSummaries,
    },
    flows: {
      areaSummaries,
      hourlyAbsByArea,
      hourlyAbsStats,
      lineSeries: lineSeries.sort((a, b) => b.peakAbsMw - a.peakAbsMw),
      intertieSeries,
      interAreaFlows,
    },
    insights: {
      areaBalance: areaBalance.sort((a, b) => b.stressIndex - a.stressIndex),
    },
  };
}

function buildIntertieSeries(intertieRows: IntertieFlowRow[], slotCount: number): IntertieSeries[] {
  const byIntertie = new Map<
    string,
    {
      values5m: number[];
      counts5m: number[];
    }
  >();

  for (const row of intertieRows) {
    const idx = timeToFiveMinuteIndex(row.time);
    if (idx === null) {
      continue;
    }

    const entry = byIntertie.get(row.intertieName) ?? {
      values5m: new Array(288).fill(0),
      counts5m: new Array(288).fill(0),
    };
    entry.values5m[idx] += row.actualMw;
    entry.counts5m[idx] += 1;
    byIntertie.set(row.intertieName, entry);
  }

  const series: IntertieSeries[] = [];
  for (const [intertieName, entry] of byIntertie.entries()) {
    const values5m = entry.values5m.map((sum, idx) => {
      const count = entry.counts5m[idx] || 1;
      return sum / count;
    });
    const values30m = aggregateTo30Minute(values5m, slotCount);
    const avgMw = values5m.reduce((sum, value) => sum + value, 0) / Math.max(values5m.length, 1);
    const avgAbsMw = values5m.reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(values5m.length, 1);
    const peakAbsMw = values5m.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    const areas = resolveIntertieAreas(intertieName);

    series.push({
      intertieName,
      sourceArea: areas.sourceArea,
      targetArea: areas.targetArea,
      peakAbsMw: roundTo(peakAbsMw, 1),
      avgMw: roundTo(avgMw, 1),
      avgAbsMw: roundTo(avgAbsMw, 1),
      values: values30m.map((value) => roundTo(value, 1)),
    });
  }

  return series.sort((a, b) => b.avgAbsMw - a.avgAbsMw);
}

function buildInterAreaFlows(intertieSeries: IntertieSeries[]): InterAreaFlow[] {
  const byPair = new Map<
    string,
    {
      sourceArea: string;
      targetArea: string;
      avgMw: number;
      avgAbsMw: number;
      peakAbsMw: number;
      intertieNames: string[];
    }
  >();

  for (const line of intertieSeries) {
    const key = `${line.sourceArea}→${line.targetArea}`;
    const entry = byPair.get(key) ?? {
      sourceArea: line.sourceArea,
      targetArea: line.targetArea,
      avgMw: 0,
      avgAbsMw: 0,
      peakAbsMw: 0,
      intertieNames: [] as string[],
    };

    entry.avgMw += line.avgMw;
    entry.avgAbsMw += line.avgAbsMw;
    entry.peakAbsMw = Math.max(entry.peakAbsMw, line.peakAbsMw);
    entry.intertieNames.push(line.intertieName);
    byPair.set(key, entry);
  }

  return Array.from(byPair.values())
    .map((entry) => ({
      sourceArea: entry.sourceArea,
      targetArea: entry.targetArea,
      avgMw: roundTo(entry.avgMw, 1),
      avgAbsMw: roundTo(entry.avgAbsMw, 1),
      peakAbsMw: roundTo(entry.peakAbsMw, 1),
      intertieCount: entry.intertieNames.length,
      intertieNames: entry.intertieNames,
    }))
    .sort((a, b) => b.avgAbsMw - a.avgAbsMw);
}

function aggregateTo30Minute(values5m: number[], slotCount: number): number[] {
  const pointsPerSlot = 6;
  const slots = new Array(slotCount).fill(0);
  for (let slotIdx = 0; slotIdx < slotCount; slotIdx += 1) {
    let sum = 0;
    let count = 0;
    for (let offset = 0; offset < pointsPerSlot; offset += 1) {
      const idx = slotIdx * pointsPerSlot + offset;
      if (idx >= values5m.length) {
        break;
      }
      sum += values5m[idx];
      count += 1;
    }
    slots[slotIdx] = count === 0 ? 0 : sum / count;
  }
  return slots;
}

function timeToFiveMinuteIndex(value: string): number | null {
  const matched = value.match(/^(\d{2}):(\d{2})$/);
  if (!matched) {
    return null;
  }

  const hh = Number(matched[1]);
  const mm = Number(matched[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 24 || mm < 0 || mm > 59) {
    return null;
  }

  const totalMinutes = hh * 60 + mm;
  if (totalMinutes < 5 || totalMinutes > 1440 || (totalMinutes - 5) % 5 !== 0) {
    return null;
  }

  const idx = (totalMinutes - 5) / 5;
  return idx >= 0 && idx < 288 ? idx : null;
}

function resolveIntertieAreas(intertieName: string): IntertieAreaDefinition {
  const exact = INTERTIE_AREA_MAP[intertieName];
  if (exact) {
    return exact;
  }

  const normalized = intertieName.replace(/\s+/g, "");
  for (const [name, areas] of Object.entries(INTERTIE_AREA_MAP)) {
    const normalizedName = name.replace(/\s+/g, "");
    if (normalized.includes(normalizedName) || normalizedName.includes(normalized)) {
      return areas;
    }
  }

  return { sourceArea: "不明", targetArea: "不明" };
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
