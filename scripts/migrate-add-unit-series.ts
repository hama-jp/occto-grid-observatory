/**
 * Migration script: Add unitSeries to existing dashboard JSON files.
 *
 * Older JSON files lack the `unitSeries` field that the normalizer now outputs.
 * This script backfills it from `topUnits` so that generator status labels
 * show unit-level detail (e.g. "坂出発電所 1号機") even without a full re-ingest.
 *
 * Time-series `values` will be empty (the raw CSV data is not available).
 * A full re-ingest will replace these with complete 48-slot time-series data.
 *
 * Usage:  npx tsx scripts/migrate-add-unit-series.ts
 */

import { promises as fs, readdirSync } from "node:fs";
import path from "node:path";

const NORMALIZED_DIR = path.join(process.cwd(), "data", "normalized");

interface TopUnit {
  area: string;
  plantName: string;
  unitName: string;
  sourceType: string;
  maxOutputManKw: number;
  dailyKwh: number;
}

interface UnitSeries {
  area: string;
  plantName: string;
  unitName: string;
  sourceType: string;
  dailyKwh: number;
  values: number[];
}

async function main(): Promise<void> {
  const all = readdirSync(NORMALIZED_DIR).filter((f) => f.startsWith("dashboard-") && f.endsWith(".json"));
  const sorted = all.sort().map((f) => path.join(NORMALIZED_DIR, f));

  let migratedCount = 0;
  let skippedCount = 0;

  for (const filePath of sorted) {
    const raw = await fs.readFile(filePath, "utf-8");
    const dashboard = JSON.parse(raw);
    const gen = dashboard.generation;

    if (!gen) {
      console.log(`[migrate] skip (no generation): ${path.basename(filePath)}`);
      skippedCount += 1;
      continue;
    }

    // Already has unitSeries with data — skip
    if (Array.isArray(gen.unitSeries) && gen.unitSeries.length > 0) {
      console.log(`[migrate] skip (already has unitSeries): ${path.basename(filePath)}`);
      skippedCount += 1;
      continue;
    }

    const topUnits: TopUnit[] = gen.topUnits ?? [];
    if (topUnits.length === 0) {
      console.log(`[migrate] skip (no topUnits): ${path.basename(filePath)}`);
      skippedCount += 1;
      continue;
    }

    // Build unitSeries from topUnits (no time-series values available)
    const unitSeries: UnitSeries[] = topUnits
      .sort((a, b) => b.dailyKwh - a.dailyKwh)
      .map((u) => ({
        area: u.area,
        plantName: u.plantName,
        unitName: u.unitName,
        sourceType: u.sourceType,
        dailyKwh: u.dailyKwh,
        values: [],
      }));

    gen.unitSeries = unitSeries;

    await fs.writeFile(filePath, JSON.stringify(dashboard, null, 2), "utf-8");
    migratedCount += 1;
    console.log(`[migrate] updated ${path.basename(filePath)}: ${unitSeries.length} units`);
  }

  console.log(`\n[migrate] done: migrated=${migratedCount}, skipped=${skippedCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
