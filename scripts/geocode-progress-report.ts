import { promises as fs } from "node:fs";
import path from "node:path";

type Db = { records?: Array<{ confidence?: string }> };
type Candidates = { records?: Array<{ facilityType?: string }> };

const ROOT = process.cwd();
const DB_PATH = path.join(ROOT, "data", "master", "station-location-db.json");
const CANDIDATE_PATH = path.join(ROOT, "data", "master", "station-location-candidates.json");

async function main(): Promise<void> {
  const db = JSON.parse(await fs.readFile(DB_PATH, "utf8")) as Db;
  const cand = JSON.parse(await fs.readFile(CANDIDATE_PATH, "utf8")) as Candidates;

  const verified = db.records?.length ?? 0;
  const unresolved = cand.records?.length ?? 0;
  const total = verified + unresolved;
  const coverage = total === 0 ? 0 : (verified / total) * 100;

  const byType = (cand.records ?? []).reduce<Record<string, number>>((acc, r) => {
    const k = r.facilityType ?? "UNKNOWN";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`[geocode-progress] verified=${verified} unresolved=${unresolved} total=${total} coverage=${coverage.toFixed(1)}%`);
  console.log(`[geocode-progress] unresolved_by_type=${JSON.stringify(byType)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
