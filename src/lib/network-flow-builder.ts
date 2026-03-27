import type { DashboardData } from "@/lib/dashboard-types";
import {
  FLOW_AREA_COLORS,
  MAX_ANIMATED_FLOW_LINES_PER_AREA,
  INTERTIE_RATED_CAPACITY_MW,
} from "@/lib/constants";
import {
  numberFmt,
  decimalFmt,
  formatVoltageKv,
  roundTo,
  clamp,
  compareAreaOrder,
} from "@/lib/formatters";
import {
  type NetworkAnimationPath,
  INTERTIE_STATION_ENDPOINTS,
  AREA_ANCHORS,
  parseDirection,
  buildStationNodeId,
  buildPowerNodeId,
  buildStationLayout,
  resolvePlantGeoBase,
  isPseudoAreaNodeName,
  isLineLikeNodeName,
  isCompositeFacilityNodeName,
  isVirtualBranchNodeName,
  isConverterStationName,
  buildLinkCurvenessMap,
  buildCurvedLineCoords,
  buildSvgQuadraticPath,
  buildAreaBridgeEndpoints,
  clampPointToMapBounds,
} from "@/lib/geo";

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

export type NetworkLink = {
  kind: "intra";
  source: string;
  target: string;
  value: number;
  absAvgMw: number;
  area?: string;
  lineName?: string;
  voltageKv?: string;
  positiveDirection?: string;
  peakAbsMw?: number;
};

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

  const areaScope = new Set<string>();
  lineSeries.forEach((line) => areaScope.add(line.area));
  if (areaScope.size === 0) {
    areaSummaries.forEach((row) => areaScope.add(row.area));
  }

  const networkLines = lineSeries;

  const visibleAreas = new Set<string>();
  const stationsByArea = new Map<string, Set<string>>();
  const nodeDegree = new Map<string, number>();
  const links: NetworkLink[] = [];
  const intertieFacilityMap = new Map<
    string,
    {
      sourceNodeId: string;
      targetNodeId: string;
      sourceArea: string;
      targetArea: string;
      absMw: number;
      peakAbsMw: number;
      intertieNames: Set<string>;
      currentType: "ac" | "dc";
    }
  >();
  const intertieBridgeMap = new Map<
    string,
    {
      sourceArea: string;
      targetArea: string;
      value: number;
      absMw: number;
      peakAbsMw: number;
      intertieNames: Set<string>;
    }
  >();

  networkLines.forEach((line) => {
    const direction = parseDirection(line.positiveDirection);
    if (!direction) {
      return;
    }
    visibleAreas.add(line.area);
    const slotMw = line.values[clampedNetworkFlowSlotIndex] ?? line.avgMw ?? 0;

    const sourceName = slotMw >= 0 ? direction.source : direction.target;
    const targetName = slotMw >= 0 ? direction.target : direction.source;
    if (
      isPseudoAreaNodeName(sourceName) ||
      isPseudoAreaNodeName(targetName) ||
      isLineLikeNodeName(sourceName) ||
      isLineLikeNodeName(targetName) ||
      isVirtualBranchNodeName(sourceName) ||
      isVirtualBranchNodeName(targetName) ||
      isCompositeFacilityNodeName(sourceName) ||
      isCompositeFacilityNodeName(targetName)
    ) {
      return;
    }
    const source = buildStationNodeId(line.area, sourceName);
    const target = buildStationNodeId(line.area, targetName);

    const stationSet = stationsByArea.get(line.area) ?? new Set<string>();
    stationSet.add(sourceName);
    stationSet.add(targetName);
    stationsByArea.set(line.area, stationSet);

    nodeDegree.set(source, (nodeDegree.get(source) ?? 0) + 1);
    nodeDegree.set(target, (nodeDegree.get(target) ?? 0) + 1);

    links.push({
      kind: "intra",
      source,
      target,
      value: slotMw,
      absAvgMw: Math.abs(slotMw),
      area: line.area,
      lineName: line.lineName,
      voltageKv: line.voltageKv,
      positiveDirection: line.positiveDirection,
      peakAbsMw: line.peakAbsMw,
    });
  });

  filteredIntertieSeries.forEach((row) => {
    visibleAreas.add(row.sourceArea);
    visibleAreas.add(row.targetArea);
    const slotMw = row.values[clampedNetworkFlowSlotIndex] ?? row.avgMw ?? 0;
    const explicitEndpoints = INTERTIE_STATION_ENDPOINTS[row.intertieName];
    if (explicitEndpoints) {
      const flowSourceArea = slotMw >= 0 ? explicitEndpoints.sourceArea : explicitEndpoints.targetArea;
      const flowSourceStation = slotMw >= 0 ? explicitEndpoints.sourceStation : explicitEndpoints.targetStation;
      const flowTargetArea = slotMw >= 0 ? explicitEndpoints.targetArea : explicitEndpoints.sourceArea;
      const flowTargetStation = slotMw >= 0 ? explicitEndpoints.targetStation : explicitEndpoints.sourceStation;
      const sourceNodeId = buildStationNodeId(flowSourceArea, flowSourceStation);
      const targetNodeId = buildStationNodeId(flowTargetArea, flowTargetStation);

      const sourceStationSet = stationsByArea.get(flowSourceArea) ?? new Set<string>();
      sourceStationSet.add(flowSourceStation);
      stationsByArea.set(flowSourceArea, sourceStationSet);

      const targetStationSet = stationsByArea.get(flowTargetArea) ?? new Set<string>();
      targetStationSet.add(flowTargetStation);
      stationsByArea.set(flowTargetArea, targetStationSet);

      nodeDegree.set(sourceNodeId, (nodeDegree.get(sourceNodeId) ?? 0) + 1);
      nodeDegree.set(targetNodeId, (nodeDegree.get(targetNodeId) ?? 0) + 1);

      const key = `${sourceNodeId}=>${targetNodeId}`;
      const current = intertieFacilityMap.get(key) ?? {
        sourceNodeId,
        targetNodeId,
        sourceArea: flowSourceArea,
        targetArea: flowTargetArea,
        absMw: 0,
        peakAbsMw: 0,
        intertieNames: new Set<string>(),
        currentType: explicitEndpoints.currentType,
      };
      current.absMw += Math.abs(slotMw);
      current.peakAbsMw = Math.max(current.peakAbsMw, row.peakAbsMw ?? 0);
      current.intertieNames.add(row.intertieName);
      intertieFacilityMap.set(key, current);
      return;
    }

    const sourceArea = slotMw >= 0 ? row.sourceArea : row.targetArea;
    const targetArea = slotMw >= 0 ? row.targetArea : row.sourceArea;
    const key = `${sourceArea}=>${targetArea}`;
    const current = intertieBridgeMap.get(key) ?? {
      sourceArea,
      targetArea,
      value: 0,
      absMw: 0,
      peakAbsMw: 0,
      intertieNames: new Set<string>(),
    };
    current.value += Math.abs(slotMw);
    current.absMw += Math.abs(slotMw);
    current.peakAbsMw = Math.max(current.peakAbsMw, row.peakAbsMw ?? 0);
    current.intertieNames.add(row.intertieName);
    intertieBridgeMap.set(key, current);
  });

  const stationPositions = buildStationLayout(stationsByArea);

  if (visibleAreas.size === 0) {
    areaSummaries.forEach((row) => visibleAreas.add(row.area));
  }

  const areaCategories = Array.from(visibleAreas).sort(compareAreaOrder);
  const categoryIndex = new Map(areaCategories.map((area, index) => [area, index]));
  const stationLabelIds = new Set(
    Array.from(nodeDegree.entries())
      .filter(([nodeId, degree]) => nodeId.startsWith("station::") && degree >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 70)
      .map(([nodeId]) => nodeId),
  );

  const nodes: Array<Record<string, unknown>> = [];
  const stationNodeIdsByArea = new Map<string, string[]>();
  stationsByArea.forEach((stationSet, area) => {
    Array.from(stationSet)
      .sort((a, b) => a.localeCompare(b, "ja-JP"))
      .forEach((station) => {
        const stationNodeId = buildStationNodeId(area, station);
        const degree = nodeDegree.get(stationNodeId) ?? 0;
        const anchor = AREA_ANCHORS[area] ?? AREA_ANCHORS.default;
        const position = stationPositions.get(stationNodeId) ?? anchor;
        nodes.push({
          id: stationNodeId,
          name: station,
          area,
          category: categoryIndex.get(area) ?? 0,
          value: degree,
          nodeType: isConverterStationName(station) ? "converter" : "ss",
          shouldLabel: stationLabelIds.has(stationNodeId),
          x: position.x,
          y: position.y,
          symbolSize: isConverterStationName(station) ? 8 : 6,
          symbol: isConverterStationName(station) ? "diamond" : "circle",
          itemStyle: {
            color: isConverterStationName(station)
              ? "#0f766e"
              : (FLOW_AREA_COLORS[area] ?? FLOW_AREA_COLORS.default),
            borderColor: "#ffffff",
            borderWidth: 1,
          },
        });
        const ids = stationNodeIdsByArea.get(area) ?? [];
        ids.push(stationNodeId);
        stationNodeIdsByArea.set(area, ids);
      });
  });

  const scopedPowerPlants = networkPowerPlants
    .filter((plant) => areaScope.has(plant.area))
    .sort((a, b) => b.dailyKwh - a.dailyKwh);
  const maxPlantDaily = Math.max(...scopedPowerPlants.map((item) => item.dailyKwh), 1);

  scopedPowerPlants.forEach((plant) => {
    const base =
      resolvePlantGeoBase(plant.area, plant.plantName) ?? clampPointToMapBounds(AREA_ANCHORS[plant.area] ?? AREA_ANCHORS.default);
    const ratio = plant.dailyKwh / maxPlantDaily;
    const powerNodeId = buildPowerNodeId(plant.area, plant.plantName);
    nodes.push({
      id: powerNodeId,
      name: plant.plantName,
      area: plant.area,
      category: categoryIndex.get(plant.area) ?? 0,
      value: roundTo(plant.avgOutputMw, 1),
      nodeType: "power",
      sourceType: plant.sourceType,
      dailyKwh: plant.dailyKwh,
      maxOutputManKw: roundTo(plant.maxOutputManKw, 2),
      shouldLabel: ratio >= 0.5,
      x: base.x,
      y: base.y,
      symbol: "rect",
      symbolSize: 4.2 + ratio * 7.4,
      itemStyle: {
        color: FLOW_AREA_COLORS[plant.area] ?? FLOW_AREA_COLORS.default,
        borderColor: "#ffffff",
        borderWidth: 1,
        shadowBlur: 4,
        shadowColor: "rgba(15,23,42,0.16)",
      },
    });
  });

  const maxAbsIntra = Math.max(
    ...links.filter((line) => line.kind === "intra").map((line) => line.absAvgMw),
    1,
  );

  const linkCurveness = buildLinkCurvenessMap(links, stationPositions);

  const renderedLinks = links.map((line) => {
    const ratio = line.absAvgMw / maxAbsIntra;
    const curveness = linkCurveness.get(`${line.source}=>${line.target}`) ?? 0.04;
    return {
      ...line,
      lineStyle: {
        width: 0.7 + ratio * 2.8,
        opacity: 0.58,
        curveness,
        color: line.value >= 0 ? "rgba(249,115,22,0.9)" : "rgba(30,64,175,0.9)",
      },
      z: 2,
    };
  });

  const maxAbsIntertie = Math.max(...Array.from(intertieBridgeMap.values()).map((item) => item.absMw), 1);
  const intertieBridgeLines = Array.from(intertieBridgeMap.values())
    .map((bridge) => {
      const endpoints = buildAreaBridgeEndpoints(bridge.sourceArea, bridge.targetArea);
      if (!endpoints) {
        return null;
      }
      const ratio = bridge.absMw / maxAbsIntertie;
      const bridgeLabelText = `${Array.from(bridge.intertieNames).join("/")} ${decimalFmt.format(bridge.absMw)} MW`;
      return {
        ...bridge,
        name: bridgeLabelText,
        coords: buildCurvedLineCoords(endpoints.from, endpoints.to, endpoints.curveness),
        lineStyle: {
          width: 1.2 + ratio * 3.2,
          opacity: 0.46,
          color: bridge.value >= 0 ? "rgba(234,88,12,0.55)" : "rgba(37,99,235,0.55)",
          type: "solid",
        },
        label: {
          show: true,
          formatter: bridgeLabelText,
          position: "middle" as const,
          fontSize: 9,
          color: "#334155",
          backgroundColor: "rgba(255,255,255,0.82)",
          borderRadius: 3,
          padding: [1, 4] as [number, number],
        },
      };
    })
    .filter((item) => item !== null);

  const nodePointById = new Map<string, { x: number; y: number }>();
  nodes.forEach((node) => {
    const id = String(node.id ?? "");
    const x = Number(node.x);
    const y = Number(node.y);
    if (id && Number.isFinite(x) && Number.isFinite(y)) {
      nodePointById.set(id, { x, y });
    }
  });
  const animatedFlowLines = Array.from(
    renderedLinks.reduce((lineGroups, line) => {
      const area = line.area ?? "不明";
      const group = lineGroups.get(area) ?? [];
      group.push(line);
      lineGroups.set(area, group);
      return lineGroups;
    }, new Map<string, typeof renderedLinks>()),
  )
    .sort(([leftArea], [rightArea]) => compareAreaOrder(leftArea, rightArea))
    .flatMap(([, linesByArea]) =>
      linesByArea
        .sort((a, b) => b.absAvgMw - a.absAvgMw)
        .slice(0, maxAnimatedFlowLinesPerArea),
    )
    .map((line) => {
      const from = nodePointById.get(String(line.source));
      const to = nodePointById.get(String(line.target));
      if (!from || !to) {
        return null;
      }
      return {
        coords: buildCurvedLineCoords(from, to, line.lineStyle.curveness),
        absAvgMw: line.absAvgMw,
        lineStyle: {
          color: "rgba(125,211,252,0.42)",
          width: Math.max(0.9, line.lineStyle.width * 0.45),
          opacity: 0.34,
        },
      };
    })
    .filter((item) => item !== null);
  const maxAnimatedFlowMw = Math.max(...animatedFlowLines.map((line) => line.absAvgMw), 1);
  const majorFlowAnimationPaths: NetworkAnimationPath[] = animatedFlowLines.map((line, index) => ({
    id: `major-flow-${index}`,
    d: buildSvgQuadraticPath(line.coords),
    strokeWidth: Math.max(1.3, line.lineStyle.width + 0.2),
    durationSeconds: roundTo(1.7 + (index % 4) * 0.18, 2),
    delaySeconds: roundTo((index % 5) * 0.12, 2),
    magnitude: clamp(line.absAvgMw / maxAnimatedFlowMw, 0, 1),
  }));
  const maxAbsIntertieFacility = Math.max(...Array.from(intertieFacilityMap.values()).map((item) => item.absMw), 1);
  const intertieFacilityLines = Array.from(intertieFacilityMap.values())
    .map((line) => {
      const from = nodePointById.get(line.sourceNodeId);
      const to = nodePointById.get(line.targetNodeId);
      if (!from || !to) {
        return null;
      }
      const ratio = line.absMw / maxAbsIntertieFacility;
      const strokeColor =
        line.currentType === "dc" ? "rgba(192,38,211,0.82)" : "rgba(234,88,12,0.74)";
      const labelText = `${Array.from(line.intertieNames).join("/")} ${decimalFmt.format(line.absMw)} MW`;
      return {
        ...line,
        name: labelText,
        coords: buildCurvedLineCoords(from, to, line.currentType === "dc" ? 0.08 : 0.05),
        lineStyle: {
          width: 1.5 + ratio * 3.2,
          opacity: 0.72,
          color: strokeColor,
          type: line.currentType === "dc" ? "dashed" : "solid",
        },
        label: {
          show: true,
          formatter: labelText,
          position: "middle" as const,
          fontSize: 9,
          color: "#334155",
          backgroundColor: "rgba(255,255,255,0.82)",
          borderRadius: 3,
          padding: [1, 4] as [number, number],
        },
      };
    })
    .filter((item) => item !== null);

  // Build inter-area animation paths for SVG overlay
  const maxAbsIntertieForAnim = Math.max(
    ...intertieFacilityLines.map((line) => line.absMw),
    ...intertieBridgeLines.map((line) => line.absMw),
    1,
  );
  // Compute congestion percentage for a set of intertie names
  const computeIntertieCongestionPct = (names: Set<string>, absMw: number): number | undefined => {
    let totalCapacity = 0;
    let matched = false;
    for (const name of names) {
      const cap = INTERTIE_RATED_CAPACITY_MW[name];
      if (cap) {
        totalCapacity += cap.capacityMw;
        matched = true;
      }
    }
    return matched && totalCapacity > 0 ? roundTo((absMw / totalCapacity) * 100, 1) : undefined;
  };

  const intertieAnimationPaths: NetworkAnimationPath[] = [
    ...intertieFacilityLines.map((line, index) => ({
      id: `intertie-facility-${index}`,
      d: buildSvgQuadraticPath(line.coords),
      strokeWidth: Math.max(2.6, line.lineStyle.width + 0.5),
      durationSeconds: roundTo(2.2 + (index % 3) * 0.22, 2),
      delaySeconds: roundTo((index % 4) * 0.15, 2),
      magnitude: clamp(line.absMw / maxAbsIntertieForAnim, 0, 1),
      kind: "intertie" as const,
      currentType: line.currentType,
      label: `${Array.from(line.intertieNames).join("/")} ${decimalFmt.format(line.absMw)}MW`,
      congestionPct: computeIntertieCongestionPct(line.intertieNames, line.absMw),
    })),
    ...intertieBridgeLines.map((line, index) => ({
      id: `intertie-bridge-${index}`,
      d: buildSvgQuadraticPath(line.coords),
      strokeWidth: Math.max(2.4, (line.lineStyle?.width ?? 2) + 0.4),
      durationSeconds: roundTo(2.4 + (index % 3) * 0.2, 2),
      delaySeconds: roundTo((index % 4) * 0.18, 2),
      magnitude: clamp(line.absMw / maxAbsIntertieForAnim, 0, 1),
      kind: "intertie" as const,
      currentType: undefined,
      label: `${Array.from(line.intertieNames).join("/")} ${decimalFmt.format(line.absMw)}MW`,
      congestionPct: computeIntertieCongestionPct(line.intertieNames, line.absMw),
    })),
  ];

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
        data: intertieFacilityLines,
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
        data: intertieBridgeLines,
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
