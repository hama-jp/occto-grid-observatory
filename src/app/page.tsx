"use client";

import { useEffect, useState } from "react";
import { DashboardApp } from "@/components/dashboard-app";
import type { DashboardData } from "@/lib/dashboard-types";

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        if (!response.ok) {
          const body = (await response.json()) as { message?: string };
          throw new Error(body.message ?? "failed to load dashboard data");
        }

        const payload = (await response.json()) as DashboardData;
        if (alive) {
          setData(payload);
          setError(null);
        }
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : "failed to load");
        }
      }
    };

    void load();
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8f9fa] p-6">
        <section className="max-w-xl rounded-2xl border border-rose-200 bg-white p-6 text-left shadow-sm">
          <h1 className="text-xl font-semibold text-rose-700">データ未生成です</h1>
          <p className="mt-2 text-sm text-slate-700">{error}</p>
          <p className="mt-4 rounded-lg bg-slate-100 p-3 font-mono text-sm text-slate-800">
            npm run ingest
          </p>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8f9fa]">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 shadow-sm">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-teal-600" />
          <p className="text-sm text-slate-700">データを読み込み中...</p>
        </div>
      </main>
    );
  }

  return <DashboardApp data={data} />;
}
