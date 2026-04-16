/**
 * Builds the ECharts graph option for the network flow visualization.
 *
 * Data extraction logic is in network-flow-data.ts; this module focuses on
 * assembling the final chart configuration.
 *
 * Topology (slot-independent node layout, degrees, station positions) is
 * computed once per dataset via `buildFlowNetworkTopology` and reused across
 * time-slider slot changes. Per-slot work (link values, intertie aggregates,
 * animation paths) is done in `buildFlowNetworkOption`.
 */

import type { DashboardData } from "@/lib/dashboard-types";
import { FLOW_AREA_COLORS, MAX_ANIMATED_FLOW_LINES_PER_AREA, MAP_VIEWBOX } from "@/lib/constants";
import { numberFmt, decimalFmt, formatVoltageKv } from "@/lib/formatters";
import type { NetworkAnimationPath } from "@/lib/geo-viewport";
import {
  extractIntraAreaLinks,
  extractIntertieData,
  buildNetworkNodes,
  buildRenderedLinks,
  buildIntertieBridgeLines,
  buildIntertieFacilityLines,
  buildFlowAnimationPaths,
  buildIntertieAnimationPaths,
  buildStationLayout,
  compareAreaOrder,
} from "@/lib/network-flow-data";
// Japan guide graphics are now rendered via SVG overlay in the component

export type NetworkFlowTopologyParams = {
  areaSummaries: DashboardData["flows"]["areaSummaries"];
  filteredIntertieSeries: Array<{
    intertieName: string;
    sourceArea: string;
    targetArea: string;
    avgMw: number;
    peakAbsMw: number;
    values: number[];
  }>;
  lineSeries: DashboardData["flows"]["lineSeries"];
  networkPowerPlants: Array<{
    area: string;
    plantName: string;
    sourceType: string;
    dailyKwh: number;
    avgOutputMw: number;
    maxOutputManKw: number;
  }>;
};

export type NetworkFlowSlotParams = {
  lineSeries: DashboardData["flows"]["lineSeries"];
  filteredIntertieSeries: NetworkFlowTopologyParams["filteredIntertieSeries"];
  clampedNetworkFlowSlotIndex: number;
  selectedFlowDateTimeLabel: string;
  maxAnimatedFlowLinesPerArea?: number;
};

export type NetworkFlowBuilderParams = NetworkFlowTopologyParams & NetworkFlowSlotParams;

export type FlowNetworkTopology = {
  nodes: Array<Record<string, unknown>>;
  nodePointById: Map<string, { x: number; y: number }>;
  areaCategories: string[];
  categoryIndex: Map<string, number>;
  stationPositions: Map<string, { x: number; y: number }>;
  areaScope: Set<string>;
};

export type FlowNetworkResult = {
  option: Record<string, unknown>;
  majorFlowAnimationPaths: NetworkAnimationPath[];
  intertieAnimationPaths: NetworkAnimationPath[];
};

export type { NetworkLink } from "@/lib/network-flow-data";

/**
 * Build the slot-independent topology (node layout, positions, categories).
 * Memoize this by dataset inputs — recomputing is expensive and unnecessary
 * when only the time-slider slot index changes.
 */
export function buildFlowNetworkTopology(params: NetworkFlowTopologyParams): FlowNetworkTopology {
  const { areaSummaries, filteredIntertieSeries, lineSeries, networkPowerPlants } = params;

  // Run extract functions with slot 0 to populate stationsByArea / nodeDegree /
  // visibleAreas. These outputs are direction-agnostic (both endpoints are
  // always added regardless of flow sign), so they are slot-independent.
  const { visibleAreas, stationsByArea, nodeDegree } = extractIntraAreaLinks(lineSeries, 0);

  const areaScope = new Set<string>();
  lineSeries.forEach((line) => areaScope.add(line.area));
  if (areaScope.size === 0) {
    areaSummaries.forEach((row) => areaScope.add(row.area));
  }

  extractIntertieData(
    filteredIntertieSeries,
    0,
    visibleAreas,
    stationsByArea,
    nodeDegree,
  );

  const stationPositions = buildStationLayout(stationsByArea);

  if (visibleAreas.size === 0) {
    areaSummaries.forEach((row) => visibleAreas.add(row.area));
  }

  const areaCategories = Array.from(visibleAreas).sort(compareAreaOrder);
  const categoryIndex = new Map(areaCategories.map((area, index) => [area, index]));

  const nodes = buildNetworkNodes(
    stationsByArea,
    nodeDegree,
    stationPositions,
    categoryIndex,
    networkPowerPlants,
    areaScope,
  );

  // Invisible anchor nodes at MAP_VIEWBOX corners pin the coordinate range so
  // ECharts auto-ranging keeps the SVG overlay aligned.
  nodes.push(
    {
      id: "__anchor_topLeft",
      name: "",
      x: 0,
      y: 0,
      symbolSize: 0,
      itemStyle: { opacity: 0 },
      label: { show: false },
      emphasis: { disabled: true },
      silent: true,
    },
    {
      id: "__anchor_bottomRight",
      name: "",
      x: MAP_VIEWBOX.width,
      y: MAP_VIEWBOX.height,
      symbolSize: 0,
      itemStyle: { opacity: 0 },
      label: { show: false },
      emphasis: { disabled: true },
      silent: true,
    },
  );

  const nodePointById = new Map<string, { x: number; y: number }>();
  nodes.forEach((node) => {
    const id = String(node.id ?? "");
    const x = Number(node.x);
    const y = Number(node.y);
    if (id && Number.isFinite(x) && Number.isFinite(y)) {
      nodePointById.set(id, { x, y });
    }
  });

  return {
    nodes,
    nodePointById,
    areaCategories,
    categoryIndex,
    stationPositions,
    areaScope,
  };
}

/**
 * Build the per-slot chart option and animation paths from a prebuilt topology.
 * Cheap enough to recompute on every time-slider change.
 */
export function buildFlowNetworkOption(
  topology: FlowNetworkTopology,
  params: NetworkFlowSlotParams,
): FlowNetworkResult {
  const {
    lineSeries,
    filteredIntertieSeries,
    clampedNetworkFlowSlotIndex,
    selectedFlowDateTimeLabel,
    maxAnimatedFlowLinesPerArea = MAX_ANIMATED_FLOW_LINES_PER_AREA,
  } = params;
  const { nodes, nodePointById, areaCategories, stationPositions } = topology;

  // 1. Per-slot link values (reuses parsed directions but re-evaluates slot values)
  const { links } = extractIntraAreaLinks(lineSeries, clampedNetworkFlowSlotIndex);

  // 2. Per-slot intertie aggregation. We pass fresh Maps/Sets here — the
  // topology's station/degree maps are already finalized and must not be mutated.
  const { intertieFacilityMap, intertieBridgeMap } = extractIntertieData(
    filteredIntertieSeries,
    clampedNetworkFlowSlotIndex,
    new Set<string>(),
    new Map<string, Set<string>>(),
    new Map<string, number>(),
  );

  // 3. Build rendered links and intertie line data for this slot
  const renderedLinks = buildRenderedLinks(links, stationPositions);
  const intertieBridgeLineData = buildIntertieBridgeLines(intertieBridgeMap);
  const intertieFacilityLineData = buildIntertieFacilityLines(intertieFacilityMap, nodePointById);

  // 4. Build animation paths
  const majorFlowAnimationPaths = buildFlowAnimationPaths(renderedLinks, nodePointById, maxAnimatedFlowLinesPerArea);
  const intertieAnimationPaths = buildIntertieAnimationPaths(intertieFacilityLineData, intertieBridgeLineData);

  // 5. Assemble chart option
  const option = {
    animationDurationUpdate: 360,
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: (params: {
        dataType: "node" | "edge";
        name: string;
        data: {
          kind?: "intra";
          value: number;
          area?: string;
          lineName?: string;
          voltageKv?: string;
          positiveDirection?: string;
          peakAbsMw?: number;
          nodeType?: "ss" | "power" | "converter";
          sourceType?: string;
          dailyKwh?: number;
          maxOutputManKw?: number;
        };
      }) => {
        if (params.dataType === "edge") {
          const voltageText = formatVoltageKv(params.data.voltageKv);
          return `${params.data.area} | ${params.data.lineName}<br/>区分: 地域内送電線<br/>定義方向: ${
            params.data.positiveDirection
          }<br/>表示時刻: ${selectedFlowDateTimeLabel}<br/>潮流: ${decimalFmt.format(params.data.value)} MW<br/>最大|潮流|: ${numberFmt.format(
            params.data.peakAbsMw ?? 0,
          )} MW${voltageText ? `<br/>電圧: ${voltageText}` : ""}`;
        }
        if (params.data.nodeType === "power") {
          return `${params.data.area} | ${params.name}<br/>区分: 電源<br/>平均出力: ${decimalFmt.format(
            params.data.value,
          )} MW<br/>方式: ${params.data.sourceType ?? "不明"}<br/>最大出力: ${decimalFmt.format(
            params.data.maxOutputManKw ?? 0,
          )} 万kW<br/>日量: ${numberFmt.format(
            Math.round(params.data.dailyKwh ?? 0),
          )} kWh`;
        }
        if (params.data.nodeType === "converter") {
          return `${params.data.area} | ${params.name}<br/>区分: 変換所<br/>接続本数: ${numberFmt.format(
            params.data.value,
          )} 本`;
        }
        return `${params.data.area ?? "不明"} | ${params.name}<br/>接続本数: ${numberFmt.format(
          params.data.value,
        )} 本`;
      },
    },
    legend: [
      {
        type: "scroll",
        top: 10,
        data: areaCategories,
        textStyle: { color: "#334155" },
      },
    ],
    series: [
      {
        type: "lines",
        coordinateSystem: "none",
        polyline: true,
        silent: false,
        z: 3,
        data: intertieFacilityLineData,
        tooltip: {
          formatter: (params: {
            data: {
              sourceArea: string;
              targetArea: string;
              absMw: number;
              peakAbsMw: number;
              intertieNames: Set<string>;
              currentType: "ac" | "dc";
            };
          }) =>
            `${params.data.sourceArea} → ${params.data.targetArea}<br/>区分: ${
              params.data.currentType === "dc" ? "直流連係線" : "連係線"
            }<br/>表示時刻: ${selectedFlowDateTimeLabel}<br/>潮流: ${decimalFmt.format(
              params.data.absMw,
            )} MW<br/>最大|潮流|: ${numberFmt.format(params.data.peakAbsMw)} MW<br/>連係線: ${Array.from(
              params.data.intertieNames,
            ).join(" / ")}`,
        },
        lineStyle: {
          opacity: 0.7,
        },
      },
      {
        type: "lines",
        coordinateSystem: "none",
        polyline: true,
        silent: false,
        z: 1,
        data: intertieBridgeLineData,
        tooltip: {
          formatter: (params: {
            data: {
              sourceArea: string;
              targetArea: string;
              absMw: number;
              peakAbsMw: number;
              intertieNames: Set<string>;
            };
          }) =>
            `${params.data.sourceArea} → ${params.data.targetArea}<br/>区分: 連係線（エリア橋）<br/>表示時刻: ${selectedFlowDateTimeLabel}<br/>潮流: ${decimalFmt.format(
              params.data.absMw,
            )} MW<br/>最大|潮流|: ${numberFmt.format(params.data.peakAbsMw)} MW<br/>連係線: ${Array.from(
              params.data.intertieNames,
            ).join(" / ")}`,
        },
        lineStyle: {
          opacity: 0.42,
        },
      },
      {
        type: "graph",
        layout: "none",
        roam: true,
        draggable: false,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        data: nodes,
        links: renderedLinks,
        categories: areaCategories.map((name) => ({
          name,
          itemStyle: { color: FLOW_AREA_COLORS[name] ?? FLOW_AREA_COLORS.default },
        })),
        lineStyle: {
          opacity: 0.72,
        },
        label: {
          show: true,
          formatter: (params: {
            data: { nodeType?: "ss" | "power" | "converter"; shouldLabel?: boolean; value?: number };
            name: string;
          }) => {
            if (params.data.shouldLabel) {
              return params.name;
            }
            return "";
          },
          position: "right",
          color: "#1f2937",
          fontSize: 10,
          backgroundColor: "rgba(255,255,255,0.72)",
          borderRadius: 4,
          padding: [1, 3],
        },
        labelLayout: {
          hideOverlap: true,
        },
        emphasis: {
          focus: "adjacency",
          label: {
            show: true,
          },
          lineStyle: {
            opacity: 0.95,
          },
        },
      },
    ],
  };

  return { option, majorFlowAnimationPaths, intertieAnimationPaths };
}

/**
 * Build an expanded modal variant of the flow network option.
 * Keeps roam enabled for pan/zoom in the expanded view, and uses SVG overlay
 * for the Japan guide map and animation paths (handled by the component).
 */
export function buildExpandedFlowNetworkOption(
  baseOption: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...baseOption,
  };
}
