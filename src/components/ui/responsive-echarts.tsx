"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef } from "react";
import type { EChartsType } from "echarts";
import type { EChartsReactProps } from "echarts-for-react/lib/types";

const ECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

/**
 * Keeps an ECharts instance in sync with its actual layout container.
 *
 * echarts-for-react listens for window resize events, but dashboard grids can
 * finish reflowing after that event. Observing the container itself avoids a
 * stale canvas/SVG width (and the resulting chart overflow).
 */
export function ResponsiveECharts({
  style,
  onChartReady,
  ...props
}: EChartsReactProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const frameRef = useRef<number | null>(null);

  const resizeChart = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const host = hostRef.current;
      if (host && host.clientWidth > 0 && host.clientHeight > 0) {
        chartRef.current?.resize({
          width: host.clientWidth,
          height: host.clientHeight,
        });
      }
    });
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const observer = new ResizeObserver(resizeChart);
    observer.observe(host);
    return () => {
      observer.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [resizeChart]);

  const handleChartReady = useCallback(
    (chart: EChartsType) => {
      chartRef.current = chart;
      resizeChart();
      onChartReady?.(chart);
    },
    [onChartReady, resizeChart],
  );

  return (
    <div ref={hostRef} style={{ ...style, minWidth: 0 }}>
      <ECharts
        {...props}
        autoResize={false}
        onChartReady={handleChartReady}
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
