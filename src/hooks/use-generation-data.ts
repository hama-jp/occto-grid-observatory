"use client";

import { useMemo } from "react";
import type { DashboardData } from "@/lib/dashboard-types";
import { SOURCE_COLORS, SOURCE_COLOR_MAP } from "@/lib/constants";
import { isNetworkPowerPlantSource } from "@/lib/geo";
import { buildAllPlantSummaries } from "@/lib/dashboard-computations";

/**
 * Derives generation-related aggregates from DashboardData.
 *
 * Extracted from DashboardApp to keep the main component focused on layout
 * and to make the derivation logic independently testable.
 */
export function useGenerationData(data: DashboardData, selectedArea: string) {
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

  const sourceColorByName = useMemo(
    () =>
      new Map(
        data.generation.sourceTotals.map((item, idx) => [
          item.source,
          SOURCE_COLOR_MAP[item.source] ?? SOURCE_COLORS[idx % SOURCE_COLORS.length],
        ]),
      ),
    [data.generation.sourceTotals],
  );

  const allPlantSummaries = useMemo(
    () =>
      buildAllPlantSummaries({
        plantSummaries: data.generation.plantSummaries,
        topUnits: data.generation.topUnits,
      }),
    [data.generation.plantSummaries, data.generation.topUnits],
  );

  const filteredTopUnits = useMemo(
    () =>
      [...data.generation.topUnits]
        .filter((unit) => (selectedArea === "全エリア" ? true : unit.area === selectedArea))
        .sort((a, b) => b.dailyKwh - a.dailyKwh),
    [data.generation.topUnits, selectedArea],
  );

  const filteredTopPlants = useMemo(
    () =>
      allPlantSummaries.filter((plant) =>
        selectedArea === "全エリア" ? true : plant.area === selectedArea,
      ),
    [allPlantSummaries, selectedArea],
  );

  const networkPowerPlants = useMemo(() => {
    if (allPlantSummaries.length === 0) return [];
    return allPlantSummaries
      .filter((plant) => isNetworkPowerPlantSource(plant.sourceType))
      .map((plant) => ({
        area: plant.area,
        plantName: plant.plantName,
        sourceType: plant.sourceType,
        dailyKwh: plant.dailyKwh,
        avgOutputMw: plant.dailyKwh / 24 / 1000,
        maxOutputManKw: plant.maxOutputManKw,
      }));
  }, [allPlantSummaries]);

  const filteredLines = useMemo(
    () =>
      data.flows.lineSeries.filter((line) =>
        selectedArea === "全エリア" ? true : line.area === selectedArea,
      ),
    [data.flows.lineSeries, selectedArea],
  );

  return {
    sourceTotalsByArea,
    sourceColorByName,
    allPlantSummaries,
    filteredTopUnits,
    filteredTopPlants,
    networkPowerPlants,
    filteredLines,
  };
}
