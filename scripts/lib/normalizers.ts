/**
 * Data normalizers — transform raw parsed data into DashboardData format.
 */

import type {
  AreaBalance,
  AreaFlowSummary,
  AreaReserveSeries,
  DashboardData,
  FlowRow,
  GenerationRow,
  HourlyAreaPoint,
  HourlySourcePoint,
  InterAreaFlow,
  IntertieSeries,
  LineSeries,
} from "../../src/lib/dashboard-types";
import {
  INTERTIE_AREA_MAP,
  roundTo,
  type IntertieFlowRow,
  type IntertieAreaDefinition,
} from "./constants";

export function buildDashboardData(args: {
  targetDate: string;
  generationRows: GenerationRow[];
  flowRows: FlowRow[];
  intertieRows: IntertieFlowRow[];
  reserveRows: AreaReserveSeries[];
  generationCsvName: string;
  flowCsvName: string;
  intertieCsvName: string;
  reserveJsonName: string;
}): DashboardData {
  const generationSlotCount = args.generationRows[0]?.values.length ?? 48;
  const flowSlotCount = args.flowRows[0]?.values.length ?? 48;
  const slotCount = Math.max(generationSlotCount, flowSlotCount);

  const generationLabels = buildTimeLabels(30, slotCount, 30);
  const flowLabels = buildTimeLabels(0, slotCount, 30);

  const areaTotalsMap = new Map<string, number>();
  const sourceTotalsMap = new Map<string, number>();
  const hourlyByAreaMap = new Map<string, number[]>();
  const hourlyBySourceMap = new Map<string, number[]>();
  const hourlyByAreaSourceMap = new Map<string, Map<string, number[]>>();
  const plantSummaryMap = new Map<
    string,
    { area: string; plantName: string; sourceType: string; dailyKwh: number; slotTotals: number[] }
  >();

  for (const row of args.generationRows) {
    areaTotalsMap.set(row.area, (areaTotalsMap.get(row.area) ?? 0) + row.dailyKwh);
    sourceTotalsMap.set(row.sourceType, (sourceTotalsMap.get(row.sourceType) ?? 0) + row.dailyKwh);

    const areaSeries = hourlyByAreaMap.get(row.area) ?? new Array(slotCount).fill(0);
    const sourceSeries = hourlyBySourceMap.get(row.sourceType) ?? new Array(slotCount).fill(0);
    const areaSourceMap = hourlyByAreaSourceMap.get(row.area) ?? new Map<string, number[]>();
    const areaSourceSeries = areaSourceMap.get(row.sourceType) ?? new Array(slotCount).fill(0);
    for (let i = 0; i < slotCount; i += 1) {
      areaSeries[i] += row.values[i] ?? 0;
      sourceSeries[i] += row.values[i] ?? 0;
      areaSourceSeries[i] += row.values[i] ?? 0;
    }
    hourlyByAreaMap.set(row.area, areaSeries);
    hourlyBySourceMap.set(row.sourceType, sourceSeries);
    areaSourceMap.set(row.sourceType, areaSourceSeries);
    hourlyByAreaSourceMap.set(row.area, areaSourceMap);

    const plantKey = `${row.area}::${row.plantName}`;
    const currentPlant = plantSummaryMap.get(plantKey) ?? {
      area: row.area,
      plantName: row.plantName,
      sourceType: row.sourceType,
      dailyKwh: 0,
      slotTotals: new Array(slotCount).fill(0),
    };
    currentPlant.dailyKwh += row.dailyKwh;
    for (let i = 0; i < slotCount; i += 1) {
      currentPlant.slotTotals[i] += row.values[i] ?? 0;
    }
    if (!currentPlant.sourceType && row.sourceType) {
      currentPlant.sourceType = row.sourceType;
    }
    plantSummaryMap.set(plantKey, currentPlant);
  }

  const lineSeries: LineSeries[] = args.flowRows.map((row) => {
    const peakAbs = row.values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    const avg = row.values.reduce((sum, value) => sum + value, 0) / Math.max(row.values.length, 1);
    return {
      area: row.area,
      voltageKv: row.voltageKv,
      lineName: row.lineName,
      positiveDirection: row.positiveDirection,
      peakAbsMw: peakAbs,
      avgMw: roundTo(avg, 1),
      values: row.values,
    };
  });

  const flowAreaAccum = new Map<
    string,
    { lineCount: number; peakAbsMw: number; sumAbsMw: number; sampleCount: number }
  >();
  const hourlyAbsAreaMap = new Map<string, number[]>();
  const hourlyAbsAll: number[][] = Array.from({ length: slotCount }, () => []);

  for (const row of args.flowRows) {
    const peakAbs = row.values.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    const absValues = row.values.map((value) => Math.abs(value));
    const areaAccum = flowAreaAccum.get(row.area) ?? { lineCount: 0, peakAbsMw: 0, sumAbsMw: 0, sampleCount: 0 };
    areaAccum.lineCount += 1;
    areaAccum.peakAbsMw = Math.max(areaAccum.peakAbsMw, peakAbs);
    areaAccum.sumAbsMw += absValues.reduce((sum, value) => sum + value, 0);
    areaAccum.sampleCount += absValues.length;
    flowAreaAccum.set(row.area, areaAccum);

    const hourlyAreaSeries = hourlyAbsAreaMap.get(row.area) ?? new Array(slotCount).fill(0);
    for (let i = 0; i < slotCount; i += 1) {
      const value = absValues[i] ?? 0;
      hourlyAreaSeries[i] += value;
      hourlyAbsAll[i].push(value);
    }
    hourlyAbsAreaMap.set(row.area, hourlyAreaSeries);
  }

  const hourlyAbsByArea: HourlyAreaPoint[] = flowLabels.map((time, idx) => {
    const values: Record<string, number> = {};
    for (const [area, series] of hourlyAbsAreaMap.entries()) {
      const areaLineCount = flowAreaAccum.get(area)?.lineCount ?? 1;
      values[area] = roundTo((series[idx] ?? 0) / areaLineCount, 1);
    }
    return { time, values };
  });

  const hourlyAbsStats = flowLabels.map((time, idx) => {
    const values = hourlyAbsAll[idx];
    const avg = values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
    return {
      time,
      avgAbsMw: roundTo(avg, 1),
      p95AbsMw: roundTo(quantile(values, 0.95), 1),
    };
  });

  const areaSummaries: AreaFlowSummary[] = Array.from(flowAreaAccum.entries())
    .map(([area, values]) => ({
      area,
      lineCount: values.lineCount,
      peakAbsMw: roundTo(values.peakAbsMw, 1),
      avgAbsMw: roundTo(values.sumAbsMw / Math.max(values.sampleCount, 1), 1),
    }))
    .sort((a, b) => b.peakAbsMw - a.peakAbsMw);

  const generationAreaTotals = Array.from(areaTotalsMap.entries())
    .map(([area, totalKwh]) => ({ area, totalKwh: roundTo(totalKwh, 0) }))
    .sort((a, b) => b.totalKwh - a.totalKwh);
  const generationSourceTotals = Array.from(sourceTotalsMap.entries())
    .map(([source, totalKwh]) => ({ source, totalKwh: roundTo(totalKwh, 0) }))
    .sort((a, b) => b.totalKwh - a.totalKwh);

  const hourlyTotalByArea: HourlyAreaPoint[] = generationLabels.map((time, idx) => {
    const values: Record<string, number> = {};
    for (const [area, series] of hourlyByAreaMap.entries()) {
      values[area] = roundTo(series[idx] ?? 0, 0);
    }
    return { time, values };
  });

  const hourlyBySource: HourlySourcePoint[] = generationLabels.map((time, idx) => {
    const values: Record<string, number> = {};
    for (const [source, series] of hourlyBySourceMap.entries()) {
      values[source] = roundTo(series[idx] ?? 0, 0);
    }
    return { time, values };
  });

  const hourlyBySourceByArea: Record<string, HourlySourcePoint[]> = {};
  for (const [area, sourceSeriesMap] of hourlyByAreaSourceMap.entries()) {
    hourlyBySourceByArea[area] = generationLabels.map((time, idx) => {
      const values: Record<string, number> = {};
      for (const [source, series] of sourceSeriesMap.entries()) {
        values[source] = roundTo(series[idx] ?? 0, 0);
      }
      return { time, values };
    });
  }

  const topUnits = [...args.generationRows]
    .sort((a, b) => b.dailyKwh - a.dailyKwh)
    .slice(0, 60)
    .map((row) => {
      const maxSlotKwh = row.values.reduce((max, value) => Math.max(max, value), 0);
      const maxOutputManKw = roundTo(maxSlotKwh / 5000, 2);
      return {
        area: row.area,
        plantName: row.plantName,
        unitName: row.unitName,
        sourceType: row.sourceType,
        maxOutputManKw,
        dailyKwh: row.dailyKwh,
      };
    });

  const plantSummaries = Array.from(plantSummaryMap.values())
    .map((row) => ({
      area: row.area,
      plantName: row.plantName,
      sourceType: row.sourceType,
      dailyKwh: roundTo(row.dailyKwh, 0),
      maxOutputManKw: roundTo(row.slotTotals.reduce((max, value) => Math.max(max, value), 0) / 5000, 2),
    }))
    .sort((a, b) => b.dailyKwh - a.dailyKwh);

  const areaBalance: AreaBalance[] = generationAreaTotals.map((generation) => {
    const flow = areaSummaries.find((item) => item.area === generation.area);
    const peakAbsMw = flow?.peakAbsMw ?? 0;
    const lineCount = flow?.lineCount ?? 0;
    const averageGenerationMw = generation.totalKwh / 24 / 1000;
    const stress = averageGenerationMw === 0 ? 0 : peakAbsMw / averageGenerationMw;
    return {
      area: generation.area,
      dailyKwh: generation.totalKwh,
      peakAbsMw,
      lineCount,
      stressIndex: roundTo(stress, 2),
    };
  });

  const intertieSeries = buildIntertieSeries(args.intertieRows, slotCount);
  const interAreaFlows = buildInterAreaFlows(intertieSeries);

  return {
    meta: {
      targetDate: args.targetDate,
      fetchedAt: new Date().toISOString(),
      generationRows: args.generationRows.length,
      flowRows: args.flowRows.length,
      slotCount,
      slotLabels: { generation: generationLabels, flow: flowLabels },
      sources: {
        generationCsv: args.generationCsvName,
        flowCsv: args.flowCsvName,
        intertieCsv: args.intertieCsvName,
        reserveJson: args.reserveJsonName,
      },
    },
    generation: {
      areaTotals: generationAreaTotals,
      sourceTotals: generationSourceTotals,
      hourlyBySource,
      hourlyBySourceByArea,
      hourlyTotalByArea,
      topUnits,
      plantSummaries,
    },
    reserves: { areaSeries: args.reserveRows },
    flows: {
      areaSummaries,
      hourlyAbsByArea,
      hourlyAbsStats,
      lineSeries: lineSeries.sort((a, b) => b.peakAbsMw - a.peakAbsMw),
      intertieSeries,
      interAreaFlows,
    },
    insights: {
      areaBalance: areaBalance.sort((a, b) => b.stressIndex - a.stressIndex),
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildIntertieSeries(intertieRows: IntertieFlowRow[], slotCount: number): IntertieSeries[] {
  const byIntertie = new Map<string, { values5m: number[]; counts5m: number[] }>();

  for (const row of intertieRows) {
    const idx = timeToFiveMinuteIndex(row.time);
    if (idx === null) {
      continue;
    }
    const entry = byIntertie.get(row.intertieName) ?? {
      values5m: new Array(288).fill(0),
      counts5m: new Array(288).fill(0),
    };
    entry.values5m[idx] += row.actualMw;
    entry.counts5m[idx] += 1;
    byIntertie.set(row.intertieName, entry);
  }

  const series: IntertieSeries[] = [];
  for (const [intertieName, entry] of byIntertie.entries()) {
    const values5m = entry.values5m.map((sum, idx) => {
      const count = entry.counts5m[idx] || 1;
      return sum / count;
    });
    const values30m = aggregateTo30Minute(values5m, slotCount);
    const avgMw = values5m.reduce((sum, value) => sum + value, 0) / Math.max(values5m.length, 1);
    const avgAbsMw = values5m.reduce((sum, value) => sum + Math.abs(value), 0) / Math.max(values5m.length, 1);
    const peakAbsMw = values5m.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    const areas = resolveIntertieAreas(intertieName);

    series.push({
      intertieName,
      sourceArea: areas.sourceArea,
      targetArea: areas.targetArea,
      peakAbsMw: roundTo(peakAbsMw, 1),
      avgMw: roundTo(avgMw, 1),
      avgAbsMw: roundTo(avgAbsMw, 1),
      values: values30m.map((value) => roundTo(value, 1)),
    });
  }

  return series.sort((a, b) => b.avgAbsMw - a.avgAbsMw);
}

function buildInterAreaFlows(intertieSeries: IntertieSeries[]): InterAreaFlow[] {
  const byPair = new Map<
    string,
    { sourceArea: string; targetArea: string; avgMw: number; avgAbsMw: number; peakAbsMw: number; intertieNames: string[] }
  >();

  for (const line of intertieSeries) {
    if (line.sourceArea === "不明" || line.targetArea === "不明") {
      continue;
    }
    const key = `${line.sourceArea}→${line.targetArea}`;
    const entry = byPair.get(key) ?? {
      sourceArea: line.sourceArea,
      targetArea: line.targetArea,
      avgMw: 0,
      avgAbsMw: 0,
      peakAbsMw: 0,
      intertieNames: [] as string[],
    };
    entry.avgMw += line.avgMw;
    entry.avgAbsMw += line.avgAbsMw;
    entry.peakAbsMw = Math.max(entry.peakAbsMw, line.peakAbsMw);
    entry.intertieNames.push(line.intertieName);
    byPair.set(key, entry);
  }

  return Array.from(byPair.values())
    .map((entry) => ({
      sourceArea: entry.sourceArea,
      targetArea: entry.targetArea,
      avgMw: roundTo(entry.avgMw, 1),
      avgAbsMw: roundTo(entry.avgAbsMw, 1),
      peakAbsMw: roundTo(entry.peakAbsMw, 1),
      intertieCount: entry.intertieNames.length,
      intertieNames: entry.intertieNames,
    }))
    .sort((a, b) => b.avgAbsMw - a.avgAbsMw);
}

function aggregateTo30Minute(values5m: number[], slotCount: number): number[] {
  const pointsPerSlot = 6;
  const slots = new Array(slotCount).fill(0);
  for (let slotIdx = 0; slotIdx < slotCount; slotIdx += 1) {
    let sum = 0;
    let count = 0;
    for (let offset = 0; offset < pointsPerSlot; offset += 1) {
      const idx = slotIdx * pointsPerSlot + offset;
      if (idx >= values5m.length) {
        break;
      }
      sum += values5m[idx];
      count += 1;
    }
    slots[slotIdx] = count === 0 ? 0 : sum / count;
  }
  return slots;
}

function timeToFiveMinuteIndex(value: string): number | null {
  const matched = value.match(/^(\d{2}):(\d{2})$/);
  if (!matched) {
    return null;
  }
  const hh = Number(matched[1]);
  const mm = Number(matched[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 24 || mm < 0 || mm > 59) {
    return null;
  }
  const totalMinutes = hh * 60 + mm;
  if (totalMinutes < 5 || totalMinutes > 1440 || (totalMinutes - 5) % 5 !== 0) {
    return null;
  }
  const idx = (totalMinutes - 5) / 5;
  return idx >= 0 && idx < 288 ? idx : null;
}

function resolveIntertieAreas(intertieName: string): IntertieAreaDefinition {
  const exact = INTERTIE_AREA_MAP[intertieName];
  if (exact) {
    return exact;
  }
  const normalized = intertieName.replace(/\s+/g, "");
  for (const [name, areas] of Object.entries(INTERTIE_AREA_MAP)) {
    const normalizedName = name.replace(/\s+/g, "");
    if (normalized.includes(normalizedName) || normalizedName.includes(normalized)) {
      return areas;
    }
  }
  return { sourceArea: "不明", targetArea: "不明" };
}

function buildTimeLabels(startMinute: number, points: number, stepMinute: number): string[] {
  const labels: string[] = [];
  let totalMinutes = startMinute;
  for (let i = 0; i < points; i += 1) {
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const mm = String(totalMinutes % 60).padStart(2, "0");
    labels.push(`${hh}:${mm}`);
    totalMinutes += stepMinute;
  }
  return labels;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * q;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) {
    return sorted[lower];
  }
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}
