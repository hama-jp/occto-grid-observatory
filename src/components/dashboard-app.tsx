"use client";

import dynamic from "next/dynamic";
import { useMemo, useState, type ReactNode } from "react";
import type { DashboardData } from "@/lib/dashboard-types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const numberFmt = new Intl.NumberFormat("ja-JP");
const decimalFmt = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });
const manKwFmt = new Intl.NumberFormat("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

const FLOW_AREA_COLORS: Record<string, string> = {
  北海道: "#355070",
  東北: "#4f6d7a",
  東京: "#f77f00",
  中部: "#2a9d8f",
  北陸: "#3a86ff",
  関西: "#f4a261",
  中国: "#bc4749",
  四国: "#6a4c93",
  九州: "#e76f51",
  沖縄: "#00afb9",
  default: "#577590",
};

const AREA_ANCHORS: Record<string, { x: number; y: number }> = {
  北海道: { x: 860, y: 110 },
  東北: { x: 780, y: 195 },
  東京: { x: 815, y: 295 },
  中部: { x: 715, y: 350 },
  北陸: { x: 695, y: 265 },
  関西: { x: 625, y: 410 },
  中国: { x: 510, y: 435 },
  四国: { x: 560, y: 505 },
  九州: { x: 430, y: 545 },
  沖縄: { x: 245, y: 625 },
  default: { x: 660, y: 360 },
};

const MAP_CORRIDOR_ORDER = ["沖縄", "九州", "中国", "関西", "中部", "東京", "東北", "北海道"];
const MAP_VIEWBOX = {
  width: 1080,
  height: 700,
  padding: 36,
};

export function DashboardApp({ data }: DashboardAppProps) {
  const areas = useMemo(() => {
    const set = new Set<string>();
    data.generation.areaTotals.forEach((item) => set.add(item.area));
    data.flows.areaSummaries.forEach((item) => set.add(item.area));
    return ["全エリア", ...Array.from(set)];
  }, [data]);
  const generationAreas = useMemo(
    () => ["全エリア", ...data.generation.areaTotals.map((item) => item.area)],
    [data.generation.areaTotals],
  );

  const [selectedArea, setSelectedArea] = useState<string>("全エリア");
  const [generationTrendArea, setGenerationTrendArea] = useState<string>("全エリア");
  const [sourceDonutArea, setSourceDonutArea] = useState<string>("全エリア");

  const sourceTotalsByArea = useMemo(() => {
    const byArea: Record<string, Array<{ source: string; totalKwh: number }>> = {};
    const areaSeries = data.generation.hourlyBySourceByArea ?? {};

    for (const [area, points] of Object.entries(areaSeries)) {
      const totals = new Map<string, number>();
      points.forEach((point) => {
        Object.entries(point.values).forEach(([source, value]) => {
          totals.set(source, (totals.get(source) ?? 0) + value);
        });
      });
      byArea[area] = Array.from(totals.entries())
        .map(([source, totalKwh]) => ({ source, totalKwh }))
        .sort((a, b) => b.totalKwh - a.totalKwh);
    }

    return byArea;
  }, [data.generation.hourlyBySourceByArea]);

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

  const generationLineOption = useMemo(() => {
    const scopedSeries =
      generationTrendArea === "全エリア"
        ? data.generation.hourlyBySource
        : (data.generation.hourlyBySourceByArea?.[generationTrendArea] ?? []);
    const fallbackKeys = Object.keys(data.generation.hourlyBySource[0]?.values ?? {});
    const sourceKeys = Object.keys(scopedSeries[0]?.values ?? {}).length
      ? Object.keys(scopedSeries[0]?.values ?? {})
      : fallbackKeys;

    return {
      backgroundColor: "transparent",
      tooltip: { trigger: "axis" },
      legend: {
        type: "scroll",
        top: 8,
        textStyle: { color: "#264653" },
        formatter: (name: string) => normalizeSourceName(name),
      },
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
      graphic:
        sourceKeys.length > 0
          ? undefined
          : [
              {
                type: "text",
                left: "center",
                top: "middle",
                style: {
                  text: "このエリアの発電方式別データはありません",
                  fill: "#475569",
                  font: "14px sans-serif",
                },
                silent: true,
              },
            ],
      series: sourceKeys.map((source, idx) => ({
        name: normalizeSourceName(source),
        type: "line",
        stack: "generation",
        smooth: true,
        areaStyle: { opacity: 0.12 },
        symbol: "none",
        lineStyle: { width: 2 },
        color: SOURCE_COLORS[idx % SOURCE_COLORS.length],
        data: scopedSeries.map((point) => point.values[source] ?? 0),
      })),
    };
  }, [data.generation.hourlyBySource, data.generation.hourlyBySourceByArea, data.meta.slotLabels.generation, generationTrendArea]);

  const sourceDonutOption = useMemo(() => {
    const rows =
      sourceDonutArea === "全エリア"
        ? data.generation.sourceTotals
        : (sourceTotalsByArea[sourceDonutArea] ?? []);

    return {
      tooltip: { trigger: "item" },
      legend: {
        type: "scroll",
        orient: "vertical",
        left: "58%",
        top: "middle",
        bottom: 8,
        itemGap: 10,
        textStyle: { color: "#264653" },
        formatter: (name: string) => normalizeSourceName(name),
      },
      series: [
        {
          name: "発電方式",
          type: "pie",
          radius: ["45%", "72%"],
          center: ["30%", "50%"],
          avoidLabelOverlap: true,
          label: {
            formatter: (params: { percent?: number; name: string }) => {
              const percent = params.percent ?? 0;
              if (percent < 4) {
                return "";
              }
              return `${normalizeSourceName(params.name)}\n${percent.toFixed(0)}%`;
            },
            color: "#1b3a4b",
          },
          labelLine: {
            length: 10,
            length2: 8,
          },
          data: rows.map((item, idx) => ({
            name: normalizeSourceName(item.source),
            value: item.totalKwh,
            itemStyle: { color: SOURCE_COLORS[idx % SOURCE_COLORS.length] },
          })),
        },
      ],
    };
  }, [data.generation.sourceTotals, sourceDonutArea, sourceTotalsByArea]);

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

      if (!nodeArea.has(source)) {
        nodeArea.set(source, line.area);
      }
      if (!nodeArea.has(target)) {
        nodeArea.set(target, line.area);
      }
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
    const areaCategories = Array.from(new Set(Array.from(nodeArea.values()))).sort(compareAreaOrder);
    const categoryIndex = new Map(areaCategories.map((area, index) => [area, index]));

    const nodes = Array.from(nodeArea.entries()).map(([name, area]) => {
      const degree = nodeDegree.get(name) ?? 0;
      const anchor = AREA_ANCHORS[area] ?? AREA_ANCHORS.default;
      const offset = getNodeOffset(`${area}-${name}`, 22 + Math.min(16, degree * 1.6));
      return {
        id: name,
        name,
        area,
        category: categoryIndex.get(area) ?? 0,
        value: degree,
        x: clamp(anchor.x + offset.dx, MAP_VIEWBOX.padding, MAP_VIEWBOX.width - MAP_VIEWBOX.padding),
        y: clamp(anchor.y + offset.dy, MAP_VIEWBOX.padding, MAP_VIEWBOX.height - MAP_VIEWBOX.padding),
        symbolSize: 11 + Math.min(16, degree * 1.9),
        itemStyle: {
          color: FLOW_AREA_COLORS[area] ?? FLOW_AREA_COLORS.default,
          borderColor: "#ffffff",
          borderWidth: 1,
        },
      };
    });

    const links = linkRows.map((line) => {
      const ratio = maxAbsFlow > 0 ? line.absAvgMw / maxAbsFlow : 0;
      const sourceArea = nodeArea.get(line.source) ?? line.area;
      const targetArea = nodeArea.get(line.target) ?? line.area;
      const crossArea = line.source !== line.target && sourceArea !== targetArea;
      return {
        ...line,
        lineStyle: {
          width: 1.2 + ratio * 5.4,
          curveness: crossArea ? 0.2 : 0.08,
          opacity: 0.72,
          color: line.value >= 0 ? "#ef8354" : "#1d3557",
        },
      };
    });

    const guideGraphics = buildJapanGuideGraphics(areaCategories);

    return {
      animationDurationUpdate: 420,
      tooltip: {
        trigger: "item",
        confine: true,
        formatter: (params: {
          dataType: "node" | "edge";
          name: string;
          data: {
            value: number;
            area?: string;
            lineName?: string;
            voltageKv?: string;
            positiveDirection?: string;
            peakAbsMw?: number;
          };
        }) => {
          if (params.dataType === "edge") {
            return `${params.data.area} | ${params.data.lineName}<br/>定義方向: ${
              params.data.positiveDirection
            }<br/>平均潮流: ${decimalFmt.format(params.data.value)} MW<br/>最大|潮流|: ${numberFmt.format(
              params.data.peakAbsMw ?? 0,
            )} MW<br/>電圧: ${params.data.voltageKv}`;
          }
          return `${params.data.area ?? "不明"} | ${params.name}<br/>接続本数: ${numberFmt.format(
            params.data.value,
          )} 本`;
        },
      },
      legend: [
        {
          type: "scroll",
          top: 10,
          data: areaCategories,
          textStyle: { color: "#334155" },
        },
      ],
      graphic: guideGraphics,
      series: [
        {
          type: "graph",
          layout: "none",
          roam: true,
          draggable: true,
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          data: nodes,
          links,
          categories: areaCategories.map((name) => ({
            name,
            itemStyle: { color: FLOW_AREA_COLORS[name] ?? FLOW_AREA_COLORS.default },
          })),
          edgeSymbol: ["none", "arrow"],
          edgeSymbolSize: [3, 9],
          lineStyle: {
            opacity: 0.72,
          },
          label: {
            show: selectedArea !== "全エリア",
            formatter: (params: { data: { value: number }; name: string }) =>
              params.data.value >= 3 ? params.name : "",
            position: "right",
            color: "#1f2937",
            fontSize: 10,
            backgroundColor: "rgba(255,255,255,0.65)",
            borderRadius: 4,
            padding: [1, 3],
          },
          emphasis: {
            focus: "adjacency",
            label: {
              show: true,
            },
            lineStyle: {
              opacity: 0.94,
            },
          },
        },
      ],
    };
  }, [filteredLines, selectedArea]);

  const interAreaFlowOption = useMemo(() => {
    const baseRows = data.flows.interAreaFlows ?? [];
    const filteredRows = baseRows
      .filter((row) =>
        selectedArea === "全エリア" ? true : row.sourceArea === selectedArea || row.targetArea === selectedArea,
      )
      .slice(0, selectedArea === "全エリア" ? 12 : 20);
    const hasData = filteredRows.length > 0;

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: Array<{ data: { row: (typeof filteredRows)[number] } }>) => {
          const row = params[0]?.data?.row;
          if (!row) {
            return "";
          }
          return `${row.sourceArea} ⇄ ${row.targetArea}<br/>平均|潮流|: ${decimalFmt.format(
            row.avgAbsMw,
          )} MW<br/>平均潮流(符号付): ${decimalFmt.format(row.avgMw)} MW<br/>最大|潮流|: ${numberFmt.format(
            row.peakAbsMw,
          )} MW<br/>連系線: ${row.intertieNames.join(" / ")}`;
        },
      },
      grid: { top: 20, left: 128, right: 20, bottom: 24 },
      xAxis: {
        type: "value",
        axisLabel: { formatter: (value: number) => `${Math.round(value)} MW` },
      },
      yAxis: {
        type: "category",
        inverse: true,
        data: filteredRows.map((row) => `${row.sourceArea} ⇄ ${row.targetArea}`),
        axisLabel: { color: "#334155", fontSize: 11 },
      },
      graphic: hasData
        ? undefined
        : [
            {
              type: "text",
              left: "center",
              top: "middle",
              style: {
                text: "連系線潮流実績データが未取得です",
                fill: "#475569",
                font: "14px sans-serif",
              },
              silent: true,
            },
          ],
      series: [
        {
          type: "bar",
          barWidth: 14,
          data: filteredRows.map((row) => ({
            value: row.avgAbsMw,
            row,
            itemStyle: {
              color: FLOW_AREA_COLORS[row.sourceArea] ?? FLOW_AREA_COLORS.default,
              borderRadius: [0, 5, 5, 0],
            },
          })),
          label: {
            show: true,
            position: "right",
            formatter: (params: { data: { row: (typeof filteredRows)[number] } }) =>
              `${decimalFmt.format(params.data.row.avgMw)} MW`,
            color: "#334155",
            fontSize: 10,
          },
        },
      ],
    };
  }, [data.flows.interAreaFlows, selectedArea]);

  const intertieTrendOption = useMemo(() => {
    const scopedSeries = (data.flows.intertieSeries ?? []).filter((row) =>
      selectedArea === "全エリア" ? true : row.sourceArea === selectedArea || row.targetArea === selectedArea,
    );
    const topSeries = [...scopedSeries]
      .sort((a, b) => b.avgAbsMw - a.avgAbsMw)
      .slice(0, selectedArea === "全エリア" ? 6 : 8);
    const hasData = topSeries.length > 0;

    const netImportSeries =
      selectedArea === "全エリア"
        ? null
        : data.meta.slotLabels.flow.map((_, idx) => {
            let sum = 0;
            for (const row of scopedSeries) {
              const value = row.values[idx] ?? 0;
              if (row.sourceArea === selectedArea) {
                sum -= value;
              }
              if (row.targetArea === selectedArea) {
                sum += value;
              }
            }
            return roundTo(sum, 1);
          });

    return {
      tooltip: {
        trigger: "axis",
        valueFormatter: (value: number) => `${decimalFmt.format(value)} MW`,
      },
      legend: {
        top: 10,
        type: "scroll",
        textStyle: { color: "#334155" },
      },
      grid: { top: 58, left: 52, right: 20, bottom: 34 },
      xAxis: {
        type: "category",
        data: data.meta.slotLabels.flow,
        axisLabel: { interval: 3 },
      },
      yAxis: {
        type: "value",
        name: "潮流実績(MW)",
      },
      graphic: hasData
        ? undefined
        : [
            {
              type: "text",
              left: "center",
              top: "middle",
              style: {
                text: "連系線潮流実績データが未取得です",
                fill: "#475569",
                font: "14px sans-serif",
              },
              silent: true,
            },
          ],
      series: [
        ...(netImportSeries
          ? [
              {
                name: `${selectedArea} 純流入(+)`,
                type: "line",
                data: netImportSeries,
                smooth: true,
                symbol: "none",
                lineStyle: { width: 3, color: "#111827", type: "dashed" },
              },
            ]
          : []),
        ...topSeries.map((row) => ({
          name: `${row.sourceArea}→${row.targetArea}`,
          type: "line",
          data: row.values,
          smooth: true,
          symbol: "none",
          lineStyle: {
            width: 2.3,
            color: FLOW_AREA_COLORS[row.sourceArea] ?? FLOW_AREA_COLORS.default,
          },
        })),
      ],
    };
  }, [data.flows.intertieSeries, data.meta.slotLabels.flow, selectedArea]);

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

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel title="発電方式別 30分推移" className="lg:col-span-2">
            <div className="mb-2 flex justify-end">
              <label htmlFor="generation-area" className="mr-2 text-sm text-slate-600">
                表示エリア
              </label>
              <select
                id="generation-area"
                className="rounded-lg border border-teal-200 bg-white px-2 py-1 text-sm focus:border-teal-500 focus:outline-none"
                value={generationTrendArea}
                onChange={(event) => setGenerationTrendArea(event.target.value)}
              >
                {generationAreas.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>
            <ReactECharts option={generationLineOption} style={{ height: 360 }} />
          </Panel>
          <Panel title="発電方式 構成比">
            <div className="mb-2 flex justify-end">
              <label htmlFor="source-donut-area" className="mr-2 text-sm text-slate-600">
                表示エリア
              </label>
              <select
                id="source-donut-area"
                className="rounded-lg border border-teal-200 bg-white px-2 py-1 text-sm focus:border-teal-500 focus:outline-none"
                value={sourceDonutArea}
                onChange={(event) => setSourceDonutArea(event.target.value)}
              >
                {generationAreas.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </div>
            <ReactECharts option={sourceDonutOption} style={{ height: 360 }} />
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="エリア別 日量発電">
            <ReactECharts option={areaTotalsOption} style={{ height: 320 }} />
          </Panel>
          <Panel title="連系線潮流トレンド（時系列）">
            <ReactECharts option={intertieTrendOption} style={{ height: 320 }} />
          </Panel>
        </section>

        <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel title="エリアネットワーク潮流（日本地図近似）" className="lg:col-span-2">
            <ReactECharts option={flowNetworkOption} style={{ height: 620 }} />
          </Panel>
          <Panel title="エリア間連系潮流（実績）">
            <ReactECharts option={interAreaFlowOption} style={{ height: 620 }} />
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
                  <th className="py-2 text-right">最大出力(万kW)</th>
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
                    <td className="py-2 text-right">
                      {typeof unit.maxOutputManKw === "number" ? manKwFmt.format(unit.maxOutputManKw) : "-"}
                    </td>
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

function compareAreaOrder(a: string, b: string): number {
  const aIndex = MAP_CORRIDOR_ORDER.indexOf(a);
  const bIndex = MAP_CORRIDOR_ORDER.indexOf(b);
  if (aIndex === -1 && bIndex === -1) {
    return a.localeCompare(b, "ja-JP");
  }
  if (aIndex === -1) {
    return 1;
  }
  if (bIndex === -1) {
    return -1;
  }
  return aIndex - bIndex;
}

function buildJapanGuideGraphics(areas: string[]): Array<Record<string, unknown>> {
  const visibleAreaSet = new Set(areas);
  const graphics: Array<Record<string, unknown>> = [];

  const corridorPoints = MAP_CORRIDOR_ORDER.filter((area) => visibleAreaSet.has(area)).map((area) => {
    const anchor = AREA_ANCHORS[area] ?? AREA_ANCHORS.default;
    return [anchor.x, anchor.y];
  });

  if (corridorPoints.length >= 2) {
    graphics.push({
      type: "polyline",
      z: 0,
      shape: { points: corridorPoints },
      style: { stroke: "rgba(96,165,250,0.35)", lineWidth: 26, lineCap: "round", lineJoin: "round" },
      silent: true,
    });
    graphics.push({
      type: "polyline",
      z: 1,
      shape: { points: corridorPoints },
      style: { stroke: "rgba(255,255,255,0.9)", lineWidth: 14, lineCap: "round", lineJoin: "round" },
      silent: true,
    });
  }

  const branchPairs: Array<[string, string]> = [
    ["北陸", "中部"],
    ["四国", "関西"],
    ["四国", "中国"],
  ];
  branchPairs.forEach(([from, to]) => {
    if (!visibleAreaSet.has(from) || !visibleAreaSet.has(to)) {
      return;
    }
    const fromAnchor = AREA_ANCHORS[from] ?? AREA_ANCHORS.default;
    const toAnchor = AREA_ANCHORS[to] ?? AREA_ANCHORS.default;
    graphics.push({
      type: "line",
      z: 0,
      shape: { x1: fromAnchor.x, y1: fromAnchor.y, x2: toAnchor.x, y2: toAnchor.y },
      style: { stroke: "rgba(96,165,250,0.28)", lineWidth: 18, lineCap: "round" },
      silent: true,
    });
    graphics.push({
      type: "line",
      z: 1,
      shape: { x1: fromAnchor.x, y1: fromAnchor.y, x2: toAnchor.x, y2: toAnchor.y },
      style: { stroke: "rgba(255,255,255,0.9)", lineWidth: 9, lineCap: "round" },
      silent: true,
    });
  });

  areas.forEach((area) => {
    const anchor = AREA_ANCHORS[area] ?? AREA_ANCHORS.default;
    graphics.push(
      {
        type: "circle",
        z: 2,
        shape: { cx: anchor.x, cy: anchor.y, r: 6 },
        style: { fill: FLOW_AREA_COLORS[area] ?? FLOW_AREA_COLORS.default, stroke: "#ffffff", lineWidth: 2 },
        silent: true,
      },
      {
        type: "text",
        z: 2,
        style: {
          x: anchor.x + 10,
          y: anchor.y - 10,
          text: area,
          fill: "#1e293b",
          font: "12px sans-serif",
          textBackgroundColor: "rgba(255,255,255,0.75)",
          padding: [2, 4],
          borderRadius: 4,
        },
        silent: true,
      },
    );
  });

  graphics.push({
    type: "text",
    z: 2,
    style: {
      x: 16,
      y: 42,
      text: "日本地図の位置関係を近似した配置（厳密座標ではありません）",
      fill: "#475569",
      font: "12px sans-serif",
    },
    silent: true,
  });

  return graphics;
}

function getNodeOffset(seedText: string, maxRadius: number): { dx: number; dy: number } {
  const hash = hashSeed(seedText);
  const angle = ((hash % 360) * Math.PI) / 180;
  const radius = 8 + ((hash >> 8) % Math.max(12, Math.floor(maxRadius)));
  return {
    dx: Math.cos(angle) * radius,
    dy: Math.sin(angle) * radius * 0.74,
  };
}

function hashSeed(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function normalizeSourceName(source: string): string {
  const trimmed = source.trim();
  return trimmed.length > 0 ? trimmed : "不明";
}

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
