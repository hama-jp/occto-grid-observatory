"use client";

import { useMemo, useState } from "react";
import { DASHBOARD_SECTION_OPTIONS, type DashboardSectionId } from "@/lib/constants";

export function useSectionVisibility() {
  const [visibleSectionIds, setVisibleSectionIds] = useState<DashboardSectionId[]>(
    DASHBOARD_SECTION_OPTIONS.map((item) => item.id),
  );

  const visibleSectionSet = useMemo(() => new Set<DashboardSectionId>(visibleSectionIds), [visibleSectionIds]);

  const showGenerationTrend = visibleSectionSet.has("generation");
  const showSourceComposition = visibleSectionSet.has("composition");

  return {
    visibleSectionIds,
    setVisibleSectionIds,
    visibleSectionSet,
    showGenerationTrend,
    showSourceComposition,
  };
}
