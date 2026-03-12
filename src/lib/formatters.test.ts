import { describe, expect, test } from "vitest";
import {
  clamp,
  roundTo,
  hashSeed,
  formatCompactEnergy,
  formatVoltageKv,
  formatJstDateTime,
  toDateStamp,
  toInputDateValue,
  toDisplayDateValue,
  normalizeSourceName,
  compareAreaOrder,
  buildTopShareSegments,
} from "./formatters";

describe("clamp", () => {
  test("returns value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  test("clamps to min", () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });
  test("clamps to max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
  test("handles equal min and max", () => {
    expect(clamp(5, 3, 3)).toBe(3);
  });
});

describe("roundTo", () => {
  test("rounds to 0 digits", () => {
    expect(roundTo(3.7, 0)).toBe(4);
  });
  test("rounds to 2 digits", () => {
    expect(roundTo(1.235, 2)).toBe(1.24);
  });
  test("rounds negative values", () => {
    expect(roundTo(-1.555, 1)).toBe(-1.6);
  });
});

describe("hashSeed", () => {
  test("returns non-negative integer", () => {
    const result = hashSeed("test");
    expect(result).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result)).toBe(true);
  });
  test("same input produces same output", () => {
    expect(hashSeed("abc")).toBe(hashSeed("abc"));
  });
  test("different inputs produce different outputs", () => {
    expect(hashSeed("abc")).not.toBe(hashSeed("xyz"));
  });
  test("handles empty string", () => {
    expect(hashSeed("")).toBe(0);
  });
});

describe("formatCompactEnergy", () => {
  test("formats kWh for small values", () => {
    expect(formatCompactEnergy(500)).toBe("500 kWh");
  });
  test("formats MWh", () => {
    expect(formatCompactEnergy(1_500)).toMatch(/1\.5 MWh/);
  });
  test("formats GWh", () => {
    expect(formatCompactEnergy(2_500_000)).toMatch(/2\.5 GWh/);
  });
  test("formats TWh", () => {
    expect(formatCompactEnergy(3_000_000_000)).toMatch(/3 TWh/);
  });
  test("handles zero", () => {
    expect(formatCompactEnergy(0)).toBe("0 kWh");
  });
  test("handles negative values", () => {
    expect(formatCompactEnergy(-2_000_000)).toMatch(/GWh/);
  });
});

describe("formatVoltageKv", () => {
  test("appends kV to bare number", () => {
    expect(formatVoltageKv("500")).toBe("500kV");
  });
  test("normalizes kv casing", () => {
    expect(formatVoltageKv("275kv")).toBe("275kV");
  });
  test("returns empty for blank input", () => {
    expect(formatVoltageKv("")).toBe("");
    expect(formatVoltageKv(undefined)).toBe("");
  });
  test("preserves string with V", () => {
    expect(formatVoltageKv("500kV")).toBe("500kV");
  });
});

describe("formatJstDateTime", () => {
  test("formats ISO date string", () => {
    const result = formatJstDateTime("2026-03-10T12:00:00+09:00");
    expect(result).toContain("2026");
    expect(result).toContain("03");
    expect(result).toContain("10");
  });
  test("returns original for invalid date", () => {
    expect(formatJstDateTime("not-a-date")).toBe("not-a-date");
  });
});

describe("toDateStamp", () => {
  test("removes slashes", () => {
    expect(toDateStamp("2026/03/10")).toBe("20260310");
  });
  test("removes hyphens", () => {
    expect(toDateStamp("2026-03-10")).toBe("20260310");
  });
  test("trims whitespace", () => {
    expect(toDateStamp("  2026/03/10  ")).toBe("20260310");
  });
});

describe("toInputDateValue", () => {
  test("converts slash format", () => {
    expect(toInputDateValue("2026/03/10")).toBe("2026-03-10");
  });
  test("passes through hyphen format", () => {
    expect(toInputDateValue("2026-03-10")).toBe("2026-03-10");
  });
  test("returns empty for invalid", () => {
    expect(toInputDateValue("invalid")).toBe("");
    expect(toInputDateValue("")).toBe("");
  });
});

describe("toDisplayDateValue", () => {
  test("converts hyphen to slash", () => {
    expect(toDisplayDateValue("2026-03-10")).toBe("2026/03/10");
  });
  test("passes through slash format", () => {
    expect(toDisplayDateValue("2026/03/10")).toBe("2026/03/10");
  });
  test("returns empty for blank", () => {
    expect(toDisplayDateValue("")).toBe("");
  });
  test("returns original for unrecognized format", () => {
    expect(toDisplayDateValue("March 10")).toBe("March 10");
  });
});

describe("normalizeSourceName", () => {
  test("trims whitespace", () => {
    expect(normalizeSourceName("  火力  ")).toBe("火力");
  });
  test("returns 不明 for empty string", () => {
    expect(normalizeSourceName("")).toBe("不明");
    expect(normalizeSourceName("   ")).toBe("不明");
  });
});

describe("compareAreaOrder", () => {
  test("北海道 comes before 東北", () => {
    expect(compareAreaOrder("北海道", "東北")).toBeLessThan(0);
  });
  test("沖縄 comes after 九州", () => {
    expect(compareAreaOrder("沖縄", "九州")).toBeGreaterThan(0);
  });
  test("unknown areas sort after known ones", () => {
    expect(compareAreaOrder("不明エリア", "北海道")).toBeGreaterThan(0);
  });
  test("two unknown areas sort by locale", () => {
    const result = compareAreaOrder("あ", "い");
    expect(typeof result).toBe("number");
  });
});

describe("buildTopShareSegments", () => {
  const rows = [
    { name: "火力", value: 500 },
    { name: "原子力", value: 300 },
    { name: "水力", value: 100 },
    { name: "太陽光", value: 80 },
    { name: "風力", value: 20 },
  ];
  const total = 1000;
  const getLabel = (r: (typeof rows)[0]) => r.name;
  const getValue = (r: (typeof rows)[0]) => r.value;
  const getColor = (_r: (typeof rows)[0], i: number) => `#${i}`;

  test("returns top N segments plus その他", () => {
    const segments = buildTopShareSegments(rows, total, 3, getLabel, getValue, getColor);
    expect(segments).toHaveLength(4);
    expect(segments[0].label).toBe("火力");
    expect(segments[0].percent).toBe(50);
    expect(segments[3].label).toBe("その他");
    expect(segments[3].percent).toBe(10);
  });

  test("returns empty for zero total", () => {
    expect(buildTopShareSegments(rows, 0, 3, getLabel, getValue, getColor)).toEqual([]);
  });

  test("returns empty for empty rows", () => {
    expect(buildTopShareSegments([], 100, 3, getLabel, getValue, getColor)).toEqual([]);
  });

  test("no その他 when limit exceeds rows", () => {
    const segments = buildTopShareSegments(rows, total, 10, getLabel, getValue, getColor);
    expect(segments.every((s) => s.label !== "その他")).toBe(true);
  });

  test("filters out zero-percent segments", () => {
    const rowsWithZero = [{ name: "A", value: 0 }];
    const segments = buildTopShareSegments(rowsWithZero, 100, 5, (r) => r.name, (r) => r.value, () => "#000");
    expect(segments).toHaveLength(0);
  });
});
