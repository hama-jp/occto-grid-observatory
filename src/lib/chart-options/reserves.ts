/**
 * ECharts option builders for reserve / demand charts.
 */

import { FLOW_AREA_COLORS } from "../constants";
import { decimalFmt } from "../formatters";
import { chartColors, emptyGraphic, responsiveGrid, timeXAxis } from "./shared";

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
  isDark = false,
) {
  const c = chartColors(isDark);
  const hasData = scopedSeries.length > 0;
  return {
    tooltip: {
      trigger: "axis",
      valueFormatter: (value: number) => `${decimalFmt.format(value)} %`,
    },
    legend: { top: 8, type: "scroll", textStyle: { color: c.label } },
    grid: responsiveGrid(isMobile),
    xAxis: timeXAxis(slotLabels, isMobile),
    yAxis: {
      type: "value",
      name: "予備率(%)",
      nameLocation: "middle",
      nameGap: isMobile ? 34 : 42,
      nameTextStyle: { color: c.axisName, fontSize: isMobile ? 10 : 11 },
      axisLabel: { formatter: (value: number) => decimalFmt.format(value) },
    },
    graphic: hasData ? undefined : emptyGraphic("予備率データが未取得です", isDark),
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
  isDark = false,
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
    graphic: hasData ? undefined : emptyGraphic("需要データが未取得です", isDark),
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
          color: chartColors(isDark).label,
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
  isDark = false,
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
    graphic: hasData ? undefined : emptyGraphic("予備率データが未取得です", isDark),
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
          color: chartColors(isDark).label,
        },
      },
    ],
  };
}
