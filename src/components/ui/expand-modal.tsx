"use client";

import { type ReactNode, useCallback, useEffect } from "react";

type ExpandModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional color accent bar at the top of the modal */
  accentColor?: string;
  /** Optional content to render in the header alongside the title */
  headerExtra?: ReactNode;
};

/**
 * Generic full-window expand modal with Escape-to-close, scroll lock,
 * and click-outside-to-close.  Shared by NetworkSection and GeneratorStatusSection.
 */
export function ExpandModal({
  title,
  onClose,
  children,
  accentColor,
  headerExtra,
}: ExpandModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const stopPropagation = useCallback(
    (e: React.MouseEvent) => e.stopPropagation(),
    [],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex h-[95vh] w-[96vw] max-w-[1800px] flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50 shadow-2xl dark:border-slate-700/80 dark:from-slate-900 dark:to-slate-850"
        onClick={stopPropagation}
      >
        {accentColor && (
          <div
            className="h-1.5 shrink-0"
            style={{ background: `linear-gradient(90deg, ${accentColor}, ${accentColor}88)` }}
          />
        )}
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200/60 px-6 py-4 dark:border-slate-700/60">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {title}
            </h2>
            {headerExtra}
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="閉じる"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
          {children}
        </div>
      </div>
    </div>
  );
}

export function ExpandIcon() {
  return (
    <span className="text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2h4v4M6 14H2v-4M14 2L9.5 6.5M2 14l4.5-4.5" />
      </svg>
    </span>
  );
}
