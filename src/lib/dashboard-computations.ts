import type {
  DashboardData,
  InterAreaFlow,
  IntertieSeries,
  PlantSummary,
  TopUnit,
  AreaReserveSeries,
} from "@/lib/dashboard-types";
import type { BarListItem } from "@/components/ui/dashboard-ui";
import type { ShareSegment } from "@/lib/formatters";
import {
  numberFmt,
  decimalFmt,
  manKwFmt,
  normalizeSourceName,
  formatCompactEnergy,
  roundTo,
  clamp,
  compareAreaOrder,
  buildTopShareSegments,
} from "@/lib/formatters";
import {
  SOURCE_COLORS,
  FLOW_AREA_COLORS,
} from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InterAreaFlowTextRow = {
  sourceArea: string;
  targetArea: string;
  upMw: number;
  downMw: number;
  magnitudeMw: number;
  intertieNames: string[];
};

export type ReserveCurrentRow = {
  area: string;
  demandMw: number;
  supplyMw: number;
  reserveMw: number;
  reserveRate: number;
  usageRate: number;
  blockReserveRate: number;
};

export type PlantSummaryRow = {
  area: string;
  plantName: string;
  sourceType: string;
  dailyKwh: number;
  maxOutputManKw: number;
  summedUnitMaxOutputManKw?: number;
};

export type DashboardHighlights = {
  totalGenerationKwh: number;
  totalDemandMw: number;
  topSource: { source: string; totalKwh: number } | undefined;
  topSourceShare: number;
  lowestReserveArea: ReserveCurrentRow | null;
  peakDemandArea: ReserveCurrentRow | null;
  hottestIntertie: InterAreaFlowTextRow | null;
  strongestImportValue: string;
  strongestImportDetail: string;
  strongestExportValue: string;
  strongestExportDetail: string;
  largestUnit: TopUnit | null;
  topPlant: PlantSummaryRow | null;
  areaShareSegments: ShareSegment[];
  sourceShareSegments: ShareSegment[];
  reserveWatchItems: BarListItem[];
  demandLeaderItems: BarListItem[];
  intertieWatchItems: BarListItem[];
  unitLeaderItems: BarListItem[];
  plantLeaderItems: BarListItem[];
};

export type AreaSupplyCard = {
  area: string;
  totalKwh: number;
  sharePercent: number;
  topSource: string;
  topSourceShare: number;
  sourceMix: ShareSegment[];
  netIntertieMw: number;
  peer: { counterpart: string; signedMw: number; magnitudeMw: number } | undefined;
  primaryPlant: PlantSummaryRow | undefined;
  peakAbsMw: number;
  demandMw: number;
  supplyMw: number;
  reserveMw: number;
  reserveRate: number;
  /** 48-slot half-hourly time series for sparkline */
  demandSeries: number[];
  supplySeries: number[];
  reserveSeries: number[];
};

// ---------------------------------------------------------------------------
// buildAllPlantSummaries
// ---------------------------------------------------------------------------

export function buildAllPlantSummaries(params: {
  plantSummaries: PlantSummary[] | undefined;
  topUnits: TopUnit[];
}): PlantSummaryRow[] {
  const { plantSummaries, topUnits } = params;

  if (plantSummaries && plantSummaries.length > 0) {
    return [...plantSummaries].sort((a, b) => b.dailyKwh - a.dailyKwh);
  }

  const fallback = new Map<
    string,
    {
      area: string;
      plantName: string;
      sourceType: string;
      dailyKwh: number;
      maxOutputManKw: number;
      summedUnitMaxOutputManKw: number;
    }
  >();
  topUnits.forEach((unit) => {
    const key = `${unit.area}::${unit.plantName}`;
    const current = fallback.get(key) ?? {
      area: unit.area,
      plantName: unit.plantName,
      sourceType: unit.sourceType,
      dailyKwh: 0,
      maxOutputManKw: 0,
      summedUnitMaxOutputManKw: 0,
    };
    current.dailyKwh += unit.dailyKwh;
    current.summedUnitMaxOutputManKw += unit.maxOutputManKw ?? 0;
    current.maxOutputManKw = current.summedUnitMaxOutputManKw;
    if (!current.sourceType && unit.sourceType) {
      current.sourceType = unit.sourceType;
    }
    fallback.set(key, current);
  });

  return Array.from(fallback.values()).sort((a, b) => b.dailyKwh - a.dailyKwh);
}

// ---------------------------------------------------------------------------
// buildInterAreaFlowTextRows
// ---------------------------------------------------------------------------

export function buildInterAreaFlowTextRows(params: {
  selectedArea: string;
  isMobileViewport: boolean;
  filteredIntertieSeries: IntertieSeries[];
  clampedNetworkFlowSlotIndex: number;
  interAreaFlows: InterAreaFlow[] | undefined;
}): InterAreaFlowTextRow[] {
  const { selectedArea, isMobileViewport, filteredIntertieSeries, clampedNetworkFlowSlotIndex, interAreaFlows } = params;

  const rowLimit = selectedArea === "全エリア" ? (isMobileViewport ? 10 : 14) : (isMobileViewport ? 16 : 22);
  const scopedInterties = filteredIntertieSeries.filter((row) =>
    selectedArea === "全エリア" ? true : row.sourceArea === selectedArea || row.targetArea === selectedArea,
  );
  const pairMap = new Map<
    string,
    {
      sourceArea: string;
      targetArea: string;
      upMw: number;
      downMw: number;
      intertieNames: Set<string>;
    }
  >();

  scopedInterties.forEach((row) => {
    const key = `${row.sourceArea}::${row.targetArea}`;
    const slotMw = row.values[clampedNetworkFlowSlotIndex] ?? row.avgMw ?? 0;
    const current = pairMap.get(key) ?? {
      sourceArea: row.sourceArea,
      targetArea: row.targetArea,
      upMw: 0,
      downMw: 0,
      intertieNames: new Set<string>(),
    };
    if (slotMw >= 0) {
      current.upMw += slotMw;
    } else {
      current.downMw += Math.abs(slotMw);
    }
    current.intertieNames.add(row.intertieName);
    pairMap.set(key, current);
  });

  const rows = Array.from(pairMap.values()).map((row) => ({
    sourceArea: row.sourceArea,
    targetArea: row.targetArea,
    upMw: roundTo(row.upMw, 1),
    downMw: roundTo(row.downMw, 1),
    magnitudeMw: roundTo(row.upMw + row.downMw, 1),
    intertieNames: Array.from(row.intertieNames),
  }));

  if (rows.length > 0) {
    return rows.sort((a, b) => b.magnitudeMw - a.magnitudeMw).slice(0, rowLimit);
  }

  return (interAreaFlows ?? [])
    .filter((row) => row.sourceArea !== "不明" && row.targetArea !== "不明")
    .filter((row) =>
      selectedArea === "全エリア" ? true : row.sourceArea === selectedArea || row.targetArea === selectedArea,
    )
    .map((row) => ({
      sourceArea: row.sourceArea,
      targetArea: row.targetArea,
      upMw: roundTo(Math.max(row.avgMw, 0), 1),
      downMw: roundTo(Math.max(-row.avgMw, 0), 1),
      magnitudeMw: roundTo(row.avgAbsMw, 1),
      intertieNames: row.intertieNames,
    }))
    .sort((a, b) => b.magnitudeMw - a.magnitudeMw)
    .slice(0, rowLimit);
}

// ---------------------------------------------------------------------------
// buildDashboardHighlights
// ---------------------------------------------------------------------------

export function buildDashboardHighlights(params: {
  data: DashboardData;
  reserveCurrentRows: ReserveCurrentRow[];
  filteredIntertieSeries: IntertieSeries[];
  clampedNetworkFlowSlotIndex: number;
  interAreaFlowTextRows: InterAreaFlowTextRow[];
  allPlantSummaries: PlantSummaryRow[];
  sourceColorByName: Map<string, string>;
}): DashboardHighlights {
  const {
    data,
    reserveCurrentRows,
    filteredIntertieSeries,
    clampedNetworkFlowSlotIndex,
    interAreaFlowTextRows,
    allPlantSummaries,
    sourceColorByName,
  } = params;

  const totalGenerationKwh = data.generation.areaTotals.reduce((sum, item) => sum + item.totalKwh, 0);
  const totalDemandMw = reserveCurrentRows.reduce((sum, row) => sum + row.demandMw, 0);
  const topSource = data.generation.sourceTotals[0];
  const topSourceShare = topSource && totalGenerationKwh > 0 ? (topSource.totalKwh / totalGenerationKwh) * 100 : 0;
  const lowestReserveArea = reserveCurrentRows[0] ?? null;
  const demandLeadersRaw = [...reserveCurrentRows].sort((a, b) => b.demandMw - a.demandMw);
  const peakDemandArea = demandLeadersRaw[0] ?? null;

  const netIntertieByArea = new Map<string, number>();
  filteredIntertieSeries.forEach((row) => {
    const value = row.values[clampedNetworkFlowSlotIndex] ?? row.avgMw ?? 0;
    netIntertieByArea.set(row.sourceArea, (netIntertieByArea.get(row.sourceArea) ?? 0) - value);
    netIntertieByArea.set(row.targetArea, (netIntertieByArea.get(row.targetArea) ?? 0) + value);
  });

  const netIntertieRows = Array.from(netIntertieByArea.entries()).map(([area, mw]) => ({ area, mw }));
  const strongestImportArea =
    netIntertieRows.filter((item) => item.mw > 0).sort((a, b) => b.mw - a.mw)[0] ?? null;
  const strongestExportArea =
    netIntertieRows.filter((item) => item.mw < 0).sort((a, b) => a.mw - b.mw)[0] ?? null;

  const hottestIntertie = interAreaFlowTextRows[0] ?? null;
  const largestUnit =
    [...data.generation.topUnits].sort(
      (a, b) => b.dailyKwh - a.dailyKwh || b.maxOutputManKw - a.maxOutputManKw,
    )[0] ?? null;
  const topPlant = allPlantSummaries[0] ?? null;
  const strongestImportValue = strongestImportArea?.area ?? "-";
  const strongestImportDetail = strongestImportArea
    ? `${decimalFmt.format(strongestImportArea.mw)} MW`
    : "データなし";
  const strongestExportValue = strongestExportArea?.area ?? "-";
  const strongestExportDetail = strongestExportArea
    ? `${decimalFmt.format(Math.abs(strongestExportArea.mw))} MW`
    : "データなし";
  const areaShareSegments = buildTopShareSegments(
    data.generation.areaTotals,
    totalGenerationKwh,
    5,
    (item) => item.area,
    (item) => item.totalKwh,
    (item) => FLOW_AREA_COLORS[item.area] ?? FLOW_AREA_COLORS.default,
  );
  const sourceShareSegments = buildTopShareSegments(
    data.generation.sourceTotals,
    totalGenerationKwh,
    5,
    (item) => normalizeSourceName(item.source),
    (item) => item.totalKwh,
    (item, idx) => sourceColorByName.get(item.source) ?? SOURCE_COLORS[idx % SOURCE_COLORS.length],
  );
  const reserveWatchItems: BarListItem[] = reserveCurrentRows.slice(0, 4).map((row) => ({
    label: row.area,
    valueLabel: `${decimalFmt.format(row.reserveRate)}%`,
    percent: clamp((row.reserveRate / 20) * 100, 0, 100),
    color: FLOW_AREA_COLORS[row.area] ?? FLOW_AREA_COLORS.default,
    note: `予備力 ${decimalFmt.format(row.reserveMw)} MW`,
  }));
  const maxDemandMw = Math.max(...demandLeadersRaw.map((row) => row.demandMw), 1);
  const demandLeaderItems: BarListItem[] = demandLeadersRaw.slice(0, 4).map((row) => ({
    label: row.area,
    valueLabel: `${decimalFmt.format(row.demandMw)} MW`,
    percent: clamp((row.demandMw / maxDemandMw) * 100, 0, 100),
    color: FLOW_AREA_COLORS[row.area] ?? FLOW_AREA_COLORS.default,
    note: `全国需要比 ${totalDemandMw > 0 ? decimalFmt.format((row.demandMw / totalDemandMw) * 100) : "0"}%`,
  }));
  const maxIntertieMw = Math.max(...interAreaFlowTextRows.map((row) => row.magnitudeMw), 1);
  const intertieWatchItems: BarListItem[] = interAreaFlowTextRows.slice(0, 4).map((row) => ({
    label: `${row.sourceArea} ⇄ ${row.targetArea}`,
    valueLabel: `${decimalFmt.format(row.magnitudeMw)} MW`,
    percent: clamp((row.magnitudeMw / maxIntertieMw) * 100, 0, 100),
    color:
      FLOW_AREA_COLORS[row.upMw >= row.downMw ? row.sourceArea : row.targetArea] ?? FLOW_AREA_COLORS.default,
    note: row.intertieNames.join(" / "),
  }));
  const unitLeadersRaw = [...data.generation.topUnits]
    .sort((a, b) => b.dailyKwh - a.dailyKwh || b.maxOutputManKw - a.maxOutputManKw)
    .slice(0, 3);
  const maxUnitKwh = Math.max(...unitLeadersRaw.map((item) => item.dailyKwh), 1);
  const unitLeaderItems: BarListItem[] = unitLeadersRaw.map((item) => ({
    label: `${item.plantName} ${item.unitName}`,
    valueLabel: `${numberFmt.format(item.dailyKwh)} kWh`,
    percent: clamp((item.dailyKwh / maxUnitKwh) * 100, 0, 100),
    color: FLOW_AREA_COLORS[item.area] ?? FLOW_AREA_COLORS.default,
    note: `${item.area}｜最大 ${manKwFmt.format(item.maxOutputManKw)} 万kW`,
  }));
  const plantLeadersRaw = allPlantSummaries.slice(0, 3);
  const maxPlantEnergy = Math.max(...plantLeadersRaw.map((item) => item.dailyKwh), 1);
  const plantLeaderItems: BarListItem[] = plantLeadersRaw.map((item) => ({
    label: item.plantName,
    valueLabel: formatCompactEnergy(item.dailyKwh),
    percent: clamp((item.dailyKwh / maxPlantEnergy) * 100, 0, 100),
    color: FLOW_AREA_COLORS[item.area] ?? FLOW_AREA_COLORS.default,
    note: item.area,
  }));

  return {
    totalGenerationKwh,
    totalDemandMw,
    topSource,
    topSourceShare,
    lowestReserveArea,
    peakDemandArea,
    hottestIntertie,
    strongestImportValue,
    strongestImportDetail,
    strongestExportValue,
    strongestExportDetail,
    largestUnit,
    topPlant,
    areaShareSegments,
    sourceShareSegments,
    reserveWatchItems,
    demandLeaderItems,
    intertieWatchItems,
    unitLeaderItems,
    plantLeaderItems,
  };
}

// ---------------------------------------------------------------------------
// buildAreaSupplyCards
// ---------------------------------------------------------------------------

export function buildAreaSupplyCards(params: {
  data: DashboardData;
  filteredIntertieSeries: IntertieSeries[];
  clampedNetworkFlowSlotIndex: number;
  allPlantSummaries: PlantSummaryRow[];
  reserveAreaMap: Map<string, AreaReserveSeries>;
  selectedArea: string;
  sourceColorByName: Map<string, string>;
  sourceTotalsByArea: Record<string, Array<{ source: string; totalKwh: number }>>;
}): AreaSupplyCard[] {
  const {
    data,
    filteredIntertieSeries,
    clampedNetworkFlowSlotIndex,
    allPlantSummaries,
    reserveAreaMap,
    selectedArea,
    sourceColorByName,
    sourceTotalsByArea,
  } = params;

  const totalGenerationKwh = data.generation.areaTotals.reduce((sum, item) => sum + item.totalKwh, 0);
  const areaFlowSummaryMap = new Map(data.flows.areaSummaries.map((item) => [item.area, item]));
  const netIntertieByArea = new Map<string, number>();
  const strongestPeerByArea = new Map<
    string,
    {
      counterpart: string;
      signedMw: number;
      magnitudeMw: number;
    }
  >();

  filteredIntertieSeries.forEach((row) => {
    const value = row.values[clampedNetworkFlowSlotIndex] ?? row.avgMw ?? 0;
    netIntertieByArea.set(row.sourceArea, (netIntertieByArea.get(row.sourceArea) ?? 0) - value);
    netIntertieByArea.set(row.targetArea, (netIntertieByArea.get(row.targetArea) ?? 0) + value);

    const sourceMagnitude = Math.abs(value);
    const sourceExisting = strongestPeerByArea.get(row.sourceArea);
    if (!sourceExisting || sourceMagnitude > sourceExisting.magnitudeMw) {
      strongestPeerByArea.set(row.sourceArea, {
        counterpart: row.targetArea,
        signedMw: -value,
        magnitudeMw: sourceMagnitude,
      });
    }

    const targetMagnitude = Math.abs(value);
    const targetExisting = strongestPeerByArea.get(row.targetArea);
    if (!targetExisting || targetMagnitude > targetExisting.magnitudeMw) {
      strongestPeerByArea.set(row.targetArea, {
        counterpart: row.sourceArea,
        signedMw: value,
        magnitudeMw: targetMagnitude,
      });
    }
  });

  const primaryPlantByArea = new Map<string, PlantSummaryRow>();
  allPlantSummaries.forEach((plant) => {
    if (!primaryPlantByArea.has(plant.area)) {
      primaryPlantByArea.set(plant.area, plant);
    }
  });

  const areaTotalMap = new Map(data.generation.areaTotals.map((item) => [item.area, item]));
  const allAreaNames = new Set<string>();
  data.generation.areaTotals.forEach((item) => allAreaNames.add(item.area));
  data.flows.areaSummaries.forEach((item) => allAreaNames.add(item.area));

  const rows = Array.from(allAreaNames).map((areaName) => {
    const item = areaTotalMap.get(areaName);
    const areaKwh = item?.totalKwh ?? 0;
    const sourceMix = buildTopShareSegments(
      sourceTotalsByArea[areaName] ?? [],
      areaKwh,
      4,
      (source) => normalizeSourceName(source.source),
      (source) => source.totalKwh,
      (source, idx) => sourceColorByName.get(source.source) ?? SOURCE_COLORS[idx % SOURCE_COLORS.length],
    );
    const topSource = sourceTotalsByArea[areaName]?.[0];
    const netIntertieMw = netIntertieByArea.get(areaName) ?? 0;
    const flowSummary = areaFlowSummaryMap.get(areaName);
    const peer = strongestPeerByArea.get(areaName);
    const primaryPlant = primaryPlantByArea.get(areaName);
    const reserve = reserveAreaMap.get(areaName);
    return {
      area: areaName,
      totalKwh: areaKwh,
      sharePercent: totalGenerationKwh > 0 ? (areaKwh / totalGenerationKwh) * 100 : 0,
      topSource: topSource?.source ?? "不明",
      topSourceShare:
        topSource && areaKwh > 0 ? (topSource.totalKwh / areaKwh) * 100 : 0,
      sourceMix,
      netIntertieMw,
      peer,
      primaryPlant,
      peakAbsMw: flowSummary?.peakAbsMw ?? 0,
      demandMw: reserve?.demandMw[clampedNetworkFlowSlotIndex] ?? 0,
      supplyMw: reserve?.supplyMw[clampedNetworkFlowSlotIndex] ?? 0,
      reserveMw: reserve?.reserveMw[clampedNetworkFlowSlotIndex] ?? 0,
      reserveRate: reserve?.reserveRate[clampedNetworkFlowSlotIndex] ?? 0,
      demandSeries: reserve?.demandMw ?? [],
      supplySeries: reserve?.supplyMw ?? [],
      reserveSeries: reserve?.reserveMw ?? [],
    };
  });

  const filteredRows =
    selectedArea === "全エリア" ? rows : rows.filter((item) => item.area === selectedArea);

  return filteredRows.sort((a, b) => compareAreaOrder(a.area, b.area));
}
