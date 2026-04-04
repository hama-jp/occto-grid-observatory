import { describe, it, expect } from "vitest";
import {
  buildGenerationAggregates,
  buildFlowAggregates,
  buildAreaBalances,
  buildTimeLabels,
  timeToFiveMinuteIndex,
  resolveIntertieAreas,
  aggregateTo30Minute,
  quantile,
} from "./normalizers";
import type { GenerationRow, FlowRow } from "../../src/lib/dashboard-types";

// ---------------------------------------------------------------------------
// buildTimeLabels
// ---------------------------------------------------------------------------

describe("buildTimeLabels", () => {
  it("generates correct labels for 30-minute slots starting at 00:30", () => {
    const labels = buildTimeLabels(30, 4, 30);
    expect(labels).toEqual(["00:30", "01:00", "01:30", "02:00"]);
  });

  it("generates correct labels for 30-minute slots starting at 00:00", () => {
    const labels = buildTimeLabels(0, 3, 30);
    expect(labels).toEqual(["00:00", "00:30", "01:00"]);
  });

  it("returns empty array for 0 points", () => {
    expect(buildTimeLabels(0, 0, 30)).toEqual([]);
  });

  it("pads single-digit hours and minutes", () => {
    const labels = buildTimeLabels(5, 1, 30);
    expect(labels[0]).toBe("00:05");
  });
});

// ---------------------------------------------------------------------------
// timeToFiveMinuteIndex
// ---------------------------------------------------------------------------

describe("timeToFiveMinuteIndex", () => {
  it("returns 0 for 00:05 (first 5-minute slot)", () => {
    expect(timeToFiveMinuteIndex("00:05")).toBe(0);
  });

  it("returns 287 for 24:00 (last slot)", () => {
    expect(timeToFiveMinuteIndex("24:00")).toBe(287);
  });

  it("returns null for 00:00 (before first slot)", () => {
    expect(timeToFiveMinuteIndex("00:00")).toBeNull();
  });

  it("returns null for non-5-minute boundary", () => {
    expect(timeToFiveMinuteIndex("00:07")).toBeNull();
  });

  it("returns null for invalid format", () => {
    expect(timeToFiveMinuteIndex("abc")).toBeNull();
    expect(timeToFiveMinuteIndex("")).toBeNull();
  });

  it("returns correct index for 12:30", () => {
    // 12:30 = 750 minutes, (750-5)/5 = 149
    expect(timeToFiveMinuteIndex("12:30")).toBe(149);
  });
});

// ---------------------------------------------------------------------------
// aggregateTo30Minute
// ---------------------------------------------------------------------------

describe("aggregateTo30Minute", () => {
  it("averages 6 five-minute values into 30-minute slots", () => {
    const values5m = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
    const result = aggregateTo30Minute(values5m, 2);
    // Slot 0: avg(10,20,30,40,50,60) = 35
    // Slot 1: avg(70,80,90,100,110,120) = 95
    expect(result).toEqual([35, 95]);
  });

  it("handles fewer values than expected", () => {
    const values5m = [10, 20, 30];
    const result = aggregateTo30Minute(values5m, 2);
    // Slot 0: avg(10,20,30) = 20
    // Slot 1: 0 (no values)
    expect(result[0]).toBe(20);
    expect(result[1]).toBe(0);
  });

  it("returns zeros for empty input", () => {
    expect(aggregateTo30Minute([], 3)).toEqual([0, 0, 0]);
  });
});

// ---------------------------------------------------------------------------
// resolveIntertieAreas
// ---------------------------------------------------------------------------

describe("resolveIntertieAreas", () => {
  it("returns 不明 for unknown intertie name", () => {
    const result = resolveIntertieAreas("存在しない連系線");
    expect(result.sourceArea).toBe("不明");
    expect(result.targetArea).toBe("不明");
  });

  it("resolves known intertie names by exact match", () => {
    const result = resolveIntertieAreas("北海道・本州間電力連系設備");
    expect(result.sourceArea).toBe("北海道");
    expect(result.targetArea).toBe("東北");
  });

  it("resolves known intertie names by partial match (ignoring whitespace)", () => {
    const result = resolveIntertieAreas("相馬双葉幹線");
    expect(result.sourceArea).toBe("東北");
    expect(result.targetArea).toBe("東京");
  });
});

// ---------------------------------------------------------------------------
// quantile
// ---------------------------------------------------------------------------

describe("quantile", () => {
  it("returns 0 for empty array", () => {
    expect(quantile([], 0.5)).toBe(0);
  });

  it("returns the single value for single-element array", () => {
    expect(quantile([42], 0.5)).toBe(42);
  });

  it("returns median for odd-length array", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  it("interpolates for even-length array at p50", () => {
    const result = quantile([1, 2, 3, 4], 0.5);
    expect(result).toBe(2.5);
  });

  it("returns max at p100", () => {
    expect(quantile([10, 20, 30], 1)).toBe(30);
  });

  it("returns min at p0", () => {
    expect(quantile([10, 20, 30], 0)).toBe(10);
  });

  it("handles unsorted input", () => {
    expect(quantile([30, 10, 20], 0.5)).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// buildGenerationAggregates
// ---------------------------------------------------------------------------

describe("buildGenerationAggregates", () => {
  const genBase = { plantCode: "P001", targetDate: "2026/04/01", updatedAt: "2026-04-01T00:00:00Z" };
  const rows: GenerationRow[] = [
    { ...genBase, area: "東京", plantName: "A発電所", unitName: "1号機", sourceType: "火力", dailyKwh: 1000, values: [100, 200, 300, 400] },
    { ...genBase, area: "東京", plantName: "B発電所", unitName: "1号機", sourceType: "原子力", dailyKwh: 2000, values: [500, 500, 500, 500] },
    { ...genBase, area: "中部", plantName: "C発電所", unitName: "1号機", sourceType: "火力", dailyKwh: 500, values: [100, 100, 150, 150] },
  ];

  it("computes areaTotals sorted by totalKwh descending", () => {
    const result = buildGenerationAggregates(rows, 4, ["00:30", "01:00", "01:30", "02:00"]);
    expect(result.areaTotals).toHaveLength(2);
    expect(result.areaTotals[0].area).toBe("東京");
    expect(result.areaTotals[0].totalKwh).toBe(3000);
    expect(result.areaTotals[1].area).toBe("中部");
    expect(result.areaTotals[1].totalKwh).toBe(500);
  });

  it("computes sourceTotals sorted by totalKwh descending", () => {
    const result = buildGenerationAggregates(rows, 4, ["00:30", "01:00", "01:30", "02:00"]);
    expect(result.sourceTotals).toHaveLength(2);
    expect(result.sourceTotals[0].source).toBe("原子力");
    expect(result.sourceTotals[0].totalKwh).toBe(2000);
    expect(result.sourceTotals[1].source).toBe("火力");
    expect(result.sourceTotals[1].totalKwh).toBe(1500);
  });

  it("generates hourlyBySource with correct slot values", () => {
    const result = buildGenerationAggregates(rows, 4, ["00:30", "01:00", "01:30", "02:00"]);
    expect(result.hourlyBySource).toHaveLength(4);
    // At slot 0: 火力=100+100=200, 原子力=500
    expect(result.hourlyBySource[0].values["火力"]).toBe(200);
    expect(result.hourlyBySource[0].values["原子力"]).toBe(500);
  });

  it("generates hourlyBySourceByArea correctly", () => {
    const result = buildGenerationAggregates(rows, 4, ["00:30", "01:00", "01:30", "02:00"]);
    expect(result.hourlyBySourceByArea["東京"]).toHaveLength(4);
    expect(result.hourlyBySourceByArea["中部"]).toHaveLength(4);
    // 東京 slot 0: 火力=100, 原子力=500
    expect(result.hourlyBySourceByArea["東京"][0].values["火力"]).toBe(100);
    expect(result.hourlyBySourceByArea["東京"][0].values["原子力"]).toBe(500);
  });

  it("generates plantSummaries aggregated by plant", () => {
    const result = buildGenerationAggregates(rows, 4, ["00:30", "01:00", "01:30", "02:00"]);
    expect(result.plantSummaries).toHaveLength(3);
    expect(result.plantSummaries[0].plantName).toBe("B発電所");
  });

  it("limits topUnits to 60", () => {
    const manyRows: GenerationRow[] = Array.from({ length: 100 }, (_, i) => ({
      ...genBase,
      area: "東京",
      plantName: `P${i}`,
      unitName: `U${i}`,
      sourceType: "火力",
      dailyKwh: 100 - i,
      values: [10],
    }));
    const result = buildGenerationAggregates(manyRows, 1, ["00:30"]);
    expect(result.topUnits).toHaveLength(60);
    expect(result.topUnits[0].dailyKwh).toBe(100);
  });

  it("returns empty arrays for empty input", () => {
    const result = buildGenerationAggregates([], 48, []);
    expect(result.areaTotals).toEqual([]);
    expect(result.sourceTotals).toEqual([]);
    expect(result.topUnits).toEqual([]);
    expect(result.unitSeries).toEqual([]);
    expect(result.plantSummaries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildFlowAggregates
// ---------------------------------------------------------------------------

describe("buildFlowAggregates", () => {
  const flowBase = { targetDate: "2026/04/01" };
  const flowRows: FlowRow[] = [
    { ...flowBase, area: "東京", voltageKv: "500", lineName: "線路A", positiveDirection: "北→南", values: [100, -200, 300, -400] },
    { ...flowBase, area: "東京", voltageKv: "275", lineName: "線路B", positiveDirection: "東→西", values: [50, 50, 50, 50] },
    { ...flowBase, area: "中部", voltageKv: "500", lineName: "線路C", positiveDirection: "北→南", values: [10, 20, 30, 40] },
  ];

  it("computes lineSeries with peakAbsMw and avgMw", () => {
    const result = buildFlowAggregates(flowRows, [], 4, ["00:00", "00:30", "01:00", "01:30"]);
    const lineA = result.lineSeries.find((l) => l.lineName === "線路A");
    expect(lineA).toBeDefined();
    expect(lineA!.peakAbsMw).toBe(400);
  });

  it("sorts lineSeries by peakAbsMw descending", () => {
    const result = buildFlowAggregates(flowRows, [], 4, ["00:00", "00:30", "01:00", "01:30"]);
    for (let i = 1; i < result.lineSeries.length; i++) {
      expect(result.lineSeries[i - 1].peakAbsMw).toBeGreaterThanOrEqual(result.lineSeries[i].peakAbsMw);
    }
  });

  it("computes areaSummaries with correct line counts", () => {
    const result = buildFlowAggregates(flowRows, [], 4, ["00:00", "00:30", "01:00", "01:30"]);
    const tokyo = result.areaSummaries.find((a) => a.area === "東京");
    expect(tokyo).toBeDefined();
    expect(tokyo!.lineCount).toBe(2);
  });

  it("returns empty for no flow rows", () => {
    const result = buildFlowAggregates([], [], 4, ["00:00", "00:30", "01:00", "01:30"]);
    expect(result.lineSeries).toEqual([]);
    expect(result.areaSummaries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// buildAreaBalances
// ---------------------------------------------------------------------------

describe("buildAreaBalances", () => {
  it("computes stress index correctly", () => {
    const areaTotals = [{ area: "東京", totalKwh: 24_000_000 }]; // 1000 MW avg
    const areaSummaries = [{ area: "東京", lineCount: 5, peakAbsMw: 500, avgAbsMw: 200 }];
    const result = buildAreaBalances(areaTotals, areaSummaries);
    expect(result).toHaveLength(1);
    expect(result[0].stressIndex).toBe(0.5); // 500/1000
  });

  it("returns 0 stress for zero generation", () => {
    const areaTotals = [{ area: "東京", totalKwh: 0 }];
    const areaSummaries = [{ area: "東京", lineCount: 1, peakAbsMw: 100, avgAbsMw: 50 }];
    const result = buildAreaBalances(areaTotals, areaSummaries);
    expect(result[0].stressIndex).toBe(0);
  });

  it("handles missing flow data for an area", () => {
    const areaTotals = [{ area: "北海道", totalKwh: 10_000_000 }];
    const result = buildAreaBalances(areaTotals, []);
    expect(result[0].peakAbsMw).toBe(0);
    expect(result[0].lineCount).toBe(0);
  });
});
