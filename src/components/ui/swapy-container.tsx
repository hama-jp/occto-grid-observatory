"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { createSwapy, type Swapy } from "swapy";
import type { DashboardBlockId } from "@/lib/constants";

type SwapyContainerProps = {
  blockOrder: DashboardBlockId[];
  onReorder: (newOrder: DashboardBlockId[]) => void;
  enabled: boolean;
  children: (blockId: DashboardBlockId) => ReactNode;
};

export function SwapyContainer({
  blockOrder,
  onReorder,
  enabled,
  children,
}: SwapyContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const swapyRef = useRef<Swapy | null>(null);
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

  useEffect(() => {
    if (!containerRef.current) return;

    const swapy = createSwapy(containerRef.current, {
      manualSwap: true,
      animation: "dynamic",
      dragAxis: "y",
      dragOnHold: true,
    });
    swapyRef.current = swapy;

    swapy.onSwapEnd((event) => {
      if (!event.hasChanged) return;
      const newOrder = event.slotItemMap.asArray.map(
        (entry) => entry.item as DashboardBlockId,
      );
      onReorderRef.current(newOrder);
    });

    swapy.enable(enabled);

    return () => {
      swapy.destroy();
      swapyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally re-create only on mount
  }, []);

  useEffect(() => {
    swapyRef.current?.enable(enabled);
  }, [enabled]);

  // Notify swapy when blockOrder changes (e.g. after React re-renders)
  useEffect(() => {
    swapyRef.current?.update();
  }, [blockOrder]);

  return (
    <div ref={containerRef} data-swapy-container="">
      {blockOrder.map((blockId) => (
        <div key={blockId} data-swapy-slot={blockId}>
          <div data-swapy-item={blockId}>
            {enabled ? (
              <div
                data-swapy-handle=""
                className="mb-1 flex cursor-grab items-center gap-1.5 rounded-xl bg-teal-50/80 px-3 py-1.5 text-xs font-medium text-teal-600 active:cursor-grabbing dark:bg-teal-950/50 dark:text-teal-400"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-4 w-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zm0 5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
                    clipRule="evenodd"
                  />
                </svg>
                ドラッグで並べ替え
              </div>
            ) : null}
            {children(blockId)}
          </div>
        </div>
      ))}
    </div>
  );
}
