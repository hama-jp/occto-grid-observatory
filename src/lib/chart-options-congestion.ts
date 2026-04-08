/**
 * ECharts option builders for congestion (連系線混雑度) charts.
 *
 * Split from chart-options.ts to keep individual modules under 800 lines.
 */

import { FLOW_AREA_COLORS, INTERTIE_RATED_CAPACITY_MW } from "./constants";
import { numberFmt, decimalFmt, roundTo } from "./formatters";
import { responsiveGrid, timeXAxis, heatmapSeries, chartColors } from "./chart-options";

// ---------------------------------------------------------------------------
// Congestion data
// ---------------------------------------------------------------------------

export type CongestionLine = {
  intertieName: string;
  label: string;
  sourceArea: string;
  targetArea: string;
  capacityMw: number;
  peakAbsMw: number;
  avgAbsMw: number;
  utilizationPct: number[];
  peakUtilization: number;
  avgUtilization: number;
  values: number[];
};

export type CongestionSummary = {
  lines: CongestionLine[];
  overallPeakLine: CongestionLine;
  overallAvgUtilization: number;
  highCongestionCount: number;
};

export function buildCongestionData(
  intertieSeries: Array<{
    intertieName: string;
    sourceArea: string;
    targetArea: string;
    peakAbsMw: number;
    avgAbsMw: number;
    values: number[];
  }>,
): CongestionSummary | null {
  if (intertieSeries.length === 0) return null;

  const lines = intertieSeries
    .filter((row) => INTERTIE_RATED_CAPACITY_MW[row.intertieName] != null)
    .map((row) => {
      const cap = INTERTIE_RATED_CAPACITY_MW[row.intertieName]!;
      const utilizationPct = row.values.map((v) =>
        cap.capacityMw > 0 ? roundTo((Math.abs(v) / cap.capacityMw) * 100, 1) : 0,
      );
      const peakUtilization = Math.max(...utilizationPct);
      const avgUtilization = roundTo(
        utilizationPct.reduce((s, v) => s + v, 0) / (utilizationPct.length || 1),
        1,
      );
      return {
        intertieName: row.intertieName,
        label: cap.label,
        sourceArea: row.sourceArea,
        targetArea: row.targetArea,
        capacityMw: cap.capacityMw,
        peakAbsMw: row.peakAbsMw,
        avgAbsMw: row.avgAbsMw,
        utilizationPct,
        peakUtilization,
        avgUtilization,
        values: row.values,
      };
    })
    .filter((row) => row.peakUtilization > 0)
    .sort((a, b) => b.peakUtilization - a.peakUtilization);

  if (lines.length === 0) return null;

  return {
    lines,
    overallPeakLine: lines[0]!,
    overallAvgUtilization: roundTo(
      lines.reduce((s, l) => s + l.avgUtilization, 0) / lines.length,
      1,
    ),
    highCongestionCount: lines.filter((l) => l.peakUtilization >= 70).length,
  };
}

// ---------------------------------------------------------------------------
// Congestion trend
// ---------------------------------------------------------------------------

export function buildCongestionTrendOption(
  congestion: CongestionSummary,
  slotLabels: string[],
  isMobile: boolean,
  isDark = false,
) {
  const topLines = congestion.lines.slice(0, isMobile ? 5 : 8);

  return {
    tooltip: {
      trigger: "axis" as const,
      formatter: (params: Array<{ seriesName: string; value: number; marker: string; dataIndex: number }>) => {
        const time = slotLabels[params[0]?.dataIndex ?? 0] ?? "";
        const rows = params
          .filter((p) => p.value != null)
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
          .map((p) => {
            const line = topLines.find(
              (l) => l.label === p.seriesName || `${l.sourceArea}→${l.targetArea}` === p.seriesName,
            );
            const flowMw = line ? Math.abs(line.values[p.dataIndex] ?? 0) : 0;
            const capMw = line?.capacityMw ?? 0;
            return `${p.marker} ${p.seriesName}: <b>${p.value}%</b> (${decimalFmt.format(flowMw)}/${numberFmt.format(capMw)} MW)`;
          });
        return `<b>${time}</b><br/>${rows.join("<br/>")}`;
      },
    },
    legend: { top: 10, type: "scroll" as const, textStyle: { color: chartColors(isDark).label } },
    grid: responsiveGrid(isMobile, { top: isMobile ? 48 : 58 }),
    xAxis: timeXAxis(slotLabels, isMobile),
    yAxis: {
      type: "value" as const,
      name: "利用率(%)",
      nameLocation: "middle" as const,
      nameGap: isMobile ? 30 : 38,
      nameTextStyle: { color: chartColors(isDark).axisName, fontSize: isMobile ? 10 : 11 },
      max: 100,
      axisLabel: { formatter: (v: number) => `${v}%` },
    },
    visualMap: {
      show: false,
      pieces: [
        { lte: 50, color: "#10b981" },
        { gt: 50, lte: 70, color: "#f59e0b" },
        { gt: 70, lte: 85, color: "#f97316" },
        { gt: 85, color: "#ef4444" },
      ],
      dimension: 1,
      seriesIndex: topLines.map((_, i) => i),
    },
    series: topLines.map((line) => {
      const color = FLOW_AREA_COLORS[line.sourceArea] ?? FLOW_AREA_COLORS[line.targetArea] ?? FLOW_AREA_COLORS.default;
      return {
        name: line.label || `${line.sourceArea}→${line.targetArea}`,
        type: "line" as const,
        data: line.utilizationPct,
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2.3, color },
        areaStyle: {
          color: {
            type: "linear" as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: color + "18" },
              { offset: 1, color: color + "02" },
            ],
          },
        },
        markLine:
          line === topLines[0]
            ? {
                silent: true,
                symbol: "none",
                lineStyle: { type: "dashed" as const, width: 1 },
                data: [
                  {
                    yAxis: 70,
                    lineStyle: { color: "#f97316" },
                    label: { formatter: "70%", position: "insideEndTop" as const, color: "#f97316", fontSize: 10 },
                  },
                ],
              }
            : undefined,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Congestion heatmap
// ---------------------------------------------------------------------------

export function buildCongestionHeatmapOption(
  congestion: CongestionSummary,
  slotLabels: string[],
  isMobile: boolean,
  isDark = false,
) {
  const { lines } = congestion;
  const heatmapData: Array<[number, number, number]> = [];
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    for (let slotIdx = 0; slotIdx < slotLabels.length; slotIdx++) {
      heatmapData.push([slotIdx, lineIdx, lines[lineIdx]!.utilizationPct[slotIdx] ?? 0]);
    }
  }

  return {
    tooltip: {
      position: "top" as const,
      formatter: (params: { value: [number, number, number] }) => {
        const [slotIdx, lineIdx, val] = params.value;
        const line = lines[lineIdx];
        const time = slotLabels[slotIdx] ?? "";
        const flowMw = line ? Math.abs(line.values[slotIdx] ?? 0) : 0;
        return `<b>${line?.label ?? ""}</b><br/>${time}: <b>${val}%</b><br/>${decimalFmt.format(flowMw)} / ${numberFmt.format(line?.capacityMw ?? 0)} MW`;
      },
    },
    grid: {
      top: 12,
      left: isMobile ? 90 : 120,
      right: isMobile ? 40 : 60,
      bottom: 36,
    },
    xAxis: { type: "category" as const, data: slotLabels, axisLabel: { interval: 5, fontSize: 10, color: chartColors(isDark).axis }, splitArea: { show: true } },
    yAxis: {
      type: "category" as const,
      data: lines.map((l) => l.label || `${l.sourceArea}→${l.targetArea}`),
      axisLabel: { fontSize: isMobile ? 9 : 11, color: chartColors(isDark).label },
    },
    visualMap: {
      min: 0,
      max: 100,
      calculable: true,
      orient: "horizontal" as const,
      left: "center",
      bottom: 0,
      itemWidth: 12,
      itemHeight: isMobile ? 80 : 140,
      textStyle: { fontSize: 10, color: chartColors(isDark).axis },
      inRange: { color: ["#d1fae5", "#6ee7b7", "#fbbf24", "#f97316", "#ef4444", "#b91c1c"] },
      formatter: (value: number) => `${Math.round(value)}%`,
    },
    series: [
      {
        ...heatmapSeries("混雑度", heatmapData),
        label: { show: false },
        emphasis: { itemStyle: { shadowBlur: 6, shadowColor: "rgba(0,0,0,0.3)" } },
      },
    ],
  };
}
