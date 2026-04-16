/**
 * Shared ECharts helpers used by all chart-option builders.
 */

/** Theme-aware text colors for ECharts elements. */
export function chartColors(isDark: boolean) {
  return {
    label: isDark ? "#e2e8f0" : "#334155",
    axis: isDark ? "#cbd5e1" : "#4a5568",
    axisName: isDark ? "#cbd5e1" : "#64748b",
    muted: isDark ? "#94a3b8" : "#475569",
    splitLine: isDark ? "#334155" : "#e2e8f0",
    line: isDark ? "#f1f5f9" : "#111827",
  };
}

/** Standard "no data" watermark graphic element for ECharts. */
export function emptyGraphic(text: string, isDark = false) {
  return [
    {
      type: "text",
      left: "center",
      top: "middle",
      style: { text, fill: isDark ? "#94a3b8" : "#475569", font: "14px sans-serif" },
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
