"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, type ReactNode } from "react";
import type { DashboardData } from "@/lib/dashboard-types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const numberFmt = new Intl.NumberFormat("ja-JP");
const decimalFmt = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });

type DashboardAppProps = {
  data: DashboardData;
};

const SOURCE_COLORS = [
  "#0b525b",
  "#197278",
  "#2d6a4f",
  "#f77f00",
  "#f4a261",
  "#d62828",
  "#1d3557",
  "#6c757d",
  "#2a9d8f",
];

export function DashboardApp({ data }: DashboardAppProps) {
  const areas = useMemo(() => {
    const set = new Set<string>();
    data.generation.areaTotals.forEach((item) => set.add(item.area));
    data.flows.areaSummaries.forEach((item) => set.add(item.area));
    return ["全エリア", ...Array.from(set)];
  }, [data]);

  const [selectedArea, setSelectedArea] = useState<string>("全エリア");

  const filteredTopUnits = useMemo(
    () =>
      data.generation.topUnits.filter((unit) =>
        selectedArea === "全エリア" ? true : unit.area === selectedArea,
      ),
    [data.generation.topUnits, selectedArea],
  );

  const filteredLines = useMemo(
    () =>
      data.flows.lineSeries.filter((line) =>
        selectedArea === "全エリア" ? true : line.area === selectedArea,
      ),
    [data.flows.lineSeries, selectedArea],
  );

  const selectedFlowSummary = useMemo(() => {
    if (selectedArea === "全エリア") {
      const lineCount = data.flows.areaSummaries.reduce((sum, item) => sum + item.lineCount, 0);
      const peakAbsMw = Math.max(...data.flows.areaSummaries.map((item) => item.peakAbsMw), 0);
      const avgAbsMw =
        data.flows.areaSummaries.reduce((sum, item) => sum + item.avgAbsMw, 0) /
        Math.max(data.flows.areaSummaries.length, 1);
      return { lineCount, peakAbsMw, avgAbsMw };
    }
    return (
      data.flows.areaSummaries.find((item) => item.area === selectedArea) ?? {
        lineCount: 0,
        peakAbsMw: 0,
        avgAbsMw: 0,
      }
    );
  }, [data.flows.areaSummaries, selectedArea]);

  const selectedGenerationTotal = useMemo(() => {
    if (selectedArea === "全エリア") {
      return data.generation.areaTotals.reduce((sum, item) => sum + item.totalKwh, 0);
    }
    return data.generation.areaTotals.find((item) => item.area === selectedArea)?.totalKwh ?? 0;
  }, [data.generation.areaTotals, selectedArea]);

  const generationLineOption = useMemo(() => {
    const sourceKeys = Object.keys(data.generation.hourlyBySource[0]?.values ?? {});
    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      legend: { top: 8, textStyle: { color: "#264653" } },
      grid: { top: 48, left: 48, right: 20, bottom: 36 },
      xAxis: {
        type: "category",
        data: data.meta.slotLabels.generation,
        axisLabel: { color: "#4a5568", interval: 3 },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: "#4a5568", formatter: (v: number) => numberFmt.format(v) },
      },
      series: sourceKeys.map((source, idx) => ({
        name: source,
        type: "line",
        stack: "generation",
        smooth: true,
        areaStyle: { opacity: 0.12 },
        symbol: "none",
        lineStyle: { width: 2 },
        color: SOURCE_COLORS[idx % SOURCE_COLORS.length],
        data: data.generation.hourlyBySource.map((point) => point.values[source] ?? 0),
      })),
    };
  }, [data]);

  const sourceDonutOption = useMemo(
    () => ({
      tooltip: { trigger: "item" },
      legend: {
        orient: "vertical",
        right: 8,
        top: "center",
        textStyle: { color: "#264653" },
      },
      series: [
        {
          name: "発電方式",
          type: "pie",
          radius: ["45%", "72%"],
          center: ["35%", "50%"],
          avoidLabelOverlap: true,
          label: {
            formatter: "{b}\n{d}%",
            color: "#1b3a4b",
          },
          data: data.generation.sourceTotals.map((item, idx) => ({
            name: item.source,
            value: item.totalKwh,
            itemStyle: { color: SOURCE_COLORS[idx % SOURCE_COLORS.length] },
          })),
        },
      ],
    }),
    [data.generation.sourceTotals],
  );

  const areaTotalsOption = useMemo(
    () => ({
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      grid: { top: 18, left: 74, right: 18, bottom: 30 },
      xAxis: {
        type: "value",
        axisLabel: { formatter: (v: number) => `${Math.round(v / 1_000_000)}M` },
      },
      yAxis: {
        type: "category",
        data: data.generation.areaTotals.map((item) => item.area),
        axisLabel: { color: "#4a5568" },
      },
      series: [
        {
          type: "bar",
          data: data.generation.areaTotals.map((item, idx) => ({
            value: item.totalKwh,
            itemStyle: {
              color: idx % 2 === 0 ? "#2a9d8f" : "#1d3557",
              borderRadius: [0, 6, 6, 0],
            },
          })),
        },
      ],
    }),
    [data.generation.areaTotals],
  );

  const flowHeatmapOption = useMemo(() => {
    const topLines = filteredLines.slice(0, 18);
    const yLabels = topLines.map((line) => `${line.area} | ${line.lineName}`);
    const heatmapData: Array<[number, number, number]> = [];

    topLines.forEach((line, rowIdx) => {
      line.values.forEach((value, colIdx) => {
        heatmapData.push([colIdx, rowIdx, Math.round(value)]);
      });
    });

    return {
      tooltip: {
        position: "top",
        formatter: (params: { data: [number, number, number] }) => {
          const [col, row, value] = params.data;
          return `${yLabels[row]}<br/>${data.meta.slotLabels.flow[col]}: ${numberFmt.format(value)} MW`;
        },
      },
      grid: { top: 20, left: 160, right: 20, bottom: 44 },
      xAxis: {
        type: "category",
        data: data.meta.slotLabels.flow,
        splitArea: { show: true },
        axisLabel: { interval: 3 },
      },
      yAxis: {
        type: "category",
        data: yLabels,
        splitArea: { show: true },
      },
      visualMap: {
        min: -800,
        max: 800,
        calculable: true,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        inRange: {
          color: ["#0b132b", "#1c2541", "#4f772d", "#f77f00", "#d62828"],
        },
      },
      series: [
        {
          name: "潮流",
          type: "heatmap",
          data: heatmapData,
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: "rgba(0, 0, 0, 0.35)",
            },
          },
        },
      ],
    };
  }, [data.meta.slotLabels.flow, filteredLines]);

  const flowNetworkOption = useMemo(() => {
    const ranked = [...filteredLines]
      .filter((line) => parseDirection(line.positiveDirection) !== null)
      .sort((a, b) => Math.abs(b.avgMw) - Math.abs(a.avgMw));
    const targetEdgeCount = selectedArea === "全エリア" ? 120 : 180;
    const targetLines = ranked.slice(0, targetEdgeCount);

    const nodeArea = new Map<string, string>();
    const nodeDegree = new Map<string, number>();
    const linkRows: Array<{
      source: string;
      target: string;
      value: number;
      absAvgMw: number;
      area: string;
      lineName: string;
      voltageKv: string;
      positiveDirection: string;
      peakAbsMw: number;
    }> = [];

    targetLines.forEach((line) => {
      const direction = parseDirection(line.positiveDirection);
      if (!direction) {
        return;
      }
      const source = line.avgMw >= 0 ? direction.source : direction.target;
      const target = line.avgMw >= 0 ? direction.target : direction.source;
      const absAvgMw = Math.abs(line.avgMw);

      nodeArea.set(source, nodeArea.get(source) ?? line.area);
      nodeArea.set(target, nodeArea.get(target) ?? line.area);
      nodeDegree.set(source, (nodeDegree.get(source) ?? 0) + 1);
      nodeDegree.set(target, (nodeDegree.get(target) ?? 0) + 1);

      linkRows.push({
        source,
        target,
        value: line.avgMw,
        absAvgMw,
        area: line.area,
        lineName: line.lineName,
        voltageKv: line.voltageKv,
        positiveDirection: line.positiveDirection,
        peakAbsMw: line.peakAbsMw,
      });
    });

    const maxAbsFlow = Math.max(...linkRows.map((line) => line.absAvgMw), 0);
    const areaCategories = Array.from(new Set(Array.from(nodeArea.values()))).sort();
    const categoryIndex = new Map(areaCategories.map((area, index) => [area, index]));

    const nodes = Array.from(nodeArea.entries()).map(([name, area]) => {
      const degree = nodeDegree.get(name) ?? 0;
      return {
        id: name,
        name,
        category: categoryIndex.get(area) ?? 0,
        value: degree,
        symbolSize: 16 + Math.min(16, degree * 2.2),
      };
    });

    const links = linkRows.map((line) => {
      const ratio = maxAbsFlow > 0 ? line.absAvgMw / maxAbsFlow : 0;
      return {
        ...line,
        lineStyle: {
          width: 1.4 + ratio * 5.6,
          opacity: 0.76,
          color: line.value >= 0 ? "#ef8354" : "#1d3557",
        },
      };
    });

    return {
      tooltip: {
        trigger: "item",
        confine: true,
        formatter: (params: {
          dataType: "node" | "edge";
          name: string;
          data: {
            value: number;
            area: string;
            lineName: string;
            voltageKv: string;
            positiveDirection: string;
            peakAbsMw: number;
          };
        }) => {
          if (params.dataType === "edge") {
            return `${params.data.area} | ${params.data.lineName}<br/>定義方向: ${
              params.data.positiveDirection
            }<br/>平均潮流: ${decimalFmt.format(params.data.value)} MW<br/>最大|潮流|: ${numberFmt.format(
              params.data.peakAbsMw,
            )} MW<br/>電圧: ${params.data.voltageKv}`;
          }
          return `${params.name}<br/>接続本数: ${numberFmt.format(params.data.value)} 本`;
        },
      },
      legend: [
        {
          type: "scroll",
          top: 8,
          data: areaCategories,
          textStyle: { color: "#334155" },
        },
      ],
      series: [
        {
          type: "graph",
          layout: "force",
          roam: true,
          draggable: true,
          data: nodes,
          links,
          categories: areaCategories.map((name) => ({ name })),
          force: {
            repulsion: 270,
            edgeLength: [70, 190],
            gravity: 0.08,
          },
          edgeSymbol: ["none", "arrow"],
          edgeSymbolSize: [4, 10],
          lineStyle: {
            curveness: 0.16,
            opacity: 0.76,
          },
          label: {
            show: true,
            position: "right",
            color: "#1f2937",
            fontSize: 11,
          },
          emphasis: {
            focus: "adjacency",
          },
        },
      ],
    };
  }, [filteredLines, selectedArea]);

  const syncLineOption = useMemo(() => {
    const generationSeries = data.generation.hourlyTotalByArea.map((point) =>
      selectedArea === "全エリア"
        ? Object.values(point.values).reduce((sum, value) => sum + value, 0)
        : (point.values[selectedArea] ?? 0),
    );
    const flowSeries = data.flows.hourlyAbsByArea.map((point) =>
      selectedArea === "全エリア"
        ? average(Object.values(point.values))
        : (point.values[selectedArea] ?? 0),
    );

    return {
      tooltip: { trigger: "axis" },
      legend: { top: 8 },
      grid: { top: 44, left: 52, right: 56, bottom: 36 },
      xAxis: {
        type: "category",
        data: data.meta.slotLabels.flow,
        axisLabel: { interval: 3 },
      },
      yAxis: [
        {
          type: "value",
          name: "発電量(kWh)",
          axisLabel: { formatter: (v: number) => `${Math.round(v / 1_000)}k` },
        },
        {
          type: "value",
          name: "平均|潮流|(MW)",
          axisLabel: { formatter: (v: number) => `${Math.round(v)}` },
        },
      ],
      series: [
        {
          name: "発電量",
          type: "line",
          smooth: true,
          symbol: "none",
          lineStyle: { width: 2.5, color: "#2a9d8f" },
          areaStyle: { color: "rgba(42,157,143,.12)" },
          data: generationSeries,
        },
        {
          name: "平均|潮流|",
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          symbol: "none",
          lineStyle: { width: 2.5, color: "#e76f51" },
          areaStyle: { color: "rgba(231,111,81,.12)" },
          data: flowSeries,
        },
      ],
    };
  }, [data, selectedArea]);

  const areaBalanceOption = useMemo(
    () => ({
      tooltip: {
        formatter: (params: { data: [number, number, number, string] }) => {
          const [dailyKwh, peakAbsMw, stress, area] = params.data;
          return `${area}<br/>日量: ${numberFmt.format(dailyKwh)} kWh<br/>最大|潮流|: ${numberFmt.format(
            peakAbsMw,
          )} MW<br/>Stress: ${stress}`;
        },
      },
      xAxis: {
        name: "日量発電(kWh)",
        axisLabel: { formatter: (v: number) => `${Math.round(v / 1_000_000)}M` },
      },
      yAxis: {
        name: "最大|潮流|(MW)",
      },
      series: [
        {
          type: "scatter",
          symbolSize: (value: [number, number, number]) => 12 + value[2] * 3,
          itemStyle: { color: "#1d3557" },
          data: data.insights.areaBalance.map((item) => [
            item.dailyKwh,
            item.peakAbsMw,
            item.stressIndex,
            item.area,
          ]),
        },
      ],
    }),
    [data.insights.areaBalance],
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#f4f1de_0%,_#f6f8fb_38%,_#e9f5f2_100%)] text-slate-800">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-4 py-6 md:px-8">
        <header className="rounded-3xl border border-white/70 bg-white/80 px-5 py-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs tracking-[0.18em] text-teal-700">OCCTO GRID OBSERVATORY</p>
              <h1 className="text-2xl font-semibold leading-tight md:text-3xl">
                送電潮流 × ユニット発電実績 ダッシュボード
              </h1>
              <p className="text-sm text-slate-600">
                対象日: {data.meta.targetDate} / 最終取り込み:{" "}
                {new Date(data.meta.fetchedAt).toLocaleString("ja-JP")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="area" className="text-sm font-medium text-slate-600">
                エリア
              </label>
              <select
                id="area"
                className="rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                value={selectedArea}
                onChange={(event) => setSelectedArea(event.target.value)}
              >
                {areas.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <MetricCard label="対象エリア発電日量" value={`${numberFmt.format(selectedGenerationTotal)} kWh`} />
          <MetricCard label="対象線路本数" value={`${numberFmt.format(selectedFlowSummary.lineCount)} 本`} />
          <MetricCard label="最大|潮流|" value={`${numberFmt.format(selectedFlowSummary.peakAbsMw)} MW`} />
          <MetricCard label="平均|潮流|" value={`${decimalFmt.format(selectedFlowSummary.avgAbsMw)} MW`} />
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel title="発電方式別 30分推移" className="lg:col-span-2">
            <ReactECharts option={generationLineOption} style={{ height: 360 }} />
          </Panel>
          <Panel title="発電方式 構成比">
            <ReactECharts option={sourceDonutOption} style={{ height: 360 }} />
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="エリア別 日量発電">
            <ReactECharts option={areaTotalsOption} style={{ height: 320 }} />
          </Panel>
          <Panel title="発電と潮流の同期トレンド">
            <ReactECharts option={syncLineOption} style={{ height: 320 }} />
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4">
          <Panel title="エリアネットワーク潮流（平均値ベース）">
            <ReactECharts option={flowNetworkOption} style={{ height: 540 }} />
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel title="主要線路の潮流ヒートマップ" className="lg:col-span-2">
            <ReactECharts option={flowHeatmapOption} style={{ height: 420 }} />
          </Panel>
          <Panel title="エリア負荷バランス">
            <ReactECharts option={areaBalanceOption} style={{ height: 420 }} />
          </Panel>
        </section>

        <section className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">高発電ユニット上位</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-3">エリア</th>
                  <th className="py-2 pr-3">発電所</th>
                  <th className="py-2 pr-3">ユニット</th>
                  <th className="py-2 pr-3">方式</th>
                  <th className="py-2 text-right">日量(kWh)</th>
                </tr>
              </thead>
              <tbody>
                {filteredTopUnits.slice(0, 24).map((unit) => (
                  <tr key={`${unit.area}-${unit.plantName}-${unit.unitName}`} className="border-b border-slate-100">
                    <td className="py-2 pr-3">{unit.area}</td>
                    <td className="py-2 pr-3">{unit.plantName}</td>
                    <td className="py-2 pr-3">{unit.unitName}</td>
                    <td className="py-2 pr-3">{unit.sourceType}</td>
                    <td className="py-2 text-right">{numberFmt.format(unit.dailyKwh)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 md:text-xl">{value}</p>
    </article>
  );
}

function Panel({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`rounded-3xl border border-white/70 bg-white/90 p-4 shadow-sm ${className ?? ""}`}>
      <h2 className="mb-2 text-base font-semibold text-slate-800">{title}</h2>
      {children}
    </section>
  );
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseDirection(
  rawDirection: string,
): {
  source: string;
  target: string;
} | null {
  const normalized = rawDirection.replace(/\s+/g, " ").trim();
  const delimiter = normalized.includes("→") ? "→" : normalized.includes("->") ? "->" : null;
  if (!delimiter) {
    return null;
  }

  const parts = normalized.split(delimiter).map((part) => part.trim());
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    return null;
  }

  return { source: parts[0], target: parts[1] };
}
