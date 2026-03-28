/**
 * Barrel re-export for geo modules.
 *
 * All geo functionality is split into focused sub-modules:
 *   - geo-coordinates: coordinate conversion, station name normalization, node classification
 *   - geo-area: area layout bounds, anchors, station/plant geo resolution
 *   - geo-svg: SVG path generation, flow color mapping, Japan guide graphics
 *   - geo-viewport: network overlay viewport management, ECharts integration
 */

// geo-coordinates
export type { StationLocationRecord } from "./geo-coordinates";
export {
  geoToCanvas,
  clampPointToMapBounds,
  normalizeStationName,
  isPseudoAreaNodeName,
  isLineLikeNodeName,
  isCompositeFacilityNodeName,
  isVirtualBranchNodeName,
  isConverterStationName,
  isNetworkPowerPlantSource,
  parseDirection,
  buildStationNodeId,
  buildPowerNodeId,
} from "./geo-coordinates";

// geo-area
export {
  resolveStationLocationFromDb,
  resolveStationCanvasOverride,
  resolveGlobalStationGeoBase,
  resolveStationGeoBase,
  resolvePlantGeoBase,
  buildStationLayout,
  buildAreaGeoCanvasExtents,
  buildAreaLayoutBounds,
  buildAreaAnchors,
  buildAreaBridgeEndpoints,
  expandAreaBounds,
  projectPointToAreaEdge,
  getAreaLayoutBounds,
  AREA_GEO_CANVAS_EXTENTS,
  AREA_LAYOUT_BOUNDS,
  AREA_ANCHORS,
} from "./geo-area";

// geo-svg
export {
  flowMagnitudeColor,
  buildCurvedLineCoords,
  buildSvgQuadraticPath,
  buildLinkCurvenessMap,
  buildJapanGuideGraphics,
  buildJapanGuideSvgPaths,
} from "./geo-svg";

// geo-viewport
export type {
  NetworkAnimationPath,
  NetworkOverlayTransformPart,
  NetworkOverlayViewport,
  GraphRoamPayload,
  NetworkFlowChartHostElement,
} from "./geo-viewport";
export {
  DEFAULT_NETWORK_OVERLAY_VIEWPORT,
  attachNetworkFlowChartRoamHook,
  readNetworkOverlayViewport,
  normalizeNetworkOverlayTransformPart,
  areNetworkOverlayViewportsEqual,
  areNetworkOverlayTransformPartsEqual,
  areCloseEnough,
  formatSvgMatrixTransform,
} from "./geo-viewport";

// geo-hints re-exports (preserved for existing consumers)
export type { GeoHint, CanvasOffsetHint, PlantGeoHint } from "./geo-hints";
export {
  STATION_GEO_HINTS_BY_AREA,
  STATION_CANVAS_OFFSETS_BY_AREA,
  PLANT_GEO_HINTS_BY_AREA,
  INTERTIE_STATION_ENDPOINTS,
} from "./geo-hints";
