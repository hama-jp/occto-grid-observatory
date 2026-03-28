"use client";

import { useState } from "react";
import { clamp } from "@/lib/formatters";

const DEFAULT_SNAPSHOT_SLOT_INDEX = 34; // 17:00

export function useTimeSlider(flowSlotLabels: string[]) {
  const maxFlowSlotIndex = Math.max(flowSlotLabels.length - 1, 0);
  const [networkFlowSlotIndex, setNetworkFlowSlotIndex] = useState<number>(
    Math.min(DEFAULT_SNAPSHOT_SLOT_INDEX, maxFlowSlotIndex),
  );

  const clampedNetworkFlowSlotIndex = clamp(Math.round(networkFlowSlotIndex), 0, maxFlowSlotIndex);
  const selectedFlowSlotLabel = flowSlotLabels[clampedNetworkFlowSlotIndex] ?? "-";

  return {
    maxFlowSlotIndex,
    networkFlowSlotIndex: clampedNetworkFlowSlotIndex,
    setNetworkFlowSlotIndex,
    selectedFlowSlotLabel,
  };
}
