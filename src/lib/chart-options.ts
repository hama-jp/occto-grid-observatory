/**
 * ECharts option builders — pure functions that construct chart configurations.
 *
 * Extracting these from the component body keeps the dashboard-app lean
 * and makes the chart logic independently testable.
 */

import { FLOW_AREA_COLORS, SOURCE_COLORS, SOURCE_COLOR_MAP } from "./constants";
import {
  numberFmt,
  decimalFmt,
  normalizeSourceName,
  formatCompactEnergy,
  roundTo,
} from "./formatters";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Standard "no data" watermark graphic element for ECharts. */
export function emptyGraphic(text: string) {
  return [
    {
      type: "text",
      left: "center",
      top: "middle",
      style: { text, fill: "#475569", font: "14px sans-serif" },
      silent: true,
    },
  ];
}

/** Responsive grid config shared across most charts. */
export function responsiveGrid(
  isMobile: boolean,
  overrides?: Partial<{ top: number; left: number; right: number; bottom: number }>,
) {
  return {
    top: overrides?.top ?? (isMobile ? 48 : 60),
    left: overrides?.left ?? (isMobile ? 52 : 64),
    right: overrides?.right ?? (isMobile ? 10 : 20),
    bottom: overrides?.bottom ?? (isMobile ? 48 : 34),
  };
}

/** Responsive x-axis for time-series charts. */
export function timeXAxis(labels: string[], isMobile: boolean) {
  return {
    type: "category" as const,
    data: labels,
    axisLabel: {
      interval: isMobile ? 5 : 3,
      fontSize: isMobile ? 10 : 12,
      rotate: isMobile ? 30 : 0,
      hideOverlap: true,
    },
  };
}

/** Responsive visualMap for heatmap charts (mobile: horizontal bottom / desktop: vertical right). */
export function heatmapVisualMap(
  isMobile: boolean,
  options: {
    min: number;
    max: number;
    colors: string[];
    text?: [string, string];
  },
) {
  const base = {
    min: options.min,
    max: options.max,
    inRange: { color: options.colors },
    ...(options.text ? { text: options.text } : {}),
  };
  return isMobile
    ? { ...base, calculable: false, orient: "horizontal" as const, left: "center", bottom: 0, itemWidth: 12, itemHeight: 80 }
    : { ...base, calculable: true, orient: "vertical" as const, right: 0, top: 0 };
}

/** Shared heatmap series config. */
export function heatmapSeries(name: string, data: Array<[number, number, number]>) {
  return {
    name,
    type: "heatmap" as const,
    data,
    emphasis: { itemStyle: { shadowBlur: 10, shadowColor: "rgba(0, 0, 0, 0.35)" } },
  };
}

// ---------------------------------------------------------------------------
// Reserve trend
// ---------------------------------------------------------------------------

export type ReserveAreaRow = {
  area: string;
  reserveRate: number[];
};

export function buildReserveTrendOption(
  scopedSeries: ReserveAreaRow[],
  slotLabels: string[],
  isMobile: boolean,
  selectedArea: string,
) {
  const hasData = scopedSeries.length > 0;
  return {
    tooltip: {
      trigger: "axis",
      valueFormatter: (value: number) => `${decimalFmt.format(value)} %`,
    },
    legend: { top: 8, type: "scroll", textStyle: { color: "#334155" } },
    grid: responsiveGrid(isMobile),
    xAxis: timeXAxis(slotLabels, isMobile),
    yAxis: {
      type: "value",
      name: "予備率(%)",
      nameLocation: "middle",
      nameGap: isMobile ? 34 : 42,
      nameTextStyle: { color: "#64748b", fontSize: isMobile ? 10 : 11 },
      axisLabel: { formatter: (value: number) => decimalFmt.format(value) },
    },
    graphic: hasData ? undefined : emptyGraphic("予備率データが未取得です"),
    series: scopedSeries.map((item) => ({
      name: item.area,
      type: "line",
      smooth: true,
      symbol: "none",
      lineStyle: {
        width: selectedArea === "全エリア" ? 2.1 : 3,
        color: FLOW_AREA_COLORS[item.area] ?? FLOW_AREA_COLORS.default,
      },
      data: item.reserveRate,
    })),
  };
}

// ---------------------------------------------------------------------------
// Demand bar (current snapshot)
// ---------------------------------------------------------------------------

export type DemandRow = {
  area: string;
  demandMw: number;
  supplyMw: number;
  usageRate: number;
};

export function buildDemandCurrentOption(
  rows: DemandRow[],
  isMobile: boolean,
  dateTimeLabel: string,
) {
  const sorted = [...rows].sort((a, b) => b.demandMw - a.demandMw);
  const hasData = sorted.length > 0;

  return {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: Array<{ data: { row: DemandRow } }>) => {
        const row = params[0]?.data?.row;
        if (!row) return "";
        return `${row.area}<br/>表示日時: ${dateTimeLabel}<br/>需要: ${decimalFmt.format(row.demandMw)} MW<br/>供給力: ${decimalFmt.format(row.supplyMw)} MW<br/>使用率: ${decimalFmt.format(row.usageRate)}%`;
      },
    },
    grid: { top: 18, left: isMobile ? 56 : 74, right: 18, bottom: 30 },
    xAxis: { type: "value", name: "MW" },
    yAxis: { type: "category", inverse: true, data: sorted.map((r) => r.area) },
    graphic: hasData ? undefined : emptyGraphic("需要データが未取得です"),
    series: [
      {
        type: "bar",
        barWidth: 14,
        data: sorted.map((row) => ({
          value: row.demandMw,
          row,
          itemStyle: {
            color: FLOW_AREA_COLORS[row.area] ?? FLOW_AREA_COLORS.default,
            borderRadius: [0, 6, 6, 0],
          },
        })),
        label: {
          show: true,
          position: "right",
          formatter: (params: { data: { row: DemandRow } }) =>
            `${decimalFmt.format(params.data.row.demandMw)} MW`,
          fontSize: 10,
          color: "#334155",
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Reserve bar (current snapshot)
// ---------------------------------------------------------------------------

export type ReserveRow = DemandRow & {
  reserveMw: number;
  reserveRate: number;
};

export function buildReserveCurrentOption(
  rows: ReserveRow[],
  isMobile: boolean,
  dateTimeLabel: string,
) {
  const sorted = [...rows].sort((a, b) => a.reserveRate - b.reserveRate);
  const hasData = sorted.length > 0;

  return {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: Array<{ data: { row: ReserveRow } }>) => {
        const row = params[0]?.data?.row;
        if (!row) return "";
        return `${row.area}<br/>表示日時: ${dateTimeLabel}<br/>予備力: ${decimalFmt.format(row.reserveMw)} MW<br/>予備率: ${decimalFmt.format(row.reserveRate)}%`;
      },
    },
    grid: { top: 18, left: isMobile ? 56 : 74, right: 18, bottom: 30 },
    xAxis: { type: "value", name: "%" },
    yAxis: { type: "category", inverse: true, data: sorted.map((r) => r.area) },
    graphic: hasData ? undefined : emptyGraphic("予備率データが未取得です"),
    series: [
      {
        type: "bar",
        barWidth: 14,
        data: sorted.map((row) => ({
          value: row.reserveRate,
          row,
          itemStyle: {
            color: FLOW_AREA_COLORS[row.area] ?? FLOW_AREA_COLORS.default,
            borderRadius: [0, 6, 6, 0],
          },
        })),
        label: {
          show: true,
          position: "right",
          formatter: (params: { data: { row: ReserveRow } }) =>
            `${decimalFmt.format(params.data.row.reserveMw)} MW (${decimalFmt.format(params.data.row.reserveRate)}%)`,
          fontSize: 10,
          color: "#334155",
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Generation line (stacked area by source)
// ---------------------------------------------------------------------------

export function buildGenerationLineOption(
  scopedSeries: Array<{ values: Record<string, number> }>,
  slotLabels: string[],
  sourceKeys: string[],
  sourceColorByName: Map<string, string>,
  isMobile: boolean,
) {
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis", valueFormatter: (value: number) => `${numberFmt.format(value)} MW` },
    legend: {
      type: "scroll",
      top: 8,
      textStyle: { color: "#264653" },
      formatter: (name: string) => normalizeSourceName(name),
    },
    grid: responsiveGrid(isMobile, { top: isMobile ? 40 : 48, bottom: isMobile ? 48 : 36 }),
    xAxis: {
      type: "category",
      data: slotLabels,
      axisLabel: {
        color: "#4a5568",
        interval: isMobile ? 5 : 3,
        fontSize: isMobile ? 10 : 12,
        rotate: isMobile ? 30 : 0,
        hideOverlap: true,
      },
    },
    yAxis: {
      type: "value",
      name: "発電量(MW)",
      nameLocation: "middle",
      nameGap: isMobile ? 36 : 44,
      nameTextStyle: { color: "#64748b", fontSize: isMobile ? 10 : 11 },
      axisLabel: { color: "#4a5568", formatter: (v: number) => numberFmt.format(v) },
    },
    graphic:
      sourceKeys.length > 0
        ? undefined
        : emptyGraphic("このエリアの発電方式別データはありません"),
    series: sourceKeys.map((source, idx) => ({
      name: normalizeSourceName(source),
      type: "line",
      stack: "generation",
      smooth: true,
      areaStyle: { opacity: 0.12 },
      symbol: "none",
      lineStyle: { width: 2 },
      color: sourceColorByName.get(source) ?? SOURCE_COLOR_MAP[source] ?? SOURCE_COLORS[idx % SOURCE_COLORS.length],
      data: scopedSeries.map((point) => point.values[source] ?? 0),
    })),
  };
}

// ---------------------------------------------------------------------------
// Source donut
// ---------------------------------------------------------------------------

export type SourceCompositionItem = {
  name: string;
  totalKwh: number;
  percent: number;
  color: string;
};

export function buildSourceDonutOption(items: SourceCompositionItem[], useInlineLegend: boolean) {
  return {
    tooltip: { trigger: "item", valueFormatter: (value: number) => formatCompactEnergy(value) },
    series: [
      {
        name: "発電方式",
        type: "pie",
        radius: useInlineLegend ? ["44%", "74%"] : ["38%", "60%"],
        center: useInlineLegend ? ["50%", "50%"] : ["50%", "42%"],
        avoidLabelOverlap: true,
        label: { show: false, color: "#1b3a4b", fontSize: useInlineLegend ? 12 : 11 },
        labelLine: { show: false },
        emphasis: {
          scale: true,
          label: {
            show: true,
            formatter: (params: { percent?: number; name: string }) =>
              `${normalizeSourceName(params.name)}\n${decimalFmt.format(params.percent ?? 0)}%`,
            fontSize: 13,
            fontWeight: 600,
          },
        },
        data: items.map((item) => ({
          name: item.name,
          value: item.totalKwh,
          itemStyle: { color: item.color },
        })),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Area totals bar
// ---------------------------------------------------------------------------

export function buildAreaTotalsOption(
  areaTotals: Array<{ area: string; totalKwh: number }>,
  isMobile: boolean,
) {
  const sorted = [...areaTotals].sort((a, b) => b.totalKwh - a.totalKwh);
  return {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (value: number) => `${decimalFmt.format(value / 1_000_000)} GWh`,
    },
    grid: { top: 18, left: isMobile ? 56 : 74, right: 18, bottom: 30 },
    xAxis: {
      type: "value",
      name: "GWh",
      axisLabel: { formatter: (v: number) => `${decimalFmt.format(v / 1_000_000)}` },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: sorted.map((item) => item.area),
      axisLabel: { color: "#4a5568" },
    },
    series: [
      {
        type: "bar",
        data: sorted.map((item, idx) => ({
          value: item.totalKwh,
          itemStyle: {
            color: idx % 2 === 0 ? "#2a9d8f" : "#1d3557",
            borderRadius: [0, 6, 6, 0],
          },
        })),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Inter-area flow bar
// ---------------------------------------------------------------------------

export type InterAreaFlowTextRow = {
  sourceArea: string;
  targetArea: string;
  upMw: number;
  downMw: number;
  magnitudeMw: number;
  intertieNames: string[];
};

export function buildInterAreaFlowOption(
  textRows: InterAreaFlowTextRow[],
  isMobile: boolean,
  dateTimeLabel: string,
) {
  const rows = textRows.map((row) => {
    const signedMw = roundTo(row.upMw - row.downMw, 1);
    return { ...row, signedMw, absMw: Math.abs(signedMw) };
  });
  const hasData = rows.length > 0;
  const maxAbsSignedMw = Math.max(...rows.map((r) => r.absMw), 1);
  const axisLimit = Math.max(10, Math.ceil(maxAbsSignedMw * 1.12));
  const showDirectionLabels = !isMobile;

  return {
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: Array<{ data: { row: (typeof rows)[number] } }>) => {
        const row = params[0]?.data?.row;
        if (!row) return "";
        return `${row.sourceArea} ⇄ ${row.targetArea}<br/>表示日時: ${dateTimeLabel}<br/>潮流: ${decimalFmt.format(row.signedMw)} MW<br/>${decimalFmt.format(row.upMw)}MW ↑ / ${decimalFmt.format(row.downMw)}MW ↓<br/>連系線: ${row.intertieNames.join(" / ")}`;
      },
    },
    grid: {
      top: 20,
      left: isMobile ? 88 : 124,
      right: isMobile ? 12 : 20,
      bottom: isMobile ? 56 : 40,
    },
    xAxis: {
      type: "value",
      min: -axisLimit,
      max: axisLimit,
      splitNumber: isMobile ? 4 : 6,
      name: "MW",
      nameLocation: "middle",
      nameGap: isMobile ? 34 : 28,
      nameTextStyle: { color: "#64748b", fontSize: isMobile ? 10 : 11 },
      axisLabel: {
        formatter: (value: number) => `${Math.round(value)}`,
        rotate: isMobile ? 28 : 18,
        hideOverlap: true,
        fontSize: isMobile ? 10 : 11,
      },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: rows.map((r) => `${r.sourceArea} ⇄ ${r.targetArea}`),
      axisLabel: { color: "#334155", fontSize: isMobile ? 10 : 11 },
    },
    graphic: hasData ? undefined : emptyGraphic("連系線潮流実績データが未取得です"),
    series: [
      {
        type: "bar",
        barWidth: 14,
        data: rows.map((row) => ({
          value: row.signedMw,
          row,
          itemStyle: {
            color:
              row.signedMw >= 0
                ? (FLOW_AREA_COLORS[row.sourceArea] ?? FLOW_AREA_COLORS.default)
                : (FLOW_AREA_COLORS[row.targetArea] ?? FLOW_AREA_COLORS.default),
            borderRadius: row.signedMw >= 0 ? [0, 5, 5, 0] : [5, 0, 0, 5],
          },
        })),
        label: {
          show: showDirectionLabels,
          position: (params: { value: number }) => (params.value >= 0 ? "right" : "left"),
          formatter: (params: { data: { row: (typeof rows)[number] } }) =>
            `${decimalFmt.format(params.data.row.upMw)}MW ↑  ${decimalFmt.format(params.data.row.downMw)}MW ↓`,
          color: "#334155",
          fontSize: 10,
        },
        markLine: {
          silent: true,
          symbol: ["none", "none"],
          lineStyle: { color: "#64748b", type: "dashed", width: 1 },
          data: [{ xAxis: 0 }],
        },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Intertie trend
// ---------------------------------------------------------------------------

export type IntertieTrendRow = {
  sourceArea: string;
  targetArea: string;
  avgAbsMw: number;
  values: number[];
};

export function buildIntertieTrendOption(
  scopedSeries: IntertieTrendRow[],
  slotLabels: string[],
  isMobile: boolean,
  selectedArea: string,
  netImportSeries: number[] | null,
) {
  const topSeries = [...scopedSeries]
    .sort((a, b) => b.avgAbsMw - a.avgAbsMw)
    .slice(0, selectedArea === "全エリア" ? 6 : 8);
  const hasData = topSeries.length > 0;

  return {
    tooltip: {
      trigger: "axis",
      valueFormatter: (value: number) => `${decimalFmt.format(value)} MW`,
    },
    legend: { top: 10, type: "scroll", textStyle: { color: "#334155" } },
    grid: responsiveGrid(isMobile, { top: isMobile ? 48 : 58 }),
    xAxis: timeXAxis(slotLabels, isMobile),
    yAxis: {
      type: "value",
      name: "潮流実績(MW)",
      nameLocation: "middle",
      nameGap: isMobile ? 34 : 42,
      nameTextStyle: { color: "#64748b", fontSize: isMobile ? 10 : 11 },
    },
    graphic: hasData ? undefined : emptyGraphic("連系線潮流実績データが未取得です"),
    series: [
      ...(netImportSeries
        ? [
            {
              name: `${selectedArea} 純流入(+)`,
              type: "line",
              data: netImportSeries,
              smooth: true,
              symbol: "none",
              color: "#111827",
              lineStyle: { width: 3, color: "#111827", type: "dashed" },
            },
          ]
        : []),
      ...topSeries.map((row) => {
        const color = FLOW_AREA_COLORS[row.sourceArea] ?? FLOW_AREA_COLORS.default;
        return {
          name: `${row.sourceArea}→${row.targetArea}`,
          type: "line",
          data: row.values,
          smooth: true,
          symbol: "none",
          color,
          lineStyle: { width: 2.3, color },
        };
      }),
    ],
  };
}

// ---------------------------------------------------------------------------
// Flow heatmap
// ---------------------------------------------------------------------------

type LineSeriesLike = {
  area: string;
  lineName: string;
  values: number[];
};

export function buildFlowHeatmapOption(
  filteredLines: LineSeriesLike[],
  flowSlotLabels: string[],
  isMobile: boolean,
) {
  const topLines = filteredLines.slice(0, 18);
  const yLabels = topLines.map((line) =>
    isMobile ? line.lineName.slice(0, 6) : `${line.area} | ${line.lineName}`,
  );
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
        return `${yLabels[row]}<br/>${flowSlotLabels[col]}: ${numberFmt.format(value)} MW`;
      },
    },
    grid: { top: 20, left: isMobile ? 60 : 160, right: isMobile ? 10 : 80, bottom: isMobile ? 46 : 20 },
    xAxis: { type: "category", data: flowSlotLabels, splitArea: { show: true }, axisLabel: { interval: 3 } },
    yAxis: { type: "category", data: yLabels, splitArea: { show: true } },
    visualMap: heatmapVisualMap(isMobile, {
      min: -800, max: 800,
      colors: ["#0b132b", "#1c2541", "#4f772d", "#f77f00", "#d62828"],
    }),
    series: [heatmapSeries("潮流", heatmapData)],
  };
}

// ---------------------------------------------------------------------------
// Volatility heatmap
// ---------------------------------------------------------------------------

export function buildVolatilityHeatmapOption(
  filteredLines: LineSeriesLike[],
  flowSlotLabels: string[],
  isMobile: boolean,
) {
  const scored = filteredLines
    .map((line) => {
      const vals = line.values;
      const n = vals.length;
      if (n === 0) return null;
      const meanAbs = vals.reduce((s, v) => s + Math.abs(v), 0) / n;
      if (meanAbs < 1) return null;
      const mean = vals.reduce((s, v) => s + v, 0) / n;
      const stdDev = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
      const cv = stdDev / meanAbs;
      return { ...line, cv, mean, stdDev, meanAbs };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.cv - a.cv)
    .slice(0, 18);

  const yLabels = scored.map((l) =>
    isMobile
      ? `${l.lineName.slice(0, 6)} CV${(l.cv * 100).toFixed(0)}%`
      : `${l.area} | ${l.lineName}  (CV ${(l.cv * 100).toFixed(0)}%)`,
  );

  const heatmapData: Array<[number, number, number]> = [];
  scored.forEach((line, rowIdx) => {
    line.values.forEach((value, colIdx) => {
      const pctDev = ((value - line.mean) / line.meanAbs) * 100;
      heatmapData.push([colIdx, rowIdx, Math.round(pctDev)]);
    });
  });

  return {
    tooltip: {
      position: "top",
      formatter: (params: { data: [number, number, number] }) => {
        const [col, row, pct] = params.data;
        const line = scored[row];
        const rawMw = line ? Math.round(line.values[col]) : 0;
        return [
          `<b>${yLabels[row]}</b>`,
          `${flowSlotLabels[col]}`,
          `潮流: ${numberFmt.format(rawMw)} MW`,
          `平均比偏差: ${pct > 0 ? "+" : ""}${pct}%`,
        ].join("<br/>");
      },
    },
    grid: { top: 20, left: isMobile ? 60 : 220, right: isMobile ? 10 : 80, bottom: isMobile ? 46 : 20 },
    xAxis: { type: "category", data: flowSlotLabels, splitArea: { show: true }, axisLabel: { interval: 3 } },
    yAxis: { type: "category", data: yLabels, splitArea: { show: true }, axisLabel: { fontSize: 11 } },
    visualMap: heatmapVisualMap(isMobile, {
      min: -150, max: 150,
      colors: ["#1d4877", "#4a7fb5", "#98d1d1", "#fcfcfc", "#f4a261", "#e76f51", "#9b2226"],
      text: ["+150%", "−150%"],
    }),
    series: [heatmapSeries("変動率", heatmapData)],
  };
}

// ---------------------------------------------------------------------------
// Generator status — treemap
// ---------------------------------------------------------------------------

import type { GeneratorTreemapItem, GeneratorStatusItem } from "./dashboard-computations";

export function buildGeneratorTreemapOption(
  items: GeneratorTreemapItem[],
  isMobile: boolean,
): Record<string, unknown> {
  if (items.length === 0) {
    return { graphic: emptyGraphic("発電機データなし") };
  }

  // Group by area
  const byArea = new Map<string, GeneratorTreemapItem[]>();
  items.forEach((item) => {
    const list = byArea.get(item.area) ?? [];
    list.push(item);
    byArea.set(item.area, list);
  });

  const children = Array.from(byArea.entries()).map(([area, plants]) => ({
    name: area,
    itemStyle: {
      borderColor: FLOW_AREA_COLORS[area] ?? FLOW_AREA_COLORS.default,
      borderWidth: 3,
      gapWidth: 2,
    },
    children: plants.map((p) => ({
      name: p.plantName,
      value: p.dailyKwh,
      itemStyle: {
        color: p.color,
        borderColor: "rgba(255,255,255,0.4)",
        borderWidth: 1,
      },
      sourceType: p.sourceType,
      area: p.area,
    })),
  }));

  return {
    tooltip: {
      backgroundColor: "rgba(30,41,59,0.95)",
      borderColor: "transparent",
      textStyle: { color: "#f1f5f9", fontSize: 12 },
      formatter: (params: { name: string; value: number; data: { area?: string; sourceType?: string } }) => {
        const { name, value, data } = params;
        if (!data.sourceType) return `<b>${name}</b>`;
        return `<div style="font-size:12px"><b>${data.area}</b><br/>${name}<br/>${data.sourceType}<br/>${formatCompactEnergy(value)}</div>`;
      },
    },
    series: [
      {
        type: "treemap",
        roam: false,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        nodeClick: false,
        breadcrumb: { show: false },
        label: {
          show: true,
          formatter: "{b}",
          fontSize: isMobile ? 9 : 11,
          color: "#fff",
          textShadowBlur: 3,
          textShadowColor: "rgba(0,0,0,0.5)",
        },
        upperLabel: {
          show: true,
          height: isMobile ? 20 : 24,
          fontSize: isMobile ? 10 : 12,
          fontWeight: "bold",
          color: "#fff",
          textShadowBlur: 2,
          textShadowColor: "rgba(0,0,0,0.4)",
          backgroundColor: "transparent",
        },
        levels: [
          {
            itemStyle: {
              borderColor: "rgba(100,116,139,0.3)",
              borderWidth: 4,
              gapWidth: 4,
            },
          },
          {
            itemStyle: {
              borderColor: "rgba(255,255,255,0.3)",
              borderWidth: 2,
              gapWidth: 2,
            },
            colorSaturation: [0.5, 0.8],
          },
        ],
        data: children,
        animationDurationUpdate: 800,
        animationEasing: "cubicInOut",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Generator status — per-area stacked area chart (time-series)
// ---------------------------------------------------------------------------

export type AreaGenerationSeries = {
  /** Series label — plant name or source type */
  name: string;
  /** Color for this series */
  color: string;
  /** 48 values (one per 30-min slot) */
  data: number[];
};

export function buildAreaGenerationTimeSeriesOption(
  seriesList: AreaGenerationSeries[],
  slotLabels: string[],
  areaColor: string,
  isMobile: boolean,
): Record<string, unknown> {
  if (seriesList.length === 0 || slotLabels.length === 0) {
    return { graphic: emptyGraphic("データなし") };
  }

  return {
    animation: true,
    animationDuration: 500,
    animationEasing: "cubicOut",
    backgroundColor: "transparent",
    grid: {
      top: 6,
      left: isMobile ? 40 : 48,
      right: 4,
      bottom: 20,
      containLabel: false,
    },
    xAxis: {
      type: "category",
      data: slotLabels,
      show: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        show: true,
        fontSize: 9,
        color: "#94a3b8",
        interval: (_index: number, value: string) =>
          value === "06:00" || value === "12:00" || value === "18:00",
      },
    },
    yAxis: {
      type: "value",
      show: true,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: "#e2e8f0", opacity: 0.4 } },
      axisLabel: {
        show: true,
        fontSize: isMobile ? 8 : 9,
        color: "#94a3b8",
        formatter: (v: number) => {
          if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
          if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
          return String(v);
        },
      },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(30,41,59,0.95)",
      borderColor: "transparent",
      textStyle: { color: "#f1f5f9", fontSize: 11 },
      formatter: (params: Array<{ seriesName: string; value: number; marker: string; dataIndex: number }>) => {
        const slot = slotLabels[params[0]?.dataIndex ?? 0] ?? "";
        const lines = params
          .filter((p) => p.value > 0)
          .map((p) => `${p.marker} ${p.seriesName}: ${numberFmt.format(p.value)} kWh`);
        return `<div style="font-size:11px;max-height:260px;overflow-y:auto"><b>${slot}</b><br/>${lines.join("<br/>")}</div>`;
      },
    },
    series: seriesList.map((s) => ({
      name: s.name,
      type: "line",
      smooth: true,
      symbol: "none",
      lineStyle: { width: 1.5 },
      color: s.color,
      data: s.data,
      emphasis: { focus: "series" },
    })),
  };
}

// Re-export congestion builders from dedicated module for backwards compatibility
export {
  buildCongestionData,
  buildCongestionTrendOption,
  buildCongestionHeatmapOption,
  type CongestionLine,
  type CongestionSummary,
} from "./chart-options-congestion";
