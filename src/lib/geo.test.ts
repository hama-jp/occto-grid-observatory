import { describe, expect, test } from "vitest";
import {
  parseDirection,
  buildStationNodeId,
  buildPowerNodeId,
  normalizeStationName,
  isPseudoAreaNodeName,
  isLineLikeNodeName,
  isCompositeFacilityNodeName,
  isVirtualBranchNodeName,
  isConverterStationName,
  isNetworkPowerPlantSource,
  geoToCanvas,
  clampPointToMapBounds,
  buildSvgQuadraticPath,
  formatSvgMatrixTransform,
  buildCurvedLineCoords,
  expandAreaBounds,
  projectPointToAreaEdge,
  areCloseEnough,
  areNetworkOverlayTransformPartsEqual,
  areNetworkOverlayViewportsEqual,
  DEFAULT_NETWORK_OVERLAY_VIEWPORT,
  AREA_ANCHORS,
  AREA_LAYOUT_BOUNDS,
  flowMagnitudeColor,
  buildJapanGuideGraphics,
} from "./geo";

// ---------- parseDirection ----------
describe("parseDirection", () => {
  test("parses arrow separator →", () => {
    expect(parseDirection("東京 → 東北")).toEqual({ source: "東京", target: "東北" });
  });
  test("parses arrow separator ->", () => {
    expect(parseDirection("中部->関西")).toEqual({ source: "中部", target: "関西" });
  });
  test("parses double arrow ⇒", () => {
    expect(parseDirection("九州 ⇒ 四国")).toEqual({ source: "九州", target: "四国" });
  });
  test("returns null for single part", () => {
    expect(parseDirection("東京")).toBeNull();
  });
  test("returns null for empty string", () => {
    expect(parseDirection("")).toBeNull();
  });
  test("handles extra whitespace", () => {
    expect(parseDirection("  東京  →  東北  ")).toEqual({ source: "東京", target: "東北" });
  });
});

// ---------- buildStationNodeId / buildPowerNodeId ----------
describe("buildStationNodeId", () => {
  test("builds expected format", () => {
    expect(buildStationNodeId("東京", "新京葉変電所")).toBe("station::東京::新京葉変電所");
  });
  test("trims whitespace", () => {
    expect(buildStationNodeId(" 東京 ", " 新京葉 ")).toBe("station::東京::新京葉");
  });
});

describe("buildPowerNodeId", () => {
  test("builds expected format", () => {
    expect(buildPowerNodeId("東北", "東新潟火力")).toBe("power::東北::東新潟火力");
  });
});

// ---------- normalizeStationName ----------
describe("normalizeStationName", () => {
  test("removes 変電所 suffix", () => {
    expect(normalizeStationName("新京葉変電所")).toBe("新京葉");
  });
  test("removes 開閉所 suffix", () => {
    expect(normalizeStationName("東海開閉所")).toBe("東海");
  });
  test("removes unit numbers", () => {
    expect(normalizeStationName("柏崎刈羽1号機")).toBe("柏崎刈羽");
  });
  test("removes parenthetical annotations", () => {
    expect(normalizeStationName("新京葉（仮）")).toBe("新京葉");
  });
  test("removes full-width parenthetical", () => {
    expect(normalizeStationName("新京葉（東京）")).toBe("新京葉");
  });
  test("strips SS suffix", () => {
    expect(normalizeStationName("東京SS")).toBe("東京");
  });
  test("normalizes NFKC", () => {
    // Full-width numbers get normalized
    expect(normalizeStationName("柏崎刈羽１号機")).toBe("柏崎刈羽");
  });
  test("removes 幹線", () => {
    expect(normalizeStationName("北本幹線")).toBe("北本");
  });
});

// ---------- isPseudoAreaNodeName ----------
describe("isPseudoAreaNodeName", () => {
  test("matches exact area names", () => {
    expect(isPseudoAreaNodeName("東京")).toBe(true);
    expect(isPseudoAreaNodeName("北海道")).toBe(true);
    expect(isPseudoAreaNodeName("沖縄")).toBe(true);
  });
  test("matches area with エリア suffix", () => {
    expect(isPseudoAreaNodeName("東京エリア")).toBe(true);
  });
  test("rejects non-area names", () => {
    expect(isPseudoAreaNodeName("新京葉変電所")).toBe(false);
  });
  test("strips punctuation before matching", () => {
    expect(isPseudoAreaNodeName("東京！")).toBe(true);
  });
});

// ---------- isLineLikeNodeName ----------
describe("isLineLikeNodeName", () => {
  test("matches 幹線", () => {
    expect(isLineLikeNodeName("北本幹線")).toBe(true);
  });
  test("matches 連系線", () => {
    expect(isLineLikeNodeName("東北東京連系線")).toBe(true);
  });
  test("matches 線 suffix", () => {
    expect(isLineLikeNodeName("南北線")).toBe(true);
  });
  test("does not match 変電所 with 幹線", () => {
    expect(isLineLikeNodeName("北本幹線変電所")).toBe(false);
  });
  test("rejects station names", () => {
    expect(isLineLikeNodeName("新京葉変電所")).toBe(false);
  });
});

// ---------- isCompositeFacilityNodeName ----------
describe("isCompositeFacilityNodeName", () => {
  test("matches composite with ・ separator", () => {
    expect(isCompositeFacilityNodeName("東海変電所・東海発電所")).toBe(true);
  });
  test("rejects single facility", () => {
    expect(isCompositeFacilityNodeName("東海変電所")).toBe(false);
  });
  test("rejects no facility keywords", () => {
    expect(isCompositeFacilityNodeName("東海・西海")).toBe(false);
  });
});

// ---------- isVirtualBranchNodeName ----------
describe("isVirtualBranchNodeName", () => {
  test("matches T-branch pattern", () => {
    expect(isVirtualBranchNodeName("3T")).toBe(true);
    expect(isVirtualBranchNodeName("12T")).toBe(true);
  });
  test("matches 分岐点", () => {
    expect(isVirtualBranchNodeName("分岐点")).toBe(true);
  });
  test("matches 電名", () => {
    expect(isVirtualBranchNodeName("電名")).toBe(true);
  });
  test("rejects normal station", () => {
    expect(isVirtualBranchNodeName("新京葉変電所")).toBe(false);
  });
  test("rejects empty string", () => {
    expect(isVirtualBranchNodeName("")).toBe(false);
  });
});

// ---------- isConverterStationName ----------
describe("isConverterStationName", () => {
  test("matches 変換所", () => {
    expect(isConverterStationName("新北本変換所")).toBe(true);
  });
  test("matches CS suffix", () => {
    expect(isConverterStationName("新北本CS")).toBe(true);
  });
  test("case insensitive CS", () => {
    expect(isConverterStationName("testcs")).toBe(true);
  });
  test("rejects 変電所", () => {
    expect(isConverterStationName("新京葉変電所")).toBe(false);
  });
});

// ---------- isNetworkPowerPlantSource ----------
describe("isNetworkPowerPlantSource", () => {
  test("matches 火力", () => {
    expect(isNetworkPowerPlantSource("火力")).toBe(true);
    expect(isNetworkPowerPlantSource("石炭火力")).toBe(true);
  });
  test("matches 原子力", () => {
    expect(isNetworkPowerPlantSource("原子力")).toBe(true);
  });
  test("matches 水力", () => {
    expect(isNetworkPowerPlantSource("水力")).toBe(true);
  });
  test("rejects 太陽光", () => {
    expect(isNetworkPowerPlantSource("太陽光")).toBe(false);
  });
  test("rejects empty", () => {
    expect(isNetworkPowerPlantSource("")).toBe(false);
  });
});

// ---------- geoToCanvas ----------
describe("geoToCanvas", () => {
  test("maps lat/lon within Japan bounds to canvas coordinates", () => {
    // Tokyo Station approx: 35.6812, 139.7671
    const result = geoToCanvas(35.6812, 139.7671);
    expect(result.x).toBeGreaterThan(30);
    expect(result.x).toBeLessThan(890);
    expect(result.y).toBeGreaterThan(30);
    expect(result.y).toBeLessThan(530);
  });
  test("northern latitude maps to smaller y", () => {
    const north = geoToCanvas(45, 140);
    const south = geoToCanvas(25, 140);
    expect(north.y).toBeLessThan(south.y);
  });
  test("eastern longitude maps to larger x", () => {
    const east = geoToCanvas(35, 145);
    const west = geoToCanvas(35, 125);
    expect(east.x).toBeGreaterThan(west.x);
  });
});

// ---------- clampPointToMapBounds ----------
describe("clampPointToMapBounds", () => {
  test("clamps point within padding bounds", () => {
    const result = clampPointToMapBounds({ x: -100, y: -100 });
    expect(result.x).toBe(30);
    expect(result.y).toBe(30);
  });
  test("clamps point exceeding max bounds", () => {
    const result = clampPointToMapBounds({ x: 2000, y: 2000 });
    expect(result.x).toBe(890);
    expect(result.y).toBe(530);
  });
  test("preserves point within bounds", () => {
    const result = clampPointToMapBounds({ x: 400, y: 300 });
    expect(result.x).toBe(400);
    expect(result.y).toBe(300);
  });
});

// ---------- buildSvgQuadraticPath ----------
describe("buildSvgQuadraticPath", () => {
  test("builds Q path from 3 points", () => {
    const path = buildSvgQuadraticPath([[0, 0], [50, 100], [100, 0]]);
    expect(path).toBe("M 0 0 Q 50 100 100 0");
  });
  test("returns empty for fewer than 3 points", () => {
    expect(buildSvgQuadraticPath([[0, 0], [50, 50]])).toBe("");
    expect(buildSvgQuadraticPath([])).toBe("");
  });
});

// ---------- formatSvgMatrixTransform ----------
describe("formatSvgMatrixTransform", () => {
  test("formats identity transform", () => {
    expect(formatSvgMatrixTransform({ x: 0, y: 0, scaleX: 1, scaleY: 1 })).toBe("matrix(1 0 0 1 0 0)");
  });
  test("formats scaled/translated transform", () => {
    expect(formatSvgMatrixTransform({ x: 10, y: 20, scaleX: 2, scaleY: 3 })).toBe("matrix(2 0 0 3 10 20)");
  });
});

// ---------- buildCurvedLineCoords ----------
describe("buildCurvedLineCoords", () => {
  test("returns 3 control points", () => {
    const coords = buildCurvedLineCoords({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.1);
    expect(coords).toHaveLength(3);
    expect(coords[0]).toEqual([0, 0]);
    expect(coords[2]).toEqual([100, 0]);
  });
  test("zero curveness produces straight midpoint", () => {
    const coords = buildCurvedLineCoords({ x: 0, y: 0 }, { x: 100, y: 0 }, 0);
    expect(coords[1][0]).toBe(50);
    expect(coords[1][1]).toBe(0);
  });
  test("positive curveness offsets the midpoint", () => {
    const coords = buildCurvedLineCoords({ x: 0, y: 0 }, { x: 100, y: 0 }, 0.5);
    expect(coords[1][1]).not.toBe(0); // midpoint y should be offset
  });
});

// ---------- expandAreaBounds ----------
describe("expandAreaBounds", () => {
  test("expands bounds by margin", () => {
    const result = expandAreaBounds({ xMin: 100, xMax: 200, yMin: 100, yMax: 200 }, 10);
    expect(result).toEqual({ xMin: 90, xMax: 210, yMin: 90, yMax: 210 });
  });
});

// ---------- projectPointToAreaEdge ----------
describe("projectPointToAreaEdge", () => {
  const bounds = { xMin: 0, xMax: 100, yMin: 0, yMax: 100 };

  test("projects to right edge for positive x direction", () => {
    const result = projectPointToAreaEdge(bounds, { x: 100, y: 0 });
    expect(result.x).toBe(100);
  });
  test("projects to bottom edge for positive y direction", () => {
    const result = projectPointToAreaEdge(bounds, { x: 0, y: 100 });
    expect(result.y).toBe(100);
  });
});

// ---------- areCloseEnough ----------
describe("areCloseEnough", () => {
  test("true for identical values", () => {
    expect(areCloseEnough(1.0, 1.0)).toBe(true);
  });
  test("true for very close values", () => {
    expect(areCloseEnough(1.0, 1.005)).toBe(true);
  });
  test("false for divergent values", () => {
    expect(areCloseEnough(1.0, 1.02)).toBe(false);
  });
});

// ---------- areNetworkOverlayTransformPartsEqual ----------
describe("areNetworkOverlayTransformPartsEqual", () => {
  test("equal parts", () => {
    const part = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
    expect(areNetworkOverlayTransformPartsEqual(part, { ...part })).toBe(true);
  });
  test("different parts", () => {
    const a = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
    const b = { x: 10, y: 0, scaleX: 1, scaleY: 1 };
    expect(areNetworkOverlayTransformPartsEqual(a, b)).toBe(false);
  });
});

// ---------- areNetworkOverlayViewportsEqual ----------
describe("areNetworkOverlayViewportsEqual", () => {
  test("equal viewports", () => {
    expect(areNetworkOverlayViewportsEqual(
      DEFAULT_NETWORK_OVERLAY_VIEWPORT,
      { ...DEFAULT_NETWORK_OVERLAY_VIEWPORT },
    )).toBe(true);
  });
});

// ---------- Module-level computed constants ----------
describe("module-level computed constants", () => {
  test("AREA_ANCHORS contains all 10 areas plus default", () => {
    const areas = ["北海道", "東北", "東京", "中部", "北陸", "関西", "中国", "四国", "九州", "沖縄"];
    for (const area of areas) {
      expect(AREA_ANCHORS[area]).toBeDefined();
      expect(AREA_ANCHORS[area].x).toBeGreaterThan(0);
      expect(AREA_ANCHORS[area].y).toBeGreaterThan(0);
    }
    expect(AREA_ANCHORS.default).toBeDefined();
  });

  test("AREA_LAYOUT_BOUNDS has valid bounds for each area", () => {
    const areas = ["北海道", "東北", "東京", "中部", "北陸", "関西", "中国", "四国", "九州"];
    for (const area of areas) {
      const bounds = AREA_LAYOUT_BOUNDS[area];
      expect(bounds).toBeDefined();
      expect(bounds.xMax).toBeGreaterThanOrEqual(bounds.xMin);
      expect(bounds.yMax).toBeGreaterThanOrEqual(bounds.yMin);
    }
  });

  test("area anchors fall within their layout bounds", () => {
    const areas = ["北海道", "東北", "東京", "中部", "北陸", "関西", "中国", "四国", "九州"];
    for (const area of areas) {
      const anchor = AREA_ANCHORS[area];
      const bounds = AREA_LAYOUT_BOUNDS[area];
      if (!anchor || !bounds) continue;
      expect(anchor.x).toBeGreaterThanOrEqual(bounds.xMin);
      expect(anchor.x).toBeLessThanOrEqual(bounds.xMax);
      expect(anchor.y).toBeGreaterThanOrEqual(bounds.yMin);
      expect(anchor.y).toBeLessThanOrEqual(bounds.yMax);
    }
  });
});

// ---------- flowMagnitudeColor ----------
describe("flowMagnitudeColor", () => {
  test("returns rgba string", () => {
    const color = flowMagnitudeColor(0.5);
    expect(color).toMatch(/^rgba\(\d+,\d+,\d+,[\d.]+\)$/);
  });
  test("low magnitude produces blue-ish color", () => {
    const color = flowMagnitudeColor(0);
    const match = color.match(/rgba\((\d+),(\d+),(\d+)/);
    expect(match).not.toBeNull();
    const [, r, , b] = match!;
    expect(Number(b)).toBeGreaterThan(Number(r));
  });
  test("high magnitude produces red-ish color", () => {
    const color = flowMagnitudeColor(1);
    const match = color.match(/rgba\((\d+),(\d+),(\d+)/);
    expect(match).not.toBeNull();
    const [, r, , b] = match!;
    expect(Number(r)).toBeGreaterThan(Number(b));
  });
  test("clamps out-of-range values", () => {
    expect(flowMagnitudeColor(-0.5)).toBe(flowMagnitudeColor(0));
    expect(flowMagnitudeColor(1.5)).toBe(flowMagnitudeColor(1));
  });
  test("custom alpha", () => {
    const color = flowMagnitudeColor(0.5, 0.5);
    expect(color).toContain(",0.5)");
  });
});

// ---------- buildJapanGuideGraphics ----------
describe("buildJapanGuideGraphics", () => {
  test("returns array of polygon graphic elements", () => {
    const graphics = buildJapanGuideGraphics();
    expect(graphics.length).toBeGreaterThanOrEqual(4);
    for (const graphic of graphics) {
      expect(graphic.type).toBe("polygon");
      expect(graphic.silent).toBe(true);
      expect(graphic.shape).toBeDefined();
      expect((graphic.shape as { points: unknown[] }).points.length).toBeGreaterThan(3);
    }
  });
});
