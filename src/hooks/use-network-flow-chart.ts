"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_ANIMATED_FLOW_LINES_PER_AREA } from "@/lib/constants";
import {
  type NetworkFlowChartHostElement,
  type NetworkOverlayViewport,
  DEFAULT_NETWORK_OVERLAY_VIEWPORT,
  attachNetworkFlowChartRoamHook,
  readNetworkOverlayViewport,
  areNetworkOverlayViewportsEqual,
} from "@/lib/geo";

/**
 * Encapsulates the roam-sync state for the network flow ECharts graph.
 *
 * Previously this logic lived inline in DashboardApp, coupling viewport
 * tracking with the main component.  Extracting it here makes DashboardApp
 * leaner and makes the roam-sync lifecycle independently testable.
 */
export function useNetworkFlowChart() {
  const networkFlowChartHostRef = useRef<NetworkFlowChartHostElement | null>(null);
  const [maxAnimatedFlowLinesPerArea, setMaxAnimatedFlowLinesPerArea] =
    useState<number>(MAX_ANIMATED_FLOW_LINES_PER_AREA);
  const [networkOverlayViewport, setNetworkOverlayViewport] =
    useState<NetworkOverlayViewport>(DEFAULT_NETWORK_OVERLAY_VIEWPORT);

  const syncNetworkOverlayViewport = (chart: unknown): void => {
    const nextViewport = readNetworkOverlayViewport(chart);
    if (!nextViewport) return;
    setNetworkOverlayViewport((current) =>
      areNetworkOverlayViewportsEqual(current, nextViewport) ? current : nextViewport,
    );
  };

  const registerNetworkFlowChart = (chart: unknown): void => {
    attachNetworkFlowChartRoamHook(chart, networkFlowChartHostRef.current);
    syncNetworkOverlayViewport(chart);
  };

  useEffect(() => {
    const chartHost = networkFlowChartHostRef.current;
    return () => {
      if (chartHost) {
        delete chartHost.__occtoDispatchGraphRoam;
      }
    };
  }, []);

  return {
    networkFlowChartHostRef,
    maxAnimatedFlowLinesPerArea,
    setMaxAnimatedFlowLinesPerArea,
    networkOverlayViewport,
    registerNetworkFlowChart,
  };
}
