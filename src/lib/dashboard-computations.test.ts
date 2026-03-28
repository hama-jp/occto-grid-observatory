import { describe, it, expect } from "vitest";
import {
  buildAllPlantSummaries,
  buildInterAreaFlowTextRows,
} from "./dashboard-computations";

// ---------------------------------------------------------------------------
// buildAllPlantSummaries
// ---------------------------------------------------------------------------

describe("buildAllPlantSummaries", () => {
  it("returns sorted plantSummaries when available", () => {
    const result = buildAllPlantSummaries({
      plantSummaries: [
        { area: "東京", plantName: "A発電所", sourceType: "火力（ガス）", dailyKwh: 100_000, maxOutputManKw: 10 },
        { area: "東京", plantName: "B発電所", sourceType: "原子力", dailyKwh: 500_000, maxOutputManKw: 50 },
      ],
      topUnits: [],
    });
    expect(result).toHaveLength(2);
    expect(result[0].plantName).toBe("B発電所");
    expect(result[1].plantName).toBe("A発電所");
  });

  it("falls back to aggregating topUnits when plantSummaries is empty", () => {
    const result = buildAllPlantSummaries({
      plantSummaries: [],
      topUnits: [
        { area: "東京", plantName: "X発電所", unitName: "1号機", sourceType: "火力（ガス）", dailyKwh: 200_000, maxOutputManKw: 5 },
        { area: "東京", plantName: "X発電所", unitName: "2号機", sourceType: "火力（ガス）", dailyKwh: 150_000, maxOutputManKw: 4 },
        { area: "中部", plantName: "Y発電所", unitName: "1号機", sourceType: "原子力", dailyKwh: 600_000, maxOutputManKw: 20 },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0].plantName).toBe("Y発電所");
    expect(result[0].dailyKwh).toBe(600_000);
    expect(result[1].plantName).toBe("X発電所");
    expect(result[1].dailyKwh).toBe(350_000);
    expect(result[1].maxOutputManKw).toBe(9); // 5 + 4
  });

  it("returns empty array when both inputs are empty", () => {
    const result = buildAllPlantSummaries({
      plantSummaries: [],
      topUnits: [],
    });
    expect(result).toEqual([]);
  });

  it("uses plantSummaries when defined (ignoring topUnits)", () => {
    const result = buildAllPlantSummaries({
      plantSummaries: [
        { area: "北海道", plantName: "Z発電所", sourceType: "水力", dailyKwh: 50_000, maxOutputManKw: 3 },
      ],
      topUnits: [
        { area: "東京", plantName: "X発電所", unitName: "1号機", sourceType: "火力（ガス）", dailyKwh: 200_000, maxOutputManKw: 5 },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].plantName).toBe("Z発電所");
  });
});

// ---------------------------------------------------------------------------
// buildInterAreaFlowTextRows
// ---------------------------------------------------------------------------

describe("buildInterAreaFlowTextRows", () => {
  const baseSeries = [
    {
      intertieName: "連系線A",
      sourceArea: "東京",
      targetArea: "中部",
      peakAbsMw: 500,
      avgMw: 200,
      avgAbsMw: 200,
      values: [100, 200, -150, 300],
    },
    {
      intertieName: "連系線B",
      sourceArea: "東北",
      targetArea: "東京",
      peakAbsMw: 300,
      avgMw: 100,
      avgAbsMw: 100,
      values: [50, -80, 120, 90],
    },
  ];

  it("aggregates flow values by area pair at selected slot", () => {
    const result = buildInterAreaFlowTextRows({
      selectedArea: "全エリア",
      isMobileViewport: false,
      filteredIntertieSeries: baseSeries,
      clampedNetworkFlowSlotIndex: 0,
      interAreaFlows: [],
    });
    expect(result.length).toBeGreaterThan(0);
    const tokyoChubu = result.find(
      (row) => row.sourceArea === "東京" && row.targetArea === "中部",
    );
    expect(tokyoChubu).toBeDefined();
    expect(tokyoChubu!.upMw).toBe(100);
  });

  it("filters by selectedArea", () => {
    const result = buildInterAreaFlowTextRows({
      selectedArea: "東京",
      isMobileViewport: false,
      filteredIntertieSeries: baseSeries,
      clampedNetworkFlowSlotIndex: 0,
      interAreaFlows: [],
    });
    for (const row of result) {
      expect(row.sourceArea === "東京" || row.targetArea === "東京").toBe(true);
    }
  });

  it("handles negative flow values (splits into up/down)", () => {
    const result = buildInterAreaFlowTextRows({
      selectedArea: "全エリア",
      isMobileViewport: false,
      filteredIntertieSeries: baseSeries,
      clampedNetworkFlowSlotIndex: 2, // slot 2: -150 for line A, 120 for line B
      interAreaFlows: [],
    });
    const tokyoChubu = result.find(
      (row) => row.sourceArea === "東京" && row.targetArea === "中部",
    );
    // -150 means flow is reversed, so downMw should have the absolute value
    expect(tokyoChubu).toBeDefined();
    expect(tokyoChubu!.downMw).toBe(150);
  });

  it("falls back to interAreaFlows when intertieSeries is empty", () => {
    const result = buildInterAreaFlowTextRows({
      selectedArea: "全エリア",
      isMobileViewport: false,
      filteredIntertieSeries: [],
      clampedNetworkFlowSlotIndex: 0,
      interAreaFlows: [
        {
          sourceArea: "関西",
          targetArea: "中国",
          avgMw: 100,
          avgAbsMw: 100,
          peakAbsMw: 200,
          intertieCount: 1,
          intertieNames: ["連系線X"],
        },
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].sourceArea).toBe("関西");
  });

  it("returns empty when all inputs are empty", () => {
    const result = buildInterAreaFlowTextRows({
      selectedArea: "全エリア",
      isMobileViewport: false,
      filteredIntertieSeries: [],
      clampedNetworkFlowSlotIndex: 0,
      interAreaFlows: [],
    });
    expect(result).toEqual([]);
  });

  it("sorts by magnitudeMw descending", () => {
    const result = buildInterAreaFlowTextRows({
      selectedArea: "全エリア",
      isMobileViewport: false,
      filteredIntertieSeries: baseSeries,
      clampedNetworkFlowSlotIndex: 3,
      interAreaFlows: [],
    });
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].magnitudeMw).toBeGreaterThanOrEqual(result[i].magnitudeMw);
    }
  });
});
