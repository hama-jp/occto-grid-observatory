/**
 * ECharts option builders for the generator-status treemap and per-area time series.
 */

import { FLOW_AREA_COLORS } from "../constants";
import { numberFmt, formatCompactEnergy } from "../formatters";
import type { GeneratorTreemapItem } from "../dashboard-computations";
import { chartColors, emptyGraphic } from "./shared";

// ---------------------------------------------------------------------------
// Generator status — treemap
// ---------------------------------------------------------------------------

export function buildGeneratorTreemapOption(
  items: GeneratorTreemapItem[],
  isMobile: boolean,
  isDark = false,
): Record<string, unknown> {
  if (items.length === 0) {
    return { graphic: emptyGraphic("発電機データなし", isDark) };
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
          textShadowBlur: 4,
          textShadowColor: "rgba(0,0,0,0.7)",
        },
        upperLabel: {
          show: true,
          height: isMobile ? 20 : 24,
          fontSize: isMobile ? 10 : 12,
          fontWeight: "bold",
          color: "#fff",
          textShadowBlur: 4,
          textShadowColor: "rgba(0,0,0,0.6)",
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
            colorSaturation: [0.75, 0.9],
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
  isDark = false,
): Record<string, unknown> {
  if (seriesList.length === 0 || slotLabels.length === 0) {
    return { graphic: emptyGraphic("データなし", isDark) };
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
      splitLine: { show: true, lineStyle: { color: chartColors(isDark).splitLine, opacity: 0.4 } },
      axisLabel: {
        show: true,
        fontSize: isMobile ? 8 : 9,
        color: "#94a3b8",
        formatter: (v: number) => {
          const mw = v * 2 / 1_000;
          if (mw >= 1_000) return `${(mw / 1_000).toFixed(1)}GW`;
          if (mw >= 1) return `${Math.round(mw)}MW`;
          return `${(mw * 1_000).toFixed(0)}kW`;
        },
      },
    },
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(30,41,59,0.95)",
      borderColor: "transparent",
      textStyle: { color: "#f1f5f9", fontSize: 11 },
      formatter: (params: { seriesName: string; value: number; marker: string; dataIndex: number }) => {
        const slot = slotLabels[params.dataIndex ?? 0] ?? "";
        const mw = params.value * 2 / 1_000;
        return `<div style="font-size:11px"><b>${slot}</b><br/>${params.marker} ${params.seriesName}: ${numberFmt.format(mw)} MW</div>`;
      },
    },
    series: seriesList.map((s) => ({
      name: s.name,
      type: "line",
      smooth: true,
      symbol: "circle",
      symbolSize: 8,
      showSymbol: false,
      lineStyle: { width: 1.5 },
      color: s.color,
      data: s.data,
      emphasis: { focus: "series" },
    })),
  };
}

/**
 * Expanded (full-window modal) variant of the area generation time-series chart.
 * Shows all series with larger layout, dataZoom slider, and full legend.
 */
export function buildExpandedAreaGenerationTimeSeriesOption(
  seriesList: AreaGenerationSeries[],
  slotLabels: string[],
  areaColor: string,
  isDark = false,
): Record<string, unknown> {
  if (seriesList.length === 0 || slotLabels.length === 0) {
    return { graphic: emptyGraphic("データなし", isDark) };
  }

  return {
    animation: true,
    animationDuration: 500,
    animationEasing: "cubicOut",
    backgroundColor: "transparent",
    grid: {
      top: 40,
      left: 64,
      right: 24,
      bottom: 80,
      containLabel: false,
    },
    legend: {
      show: true,
      bottom: 44,
      left: "center",
      type: "scroll",
      textStyle: { color: "#94a3b8", fontSize: 11 },
      pageTextStyle: { color: "#94a3b8" },
      pageIconColor: "#64748b",
      pageIconInactiveColor: "#334155",
      itemWidth: 14,
      itemHeight: 10,
      itemGap: 12,
    },
    dataZoom: [
      {
        type: "slider",
        bottom: 8,
        height: 24,
        borderColor: "transparent",
        backgroundColor: "rgba(100,116,139,0.1)",
        fillerColor: `${areaColor}22`,
        handleStyle: { color: areaColor, borderColor: areaColor },
        textStyle: { color: "#94a3b8", fontSize: 10 },
        dataBackground: {
          lineStyle: { color: `${areaColor}44` },
          areaStyle: { color: `${areaColor}11` },
        },
      },
    ],
    xAxis: {
      type: "category",
      data: slotLabels,
      show: true,
      axisLine: { show: true, lineStyle: { color: isDark ? "#475569" : "#334155" } },
      axisTick: { show: false },
      axisLabel: {
        show: true,
        fontSize: 11,
        color: "#94a3b8",
        interval: (_index: number, value: string) =>
          value === "00:00" || value === "03:00" || value === "06:00" ||
          value === "09:00" || value === "12:00" || value === "15:00" ||
          value === "18:00" || value === "21:00",
      },
    },
    yAxis: {
      type: "value",
      show: true,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: chartColors(isDark).splitLine, opacity: 0.3 } },
      axisLabel: {
        show: true,
        fontSize: 11,
        color: "#94a3b8",
        formatter: (v: number) => {
          const mw = v * 2 / 1_000;
          if (mw >= 1_000) return `${(mw / 1_000).toFixed(1)}GW`;
          if (mw >= 1) return `${Math.round(mw)}MW`;
          return `${(mw * 1_000).toFixed(0)}kW`;
        },
      },
    },
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(30,41,59,0.95)",
      borderColor: "transparent",
      textStyle: { color: "#f1f5f9", fontSize: 12 },
      formatter: (params: { seriesName: string; value: number; marker: string; dataIndex: number }) => {
        const slot = slotLabels[params.dataIndex ?? 0] ?? "";
        const mw = params.value * 2 / 1_000;
        return `<div style="font-size:12px"><b>${slot}</b><br/>${params.marker} ${params.seriesName}: ${numberFmt.format(mw)} MW</div>`;
      },
    },
    series: seriesList.map((s) => ({
      name: s.name,
      type: "line",
      smooth: true,
      symbol: "circle",
      symbolSize: 10,
      showSymbol: false,
      lineStyle: { width: 2 },
      color: s.color,
      data: s.data,
      emphasis: { focus: "series" },
    })),
  };
}
