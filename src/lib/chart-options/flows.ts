/**
 * ECharts option builders for inter-area flow / intertie / heatmap charts.
 */

import { FLOW_AREA_COLORS } from "../constants";
import { numberFmt, decimalFmt, roundTo } from "../formatters";
import { chartColors, emptyGraphic, heatmapSeries, heatmapVisualMap, responsiveGrid, timeXAxis } from "./shared";

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
  isDark = false,
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
      nameTextStyle: { color: chartColors(isDark).axisName, fontSize: isMobile ? 10 : 11 },
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
      axisLabel: { color: chartColors(isDark).label, fontSize: isMobile ? 10 : 11 },
    },
    graphic: hasData ? undefined : emptyGraphic("連系線潮流実績データが未取得です", isDark),
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
          color: chartColors(isDark).label,
          fontSize: 10,
        },
        markLine: {
          silent: true,
          symbol: ["none", "none"],
          lineStyle: { color: chartColors(isDark).axisName, type: "dashed", width: 1 },
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
  isDark = false,
) {
  const c = chartColors(isDark);
  const topSeries = [...scopedSeries]
    .sort((a, b) => b.avgAbsMw - a.avgAbsMw)
    .slice(0, selectedArea === "全エリア" ? 6 : 8);
  const hasData = topSeries.length > 0;

  return {
    tooltip: {
      trigger: "axis",
      valueFormatter: (value: number) => `${decimalFmt.format(value)} MW`,
    },
    legend: { top: 10, type: "scroll", textStyle: { color: c.label } },
    grid: responsiveGrid(isMobile, { top: isMobile ? 48 : 58 }),
    xAxis: timeXAxis(slotLabels, isMobile),
    yAxis: {
      type: "value",
      name: "潮流実績(MW)",
      nameLocation: "middle",
      nameGap: isMobile ? 34 : 42,
      nameTextStyle: { color: c.axisName, fontSize: isMobile ? 10 : 11 },
    },
    graphic: hasData ? undefined : emptyGraphic("連系線潮流実績データが未取得です", isDark),
    series: [
      ...(netImportSeries
        ? [
            {
              name: `${selectedArea} 純流入(+)`,
              type: "line",
              data: netImportSeries,
              smooth: true,
              symbol: "none",
              color: c.line,
              lineStyle: { width: 3, color: c.line, type: "dashed" },
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isDark = false,
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isDark = false,
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
