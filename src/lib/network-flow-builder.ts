/**
 * Builds the ECharts graph option for the network flow visualization.
 *
 * Data extraction logic is in network-flow-data.ts; this module focuses on
 * assembling the final chart configuration.
 */

import type { DashboardData } from "@/lib/dashboard-types";
import { FLOW_AREA_COLORS, MAX_ANIMATED_FLOW_LINES_PER_AREA } from "@/lib/constants";
import { numberFmt, decimalFmt, formatVoltageKv } from "@/lib/formatters";
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

export type NetworkFlowBuilderParams = {
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
  clampedNetworkFlowSlotIndex: number;
  networkPowerPlants: Array<{
    area: string;
    plantName: string;
    sourceType: string;
    dailyKwh: number;
    avgOutputMw: number;
    maxOutputManKw: number;
  }>;
  selectedFlowDateTimeLabel: string;
  maxAnimatedFlowLinesPerArea?: number;
};

export type { NetworkLink } from "@/lib/network-flow-data";

export function buildFlowNetworkOption(params: NetworkFlowBuilderParams) {
  const {
    areaSummaries,
    filteredIntertieSeries,
    lineSeries,
    clampedNetworkFlowSlotIndex,
    networkPowerPlants,
    selectedFlowDateTimeLabel,
    maxAnimatedFlowLinesPerArea = MAX_ANIMATED_FLOW_LINES_PER_AREA,
  } = params;

  // 1. Extract intra-area links
  const { links, visibleAreas, stationsByArea, nodeDegree } = extractIntraAreaLinks(
    lineSeries,
    clampedNetworkFlowSlotIndex,
  );

  // 2. Extract intertie data
  const areaScope = new Set<string>();
  lineSeries.forEach((line) => areaScope.add(line.area));
  if (areaScope.size === 0) {
    areaSummaries.forEach((row) => areaScope.add(row.area));
  }

  const { intertieFacilityMap, intertieBridgeMap } = extractIntertieData(
    filteredIntertieSeries,
    clampedNetworkFlowSlotIndex,
    visibleAreas,
    stationsByArea,
    nodeDegree,
  );

  // 3. Build station positions and nodes
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

  // 4. Build rendered links
  const renderedLinks = buildRenderedLinks(links, stationPositions);

  // 5. Build intertie lines
  const nodePointById = new Map<string, { x: number; y: number }>();
  nodes.forEach((node) => {
    const id = String(node.id ?? "");
    const x = Number(node.x);
    const y = Number(node.y);
    if (id && Number.isFinite(x) && Number.isFinite(y)) {
      nodePointById.set(id, { x, y });
    }
  });

  const intertieBridgeLineData = buildIntertieBridgeLines(intertieBridgeMap);
  const intertieFacilityLineData = buildIntertieFacilityLines(intertieFacilityMap, nodePointById);

  // 6. Build animation paths
  const majorFlowAnimationPaths = buildFlowAnimationPaths(renderedLinks, nodePointById, maxAnimatedFlowLinesPerArea);
  const intertieAnimationPaths = buildIntertieAnimationPaths(intertieFacilityLineData, intertieBridgeLineData);

  // 7. Assemble chart option
  return {
    animationDurationUpdate: 360,
    __majorFlowAnimationPaths: majorFlowAnimationPaths,
    __intertieAnimationPaths: intertieAnimationPaths,
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
}
