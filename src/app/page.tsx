import { promises as fs } from "node:fs";
import path from "node:path";
import { DashboardApp } from "@/components/dashboard-app";
import type { DashboardData } from "@/lib/dashboard-types";

const NORMALIZED_DIR = path.join(process.cwd(), "data", "normalized");

async function loadLatestDashboardData(): Promise<DashboardData> {
  const filePath = path.join(NORMALIZED_DIR, "dashboard-latest.json");
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content) as DashboardData;
}

async function loadAvailableDashboardDates(): Promise<string[]> {
  const entries = await fs.readdir(NORMALIZED_DIR, { withFileTypes: true });
  const dateStamps = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name.match(/^dashboard-(\d{8})\.json$/)?.[1] ?? null)
    .filter((stamp): stamp is string => stamp !== null);

  return Array.from(new Set(dateStamps))
    .sort((a, b) => b.localeCompare(a, "en"))
    .map((stamp) => `${stamp.slice(0, 4)}/${stamp.slice(4, 6)}/${stamp.slice(6, 8)}`);
}

async function loadLatestDashboardDataSafe(): Promise<
  | {
      ok: true;
      data: DashboardData;
      availableDates: string[];
    }
  | {
      ok: false;
      message: string;
    }
> {
  try {
    const [data, availableDates] = await Promise.all([loadLatestDashboardData(), loadAvailableDashboardDates()]);
    return { ok: true, data, availableDates };
  } catch (error: unknown) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "failed to load dashboard data",
    };
  }
}

export default async function Home() {
  const result = await loadLatestDashboardDataSafe();

  if (!result.ok) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8f9fa] p-6">
        <section className="max-w-xl rounded-2xl border border-rose-200 bg-white p-6 text-left shadow-sm">
          <h1 className="text-xl font-semibold text-rose-700">データ未生成です</h1>
          <p className="mt-2 text-sm text-slate-700">{result.message}</p>
          <p className="mt-4 rounded-lg bg-slate-100 p-3 font-mono text-sm text-slate-800">
            npm run ingest
          </p>
        </section>
      </main>
    );
  }

  return <DashboardApp initialData={result.data} availableDates={result.availableDates} />;
}
