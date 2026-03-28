"use client";

import { useEffect, useState } from "react";

export function useViewport() {
  const [viewportWidth, setViewportWidth] = useState<number>(1280);

  useEffect(() => {
    const updateViewportWidth = (): void => {
      setViewportWidth(window.innerWidth);
    };

    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => {
      window.removeEventListener("resize", updateViewportWidth);
    };
  }, []);

  const isMobileViewport = viewportWidth < 768;
  const isWideViewport = viewportWidth >= 1536;
  const useInlineDonutLegend = viewportWidth >= 1024;

  return { viewportWidth, isMobileViewport, isWideViewport, useInlineDonutLegend };
}
