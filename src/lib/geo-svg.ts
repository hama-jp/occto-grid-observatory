/**
 * SVG path generation, flow color mapping, and Japan guide paths.
 */

import { clamp } from "./formatters";
import { geoToCanvas } from "./geo-coordinates";
import { JAPAN_ISLAND_COORDS } from "./geo-hints";

// ---------------------------------------------------------------------------
// Flow color
// ---------------------------------------------------------------------------

/**
 * Map a 0-1 magnitude to a color gradient from blue (low) to red (high).
 * Returns an rgba string suitable for SVG stroke.
 */
export function flowMagnitudeColor(magnitude: number, alpha = 0.85): string {
  const t = clamp(magnitude, 0, 1);
  // Blue (low) → Cyan → Yellow → Orange → Red (high)
  let r: number, g: number, b: number;
  if (t < 0.25) {
    const s = t / 0.25;
    r = 30;
    g = Math.round(80 + s * 140);
    b = Math.round(220 - s * 30);
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    r = Math.round(30 + s * 200);
    g = Math.round(220 - s * 20);
    b = Math.round(190 - s * 140);
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    r = Math.round(230 + s * 25);
    g = Math.round(200 - s * 100);
    b = Math.round(50 - s * 30);
  } else {
    const s = (t - 0.75) / 0.25;
    r = 255;
    g = Math.round(100 - s * 70);
    b = Math.round(20 + s * 10);
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------------------------------------------------------------------------
// Curved line / SVG path builders
// ---------------------------------------------------------------------------

export function buildCurvedLineCoords(
  from: { x: number; y: number },
  to: { x: number; y: number },
  curveness: number,
): Array<[number, number]> {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const offset = length * curveness * 0.95;

  return [
    [from.x, from.y],
    [midX + normalX * offset, midY + normalY * offset],
    [to.x, to.y],
  ];
}

export function buildSvgQuadraticPath(coords: Array<[number, number]>): string {
  if (coords.length < 3) {
    return "";
  }
  const [[startX, startY], [controlX, controlY], [endX, endY]] = coords;
  return `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
}

export function buildLinkCurvenessMap(
  links: Array<{ source: string; target: string }>,
  positions: Map<string, { x: number; y: number }>,
): Map<string, number> {
  const offsetsByNode = new Map<string, Map<string, number>>();

  const registerNodeOffsets = (nodeId: string, sortAngle: (link: { source: string; target: string }) => number): void => {
    const incidentLinks = links.filter((link) => link.source === nodeId || link.target === nodeId);
    const nodePosition = positions.get(nodeId);
    if (!nodePosition || incidentLinks.length === 0) {
      return;
    }

    incidentLinks.sort((a, b) => sortAngle(a) - sortAngle(b));
    const offsets = new Map<string, number>();
    const center = (incidentLinks.length - 1) / 2;
    incidentLinks.forEach((link, index) => {
      const key = `${link.source}=>${link.target}`;
      offsets.set(key, (index - center) * 0.034);
    });
    offsetsByNode.set(nodeId, offsets);
  };

  positions.forEach((_position, nodeId) => {
    registerNodeOffsets(nodeId, (link) => {
      const from = positions.get(nodeId);
      const other = positions.get(link.source === nodeId ? link.target : link.source);
      if (!from || !other) {
        return 0;
      }
      return Math.atan2(other.y - from.y, other.x - from.x);
    });
  });

  const curvenessByLink = new Map<string, number>();
  links.forEach((link) => {
    const key = `${link.source}=>${link.target}`;
    const sourceOffset = offsetsByNode.get(link.source)?.get(key) ?? 0;
    const targetOffset = offsetsByNode.get(link.target)?.get(key) ?? 0;
    const curveness = clamp((sourceOffset - targetOffset) * 0.85, -0.22, 0.22);
    const adjusted = Math.abs(curveness) < 0.018 ? (curveness < 0 ? -0.018 : 0.018) : curveness;
    curvenessByLink.set(key, adjusted);
  });
  return curvenessByLink;
}

// ---------------------------------------------------------------------------
// Japan guide graphics
// ---------------------------------------------------------------------------

export function buildJapanGuideGraphics(): Array<Record<string, unknown>> {
  return JAPAN_ISLAND_COORDS.map((island) => {
    const points = island.coords.map(([lat, lon]) => {
      const pt = geoToCanvas(lat, lon);
      return [pt.x, pt.y] as [number, number];
    });

    return {
      type: "polygon",
      z: -1,
      silent: true,
      shape: {
        points,
      },
      style: {
        fill: "rgba(203,213,225,0.12)",
        stroke: "rgba(148,163,184,0.22)",
        lineWidth: 1,
      },
    };
  });
}

/** Returns SVG path `d` strings for Japan's islands, in canvas coordinates. */
export function buildJapanGuideSvgPaths(): Array<{ name: string; d: string }> {
  return JAPAN_ISLAND_COORDS.map((island) => {
    const d = island.coords
      .map(([lat, lon], i) => {
        const pt = geoToCanvas(lat, lon);
        return `${i === 0 ? "M" : "L"}${pt.x.toFixed(2)},${pt.y.toFixed(2)}`;
      })
      .join(" ") + " Z";
    return { name: island.name, d };
  });
}
