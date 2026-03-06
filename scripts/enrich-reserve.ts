import { promises as fs } from "node:fs";
import path from "node:path";
import type { AreaReserveSeries, DashboardData } from "../src/lib/dashboard-types";

const NORMALIZED_DIR = path.join(process.cwd(), "data", "normalized");
const DASHBOARD_PATTERN = /^dashboard-(\d{8})\.json$/;

const AREA_CODE_MAP = new Map([
  ["01", "北海道"],
  ["02", "東北"],
  ["03", "東京"],
  ["04", "中部"],
  ["05", "北陸"],
  ["06", "関西"],
  ["07", "中国"],
  ["08", "四国"],
  ["09", "九州"],
  ["10", "沖縄"],
]);

async function main(): Promise<void> {
  const entries = await fs.readdir(NORMALIZED_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && DASHBOARD_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "en"));

  for (const fileName of files) {
    const filePath = path.join(NORMALIZED_DIR, fileName);
    const content = await fs.readFile(filePath, "utf-8");
    const dashboard = JSON.parse(content) as DashboardData;
    const reserveRows = await fetchReserveSeries(dashboard.meta.targetDate);
    dashboard.reserves = { areaSeries: reserveRows };
    dashboard.meta.sources = {
      ...dashboard.meta.sources,
      reserveJson: `reserve-${dashboard.meta.targetDate.replaceAll("/", "")}.json`,
    };
    await fs.writeFile(filePath, JSON.stringify(dashboard, null, 2), "utf-8");
    console.log(`[enrich-reserve] updated ${fileName}`);
    await sleep(600);
  }

  const latestPath = path.join(NORMALIZED_DIR, "dashboard-latest.json");
  try {
    const latestContent = await fs.readFile(latestPath, "utf-8");
    const latestDashboard = JSON.parse(latestContent) as DashboardData;
    const reserveRows = await fetchReserveSeries(latestDashboard.meta.targetDate);
    latestDashboard.reserves = { areaSeries: reserveRows };
    latestDashboard.meta.sources = {
      ...latestDashboard.meta.sources,
      reserveJson: `reserve-${latestDashboard.meta.targetDate.replaceAll("/", "")}.json`,
    };
    await fs.writeFile(latestPath, JSON.stringify(latestDashboard, null, 2), "utf-8");
    console.log(`[enrich-reserve] updated dashboard-latest.json`);
  } catch {
    // no-op
  }
}

async function fetchReserveSeries(targetDate: string): Promise<AreaReserveSeries[]> {
  const encodedDate = encodeURIComponent(targetDate);
  const response = await fetch(`https://web-kohyo.occto.or.jp/kks-web-public/home/dailyData?inputDate=${encodedDate}`, {
    headers: {
      accept: "application/json, text/plain, */*",
    },
  });
  if (!response.ok) {
    throw new Error(`reserve endpoint returned ${response.status} for ${targetDate}`);
  }

  const payload = (await response.json()) as {
    todayAreaRsvRateList?: Array<{
      areaCd: string;
      areaRsvRateItems?: Array<{
        koikJyyu?: number;
        koikKyu?: number;
        koikRsv?: number;
        koikRsvRate?: number;
        koikSyuRate?: number;
        areaJyyu?: number;
        areaKyu?: number;
        areaRsv?: number;
        areaRsvRate?: number;
        areaSyuRate?: number;
      }>;
    }>;
  };

  return (payload.todayAreaRsvRateList ?? [])
    .map((row) => {
      const area = AREA_CODE_MAP.get(row.areaCd);
      if (!area || !row.areaRsvRateItems?.length) {
        return null;
      }
      return {
        area,
        demandMw: row.areaRsvRateItems.map((item) => roundTo(item.areaJyyu ?? 0, 3)),
        supplyMw: row.areaRsvRateItems.map((item) => roundTo(item.areaKyu ?? 0, 3)),
        reserveMw: row.areaRsvRateItems.map((item) => roundTo(item.areaRsv ?? 0, 3)),
        reserveRate: row.areaRsvRateItems.map((item) => roundTo(item.areaRsvRate ?? 0, 2)),
        usageRate: row.areaRsvRateItems.map((item) => roundTo(item.areaSyuRate ?? 0, 2)),
        blockDemandMw: row.areaRsvRateItems.map((item) => roundTo(item.koikJyyu ?? 0, 3)),
        blockSupplyMw: row.areaRsvRateItems.map((item) => roundTo(item.koikKyu ?? 0, 3)),
        blockReserveMw: row.areaRsvRateItems.map((item) => roundTo(item.koikRsv ?? 0, 3)),
        blockReserveRate: row.areaRsvRateItems.map((item) => roundTo(item.koikRsvRate ?? 0, 2)),
        blockUsageRate: row.areaRsvRateItems.map((item) => roundTo(item.koikSyuRate ?? 0, 2)),
      } satisfies AreaReserveSeries;
    })
    .filter((row): row is AreaReserveSeries => row !== null);
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[enrich-reserve] failed: ${message}`);
  process.exitCode = 1;
});
