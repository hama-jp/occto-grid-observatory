import { promises as fs } from "node:fs";
import path from "node:path";

type FacilityType = "SS" | "CS" | "PS" | "SWS" | "UNKNOWN";

type CandidateRecord = {
  area: string;
  name: string;
  facilityType: FacilityType;
  query: string;
  reason: string;
};

type CandidateFile = {
  generatedAt: string;
  records: CandidateRecord[];
};

type TriageBucket = "quick_win" | "manual_hard" | "ask_user";

type TriageRecord = CandidateRecord & {
  bucket: TriageBucket;
  rationale: string;
};

const ROOT = process.cwd();
const CANDIDATE_PATH = path.join(ROOT, "data", "master", "station-location-candidates.json");
const TRIAGE_PATH = path.join(ROOT, "data", "master", "station-location-triage.json");

function hasSubstationLikeSuffix(name: string): boolean {
  return /(発電所|変電所|開閉所|変換所)$/u.test(name);
}

function isSymbolicNode(name: string): boolean {
  const compact = name.replace(/\s+/g, "");
  return /[0-9０-９]+T$/iu.test(compact) || compact.includes("分岐点") || compact === "電名";
}

function classify(row: CandidateRecord): TriageRecord {
  if (isSymbolicNode(row.name)) {
    return {
      ...row,
      bucket: "ask_user",
      rationale: "系統上の記号/分岐点の可能性が高く、公開情報だけで設備を一意特定しづらい",
    };
  }

  if (row.facilityType === "UNKNOWN" && !hasSubstationLikeSuffix(row.name)) {
    return {
      ...row,
      bucket: "manual_hard",
      rationale: "設備種別が不明で同名候補が複数出やすい。一次情報の裏取りが必要",
    };
  }

  return {
    ...row,
    bucket: "quick_win",
    rationale: "設備種別が判別できるため、地図検索と一次情報照合で解決しやすい",
  };
}

async function main(): Promise<void> {
  const raw = await fs.readFile(CANDIDATE_PATH, "utf-8");
  const parsed = JSON.parse(raw) as CandidateFile;

  const triaged = parsed.records.map(classify);

  const counts = {
    total: triaged.length,
    quickWin: triaged.filter((r) => r.bucket === "quick_win").length,
    manualHard: triaged.filter((r) => r.bucket === "manual_hard").length,
    askUser: triaged.filter((r) => r.bucket === "ask_user").length,
  };

  const askUserTop = triaged
    .filter((r) => r.bucket === "ask_user")
    .slice(0, 15)
    .map((r) => ({ area: r.area, name: r.name, facilityType: r.facilityType, rationale: r.rationale }));

  await fs.writeFile(
    TRIAGE_PATH,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceGeneratedAt: parsed.generatedAt,
        counts,
        askUserTop,
        records: triaged,
      },
      null,
      2,
    ),
  );

  console.log(`[geocode-triage] total=${counts.total} quick_win=${counts.quickWin} manual_hard=${counts.manualHard} ask_user=${counts.askUser}`);
  console.log(`[geocode-triage] wrote=${TRIAGE_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
