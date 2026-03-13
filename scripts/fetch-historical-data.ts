/**
 * One-time script to backfill ~3 years of historical OCCTO data.
 *
 * Usage:
 *   npx tsx scripts/fetch-historical-data.ts [--from=YYYY-MM-DD] [--to=YYYY-MM-DD] [--chunk-days=7] [--dry-run]
 *
 * This script invokes `npm run ingest -- --mode=backfill` in weekly chunks,
 * sleeping between chunks to avoid overloading OCCTO servers.
 *
 * Defaults:
 *   --from     3 years ago from today (JST)
 *   --to       yesterday (JST)
 *   --chunk-days  7  (number of days per ingest batch)
 *   --dry-run  print planned chunks without executing
 */

import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

type Args = {
  from: Date;
  to: Date;
  chunkDays: number;
  dryRun: boolean;
};

function parseCliArgs(argv: string[]): Args {
  const opts = new Map<string, string>();
  const flags = new Set<string>();

  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    if (eq >= 0) {
      opts.set(body.slice(0, eq), body.slice(eq + 1));
    } else {
      flags.add(body);
    }
  }

  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const jstNow = new Date(utc + 9 * 60 * 60_000);

  const yesterday = new Date(jstNow.getTime() - 24 * 60 * 60_000);
  const threeYearsAgo = new Date(Date.UTC(jstNow.getUTCFullYear() - 3, jstNow.getUTCMonth(), jstNow.getUTCDate()));

  const fromStr = opts.get("from");
  const toStr = opts.get("to");

  const from = fromStr ? parseDateArg(fromStr) : threeYearsAgo;
  const to = toStr ? parseDateArg(toStr) : yesterday;

  if (from.getTime() > to.getTime()) {
    throw new Error(`--from (${formatDate(from)}) must be before --to (${formatDate(to)})`);
  }

  const chunkDays = Number(opts.get("chunk-days") ?? "7");
  if (!Number.isFinite(chunkDays) || chunkDays < 1) {
    throw new Error("--chunk-days must be a positive integer");
  }

  return { from, to, chunkDays, dryRun: flags.has("dry-run") };
}

function parseDateArg(input: string): Date {
  const unified = input.trim().replace(/-/g, "/");
  const m = unified.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!m) throw new Error(`Invalid date: ${input}. Use YYYY-MM-DD.`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

type Chunk = { from: string; to: string; days: number };

function buildChunks(from: Date, to: Date, chunkDays: number): Chunk[] {
  const chunks: Chunk[] = [];
  const cursor = new Date(from.getTime());

  while (cursor.getTime() <= to.getTime()) {
    const chunkEnd = new Date(cursor.getTime() + (chunkDays - 1) * 24 * 60 * 60_000);
    const effectiveEnd = chunkEnd.getTime() > to.getTime() ? to : chunkEnd;
    const days = Math.round((effectiveEnd.getTime() - cursor.getTime()) / (24 * 60 * 60_000)) + 1;
    chunks.push({
      from: formatDate(cursor),
      to: formatDate(effectiveEnd),
      days,
    });
    cursor.setTime(effectiveEnd.getTime() + 24 * 60 * 60_000);
  }

  return chunks;
}

async function countExistingFiles(normalizedDir: string): Promise<Set<string>> {
  const existing = new Set<string>();
  try {
    const entries = await fs.readdir(normalizedDir);
    for (const name of entries) {
      const m = name.match(/^dashboard-(\d{8})\.json$/);
      if (m) existing.add(m[1]);
    }
  } catch {
    // directory may not exist yet
  }
  return existing;
}

function countMissingDays(chunk: Chunk, existing: Set<string>): number {
  let missing = 0;
  const cursor = parseDateArg(chunk.from);
  const end = parseDateArg(chunk.to);
  while (cursor.getTime() <= end.getTime()) {
    const stamp =
      String(cursor.getUTCFullYear()) +
      String(cursor.getUTCMonth() + 1).padStart(2, "0") +
      String(cursor.getUTCDate()).padStart(2, "0");
    if (!existing.has(stamp)) missing++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return missing;
}

async function main(): Promise<void> {
  const args = parseCliArgs(process.argv.slice(2));
  const normalizedDir = path.join(process.cwd(), "data", "normalized");
  const existing = await countExistingFiles(normalizedDir);

  const chunks = buildChunks(args.from, args.to, args.chunkDays);
  const totalDays = chunks.reduce((sum, c) => sum + c.days, 0);

  console.log(`[backfill] range: ${formatDate(args.from)} → ${formatDate(args.to)}`);
  console.log(`[backfill] total days: ${totalDays}, chunks: ${chunks.length} (${args.chunkDays} days each)`);
  console.log(`[backfill] existing files: ${existing.size}`);
  console.log(`[backfill] dry-run: ${args.dryRun}`);
  console.log();

  let completedChunks = 0;
  let totalNewFiles = 0;
  let totalSkipped = 0;
  let failedChunks = 0;

  for (const chunk of chunks) {
    const missing = countMissingDays(chunk, existing);
    completedChunks++;

    if (missing === 0) {
      totalSkipped += chunk.days;
      console.log(
        `[backfill] chunk ${completedChunks}/${chunks.length}: ${chunk.from} → ${chunk.to} — all ${chunk.days} day(s) already exist, skipping`,
      );
      continue;
    }

    console.log(
      `[backfill] chunk ${completedChunks}/${chunks.length}: ${chunk.from} → ${chunk.to} — ${missing} of ${chunk.days} day(s) to fetch`,
    );

    if (args.dryRun) {
      totalNewFiles += missing;
      continue;
    }

    const cmd = [
      "npm",
      "run",
      "ingest",
      "--",
      "--mode=backfill",
      `--from=${chunk.from}`,
      `--to=${chunk.to}`,
      "--sample=daily",
    ];

    try {
      execFileSync(cmd[0], cmd.slice(1), {
        cwd: process.cwd(),
        stdio: "inherit",
        timeout: 30 * 60 * 1000, // 30 min per chunk
      });
      totalNewFiles += missing;
    } catch (error: unknown) {
      failedChunks++;
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[backfill] chunk failed: ${chunk.from} → ${chunk.to}: ${detail}`);
      // Continue with the next chunk — partial progress is better than stopping entirely
    }

    // Sleep 10s between chunks to be polite to OCCTO servers
    if (completedChunks < chunks.length) {
      console.log("[backfill] sleeping 10s between chunks...");
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
  }

  console.log();
  console.log("[backfill] === Summary ===");
  console.log(`[backfill] chunks processed: ${completedChunks}, failed: ${failedChunks}`);
  console.log(`[backfill] new files: ${totalNewFiles}, skipped (existing): ${totalSkipped}`);
  if (args.dryRun) {
    console.log("[backfill] (dry-run mode — no data was fetched)");
  }
}

main().catch((error: unknown) => {
  console.error(`[backfill] fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
