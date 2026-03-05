import { promises as fs } from "node:fs";
import path from "node:path";
import { DashboardApp } from "@/components/dashboard-app";
import type { DashboardData } from "@/lib/dashboard-types";

async function loadLatestDashboardData(): Promise<DashboardData> {
  const filePath = path.join(process.cwd(), "data", "normalized", "dashboard-latest.json");
  const content = await fs.readFile(filePath, "utf-8");
  return JSON.parse(content) as DashboardData;
}

async function loadLatestDashboardDataSafe(): Promise<
  | {
      ok: true;
      data: DashboardData;
    }
  | {
      ok: false;
      message: string;
    }
> {
  try {
    const data = await loadLatestDashboardData();
    return { ok: true, data };
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

  return <DashboardApp data={result.data} />;
}
