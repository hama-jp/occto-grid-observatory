import { describe, expect, test } from "vitest";
import {
  buildAreaGenerationTimeSeriesOption,
  calculateGenerationYAxisMax,
  type AreaGenerationSeries,
} from "./generator-status";

const series = (data: number[]): AreaGenerationSeries => ({
  name: "発電所",
  color: "#0f766e",
  data,
});

describe("generator status chart axes", () => {
  test("calculates a rounded common maximum across all areas", () => {
    expect(calculateGenerationYAxisMax([
      [series([100, 450])],
      [series([2_100, 3_800])],
      [series([900, 1_200])],
    ])).toBe(5_000);
  });

  test("applies the supplied common range to an area chart", () => {
    const option = buildAreaGenerationTimeSeriesOption(
      [series([100, 450])],
      ["00:00", "00:30"],
      "#0f766e",
      false,
      false,
      5_000,
    ) as { yAxis: { min: number; max: number } };

    expect(option.yAxis).toMatchObject({ min: 0, max: 5_000 });
  });

  test("leaves the upper bound automatic when all data is empty or zero", () => {
    expect(calculateGenerationYAxisMax([[], [series([0, 0])]])).toBeUndefined();
  });
});
