/**
 * Main ingest orchestrator — CLI entry point for data refresh.
 *
 * Delegates to:
 *   - lib/constants.ts  — shared types, constants, utility functions
 *   - lib/fetchers.ts   — CSV/JSON download (Playwright)
 *   - lib/parsers.ts    — raw file parsing
 *   - lib/normalizers.ts — DashboardData assembly
 */

import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  type CliArgs,
  NoDataAvailableError,
  normalizeDate,
  defaultTodayJst,
  defaultYesterdayJst,
  compareNormalizedDate,
  fileExists,
  sleep,
} from "./lib/constants";
import { downloadCsvFiles } from "./lib/fetchers";
import { parseGenerationCsv, parseFlowCsv, parseIntertieCsv, parseReserveJson } from "./lib/parsers";
import { buildDashboardData } from "./lib/normalizers";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

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

  const sampleRaw = options.get("sample") ?? "daily";
  if (sampleRaw !== "daily" && sampleRaw !== "monthly" && sampleRaw !== "quarterly") {
    throw new Error("`--sample` must be one of: daily | monthly | quarterly.");
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
    targetDates = enumerateDateRange(from, to, sampleRaw as CliArgs["sample"]);
    if (targetDates.length === 0) {
      throw new Error("`--from` must be earlier than or equal to `--to`.");
    }
  }

  const defaultForce = modeRaw === "backfill" ? false : true;
  const force = parseBooleanOption(options.get("force"), flags, defaultForce);
  const commitEach = flags.has("commit-each");

  return {
    mode: modeRaw,
    targetDates,
    force,
    sample: sampleRaw as CliArgs["sample"],
    commitEach,
  };
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

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

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

function clampDayOfMonth(year: number, monthIndex: number, day: number): number {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Math.min(day, lastDay);
}

function enumerateDateRange(from: string, to: string, sample: CliArgs["sample"]): string[] {
  const start = toUtcDate(from);
  const end = toUtcDate(to);
  if (!start || !end || start.getTime() > end.getTime()) {
    return [];
  }
  if (sample === "daily") {
    return enumerateDailyDateRange(start, end);
  }
  if (sample === "monthly") {
    return enumerateMonthlyDateRange(start, end, 1);
  }
  return enumerateMonthlyDateRange(start, end, 3);
}

function enumerateDailyDateRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const current = new Date(start.getTime());
  while (current.getTime() <= end.getTime()) {
    dates.push(formatUtcDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function enumerateMonthlyDateRange(start: Date, end: Date, monthStep: number): string[] {
  const dates: string[] = [];
  const anchorDay = start.getUTCDate();
  const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  current.setUTCDate(clampDayOfMonth(current.getUTCFullYear(), current.getUTCMonth(), anchorDay));
  while (current.getTime() <= end.getTime()) {
    if (current.getTime() >= start.getTime()) {
      dates.push(formatUtcDate(current));
    }
    current.setUTCMonth(current.getUTCMonth() + monthStep, 1);
    current.setUTCDate(clampDayOfMonth(current.getUTCFullYear(), current.getUTCMonth(), anchorDay));
  }
  const finalDate = formatUtcDate(end);
  if (!dates.includes(finalDate)) {
    dates.push(finalDate);
  }
  return dates;
}

function gitCommitAndPush(normalizedDir: string, targetDate: string): boolean {
  try {
    const status = execFileSync("git", ["status", "--porcelain", "--", normalizedDir], {
      encoding: "utf-8",
    }).trim();
    if (!status) {
      console.log(`[ingest] no changes to commit for ${targetDate}`);
      return false;
    }
    execFileSync("git", ["add", normalizedDir], { stdio: "inherit" });
    execFileSync("git", ["commit", "-m", `chore(data): normalize ${targetDate}`], { stdio: "inherit" });
    execFileSync("git", ["push"], { stdio: "inherit" });
    console.log(`[ingest] committed and pushed data for ${targetDate}`);
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[ingest] git commit/push failed for ${targetDate}: ${detail}`);
    return false;
  }
}

async function readExistingLatestDate(normalizedDir: string): Promise<string | null> {
  try {
    const content = await fs.readFile(path.join(normalizedDir, "dashboard-latest.json"), "utf-8");
    const parsed = JSON.parse(content) as { meta?: { targetDate?: string } };
    return normalizeDate(parsed.meta?.targetDate ?? "") ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const normalizedDir = path.join(process.cwd(), "data", "normalized");
  await fs.mkdir(normalizedDir, { recursive: true });
  const existingLatest = await readExistingLatestDate(normalizedDir);

  console.log(`[ingest] mode=${args.mode}, force=${String(args.force)}`);
  console.log(`[ingest] sample=${args.sample}`);
  console.log(`[ingest] dates=${args.targetDates.join(", ")}`);

  let latestPayload = "";
  let latestDate = "";
  let updatedCount = 0;
  let skippedCount = 0;
  let noDataCount = 0;
  const newestRequestedDate = args.targetDates[args.targetDates.length - 1] ?? "";

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
    let downloadResult;
    try {
      downloadResult = await downloadCsvFiles(targetDate, rawDir);
    } catch (error: unknown) {
      if (error instanceof NoDataAvailableError) {
        noDataCount += 1;
        console.log(`[ingest] skip unpublished date ${targetDate}: ${error.message}`);
        continue;
      }
      // In backfill mode, log the error and continue to the next date
      // instead of aborting the entire batch.
      if (args.mode === "backfill") {
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`[ingest] error on ${targetDate}, skipping: ${detail}`);
        continue;
      }
      throw error;
    }
    const generationRows = await parseGenerationCsv(downloadResult.generationCsv);
    const flowRows = await parseFlowCsv(downloadResult.flowCsvByArea);
    const intertieRows = await parseIntertieCsv(downloadResult.intertieCsvByLine);
    const reserveRows = await parseReserveJson(downloadResult.reserveJson);

    const dashboard = buildDashboardData({
      targetDate,
      generationRows,
      flowRows,
      intertieRows,
      reserveRows,
      generationCsvName: path.basename(downloadResult.generationCsv),
      flowCsvName: downloadResult.flowCsvByArea.map((file) => path.basename(file)).join(","),
      intertieCsvName: downloadResult.intertieCsvByLine.map((file) => path.basename(file)).join(","),
      reserveJsonName: path.basename(downloadResult.reserveJson),
    });

    const payload = JSON.stringify(dashboard, null, 2);
    await fs.writeFile(datedOutputPath, payload, "utf-8");

    latestPayload = payload;
    latestDate = targetDate;
    updatedCount += 1;

    console.log(
      `[ingest] generated ${targetDate}: generation=${generationRows.length}, flow=${flowRows.length}, intertie=${intertieRows.length}, reserve=${reserveRows.length}`,
    );
    console.log(`[ingest] wrote ${datedOutputPath}`);

    if (args.commitEach) {
      gitCommitAndPush(normalizedDir, targetDate);
    }

    if (i < args.targetDates.length - 1) {
      await sleep(3000);
    }
  }

  let latestWritePayload = latestPayload;
  let latestWriteDate = latestDate;

  if (args.mode === "backfill" && newestRequestedDate) {
    const newestRequestedPath = path.join(normalizedDir, `dashboard-${newestRequestedDate.replaceAll("/", "")}.json`);
    if (await fileExists(newestRequestedPath)) {
      latestWritePayload = await fs.readFile(newestRequestedPath, "utf-8");
      latestWriteDate = newestRequestedDate;
    }
  }

  const shouldWriteLatest =
    latestWritePayload &&
    (args.mode !== "backfill" || !existingLatest || compareNormalizedDate(latestWriteDate, existingLatest) >= 0);

  if (shouldWriteLatest) {
    const latestOutputPath = path.join(normalizedDir, "dashboard-latest.json");
    await fs.writeFile(latestOutputPath, latestWritePayload, "utf-8");
    console.log(`[ingest] wrote ${latestOutputPath} (from ${latestWriteDate})`);
    if (args.commitEach) {
      gitCommitAndPush(normalizedDir, `latest (${latestWriteDate})`);
    }
  } else if (latestWritePayload && args.mode === "backfill") {
    console.log(
      `[ingest] preserved dashboard-latest.json (${existingLatest ?? "unknown"}) because backfill target ${latestWriteDate} is older`,
    );
  } else {
    console.log("[ingest] no new data generated");
  }

  console.log(`[ingest] summary: updated=${updatedCount}, skipped=${skippedCount}, noData=${noDataCount}`);
}

void main().catch((error) => {
  console.error("[ingest] failed");
  console.error(error);
  process.exitCode = 1;
});
