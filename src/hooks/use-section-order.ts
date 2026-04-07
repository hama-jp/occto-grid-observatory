"use client";

import { useCallback, useSyncExternalStore, useState } from "react";
import {
  ZONE_A_BLOCKS,
  ZONE_B_BLOCKS,
  type DashboardBlockId,
} from "@/lib/constants";

const STORAGE_KEY = "occto-section-order";

const DEFAULT_ZONE_A_ORDER: DashboardBlockId[] = ZONE_A_BLOCKS.map((b) => b.blockId);
const DEFAULT_ZONE_B_ORDER: DashboardBlockId[] = ZONE_B_BLOCKS.map((b) => b.blockId);

type SectionOrderState = {
  zoneA: DashboardBlockId[];
  zoneB: DashboardBlockId[];
};

const DEFAULT_STATE: SectionOrderState = {
  zoneA: DEFAULT_ZONE_A_ORDER,
  zoneB: DEFAULT_ZONE_B_ORDER,
};

// ── Tiny external store for section order ──
// Keeps state in a module-level variable and syncs to localStorage.

let currentState: SectionOrderState = DEFAULT_STATE;
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SectionOrderState {
  return currentState;
}

function getServerSnapshot(): SectionOrderState {
  return DEFAULT_STATE;
}

function loadFromStorage(): SectionOrderState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SectionOrderState;
    if (!Array.isArray(parsed.zoneA) || !Array.isArray(parsed.zoneB)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveToStorage(state: SectionOrderState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage quota exceeded or unavailable — silently ignore
  }
}

// Hydrate from localStorage on first client-side module load
if (typeof window !== "undefined") {
  const saved = loadFromStorage();
  if (saved) {
    currentState = saved;
  }
}

function setOrder(next: Partial<SectionOrderState>): void {
  currentState = { ...currentState, ...next };
  saveToStorage(currentState);
  emitChange();
}

export function useSectionOrder() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [isReorderMode, setIsReorderMode] = useState(false);

  const setZoneAOrder = useCallback(
    (order: DashboardBlockId[]) => setOrder({ zoneA: order }),
    [],
  );

  const setZoneBOrder = useCallback(
    (order: DashboardBlockId[]) => setOrder({ zoneB: order }),
    [],
  );

  const resetOrder = useCallback(() => {
    setOrder({ zoneA: DEFAULT_ZONE_A_ORDER, zoneB: DEFAULT_ZONE_B_ORDER });
  }, []);

  return {
    zoneAOrder: state.zoneA,
    zoneBOrder: state.zoneB,
    setZoneAOrder,
    setZoneBOrder,
    resetOrder,
    isReorderMode,
    setIsReorderMode,
  };
}
