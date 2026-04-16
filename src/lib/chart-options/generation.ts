/**
 * ECharts option builders for generation / composition / area-totals charts.
 */

import { SOURCE_COLORS, SOURCE_COLOR_MAP } from "../constants";
import {
  numberFmt,
  decimalFmt,
  normalizeSourceName,
  formatCompactEnergy,
} from "../formatters";
import { chartColors, emptyGraphic, responsiveGrid } from "./shared";

// ---------------------------------------------------------------------------
// Generation line (stacked area by source)
// ---------------------------------------------------------------------------

export function buildGenerationLineOption(
  scopedSeries: Array<{ values: Record<string, number> }>,
  slotLabels: string[],
  sourceKeys: string[],
  sourceColorByName: Map<string, string>,
  isMobile: boolean,
  isDark = false,
) {
  const c = chartColors(isDark);
  return {
    backgroundColor: "transparent",
    tooltip: { trigger: "axis", valueFormatter: (value: number) => `${numberFmt.format(value)} MW` },
    legend: {
      type: "scroll",
      top: 8,
      textStyle: { color: c.label },
      formatter: (name: string) => normalizeSourceName(name),
    },
    grid: responsiveGrid(isMobile, { top: isMobile ? 40 : 48, bottom: isMobile ? 48 : 36 }),
    xAxis: {
      type: "category",
      data: slotLabels,
      axisLabel: {
        color: c.axis,
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
      nameTextStyle: { color: c.axisName, fontSize: isMobile ? 10 : 11 },
      axisLabel: { color: c.axis, formatter: (v: number) => numberFmt.format(v) },
    },
    graphic:
      sourceKeys.length > 0
        ? undefined
        : emptyGraphic("このエリアの発電方式別データはありません", isDark),
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

export function buildSourceDonutOption(items: SourceCompositionItem[], useInlineLegend: boolean, isDark = false) {
  const c = chartColors(isDark);
  return {
    tooltip: { trigger: "item", valueFormatter: (value: number) => formatCompactEnergy(value) },
    series: [
      {
        name: "発電方式",
        type: "pie",
        radius: useInlineLegend ? ["44%", "74%"] : ["38%", "60%"],
        center: useInlineLegend ? ["50%", "50%"] : ["50%", "42%"],
        avoidLabelOverlap: true,
        label: { show: false, color: c.label, fontSize: useInlineLegend ? 12 : 11 },
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
  isDark = false,
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
      axisLabel: { color: chartColors(isDark).axis },
    },
    series: [
      {
        type: "bar",
        data: sorted.map((item, idx) => ({
          value: item.totalKwh,
          itemStyle: {
            color: idx % 2 === 0 ? "#2a9d8f" : (isDark ? "#5b8fb9" : "#1d3557"),
            borderRadius: [0, 6, 6, 0],
          },
        })),
      },
    ],
  };
}
