import { promises as fs } from "node:fs";
import path from "node:path";

type FacilityType = "SS" | "CS" | "PS" | "SWS" | "UNKNOWN";

type CandidateRecord = {
  area: string;
  name: string;
  aliases?: string[];
  facilityType: FacilityType;
  query: string;
  reason: string;
};

type CandidateFile = {
  generatedAt: string;
  records: CandidateRecord[];
};

const ROOT = process.cwd();
const CANDIDATE_PATH = path.join(ROOT, "data", "master", "station-location-candidates.json");
const SHEET_PATH = path.join(ROOT, "data", "master", "station-location-research-sheet.csv");

function buildLinks(candidate: CandidateRecord): {
  googleMaps: string;
  openStreetMap: string;
  gsiAddressSearch: string;
  googleWebSearch: string;
  utilitySiteSearch: string;
} {
  const query = encodeURIComponent(candidate.query);
  const nameAreaQuery = encodeURIComponent(`${candidate.name} ${candidate.area}`);

  return {
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${query}`,
    openStreetMap: `https://www.openstreetmap.org/search?query=${query}`,
    gsiAddressSearch: `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${query}`,
    googleWebSearch: `https://www.google.com/search?q=${query}`,
    utilitySiteSearch: `https://www.google.com/search?q=site%3Aco.jp+${nameAreaQuery}`,
  };
}

function toCsvCell(value: string): string {
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}

async function main(): Promise<void> {
  const raw = await fs.readFile(CANDIDATE_PATH, "utf-8");
  const parsed = JSON.parse(raw) as CandidateFile;

  const header = [
    "area",
    "facilityType",
    "name",
    "query",
    "reason",
    "googleMaps",
    "openStreetMap",
    "gsiAddressSearch",
    "googleWebSearch",
    "utilitySiteSearch",
    "verifiedLat",
    "verifiedLon",
    "verifiedAddress",
    "source",
    "verifiedBy",
    "verifiedAt",
    "note",
  ];

  const lines = [header.join(",")];

  for (const record of parsed.records) {
    const links = buildLinks(record);
    const row = [
      record.area,
      record.facilityType,
      record.name,
      record.query,
      record.reason,
      links.googleMaps,
      links.openStreetMap,
      links.gsiAddressSearch,
      links.googleWebSearch,
      links.utilitySiteSearch,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ];
    lines.push(row.map((cell) => toCsvCell(cell)).join(","));
  }

  await fs.writeFile(SHEET_PATH, `${lines.join("\n")}\n`);
  console.log(`[geocode-manual-sheet] input_candidates=${parsed.records.length}`);
  console.log(`[geocode-manual-sheet] wrote=${SHEET_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
