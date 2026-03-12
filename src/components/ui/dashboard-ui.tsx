"use client";

import { type ReactNode } from "react";
import { decimalFmt, formatCompactEnergy, clamp } from "@/lib/formatters";
import type { ShareSegment } from "@/lib/formatters";

export type BarListItem = {
  label: string;
  valueLabel: string;
  percent: number;
  color: string;
  verifiedBy?: string;
  verifiedAt?: string;
  note?: string;
};

export function Panel({
  title,
  className,
  testId,
  children,
}: {
  title: string;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      className={`rounded-3xl border border-white/70 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/90 ${className ?? ""}`}
    >
      <h2 className="mb-2 text-base font-semibold text-slate-800 dark:text-slate-200">{title}</h2>
      {children}
    </section>
  );
}

export function SummaryCard({
  title,
  value,
  detail,
  accentColor,
  children,
}: {
  title: string;
  value: string;
  detail: string;
  accentColor: string;
  children: ReactNode;
}) {
  return (
    <article className="rounded-3xl border border-white/70 bg-white/92 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800/92">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accentColor }} />
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">{title}</p>
          </div>
          <p className="mt-2 text-xl font-semibold leading-tight text-slate-900 dark:text-slate-100">{value}</p>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{detail}</p>
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </article>
  );
}

export function CompactStatCard({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: string;
  detail: string;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/80 ${className ?? ""}`}>
      <p className="text-xs tracking-[0.16em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{detail}</p>
    </div>
  );
}

export function DataChip({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
      <span className="mr-2 inline-flex h-2 w-2 rounded-full align-middle" style={{ backgroundColor: color }} />
      <span>{label}</span>
      <span className="ml-2 font-medium text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}

export function SegmentedBar({
  segments,
  className,
}: {
  segments: ShareSegment[];
  className?: string;
}) {
  return (
    <div className={`flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700 ${className ?? ""}`}>
      {segments.map((segment) => (
        <div
          key={`${segment.label}-${segment.color}`}
          className="h-full"
          style={{ width: `${Math.max(segment.percent, 1.5)}%`, backgroundColor: segment.color }}
          title={`${segment.label}: ${decimalFmt.format(segment.percent)}%`}
        />
      ))}
    </div>
  );
}

export function MiniBarList({
  items,
  compact = false,
}: {
  items: BarListItem[];
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {items.map((item) => (
        <div key={`${item.label}-${item.valueLabel}`}>
          <div className="mb-1 flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="truncate text-slate-800 dark:text-slate-200">{item.label}</p>
              {item.note ? <p className="truncate text-xs text-slate-500 dark:text-slate-400">{item.note}</p> : null}
            </div>
            <p className="shrink-0 font-medium text-slate-900 dark:text-slate-100">{item.valueLabel}</p>
          </div>
          <ValueProgressBar value={item.percent} max={100} color={item.color} />
        </div>
      ))}
    </div>
  );
}

export function ReserveRateBadge({ reserveRate }: { reserveRate: number }) {
  const toneClass =
    reserveRate < 8
      ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-400"
      : reserveRate < 12
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400"
        : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${toneClass}`}>
      予備率 {decimalFmt.format(reserveRate)}%
    </span>
  );
}

export function ValueProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  const percent = max <= 0 ? 0 : clamp((value / max) * 100, 0, 100);
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
      <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: color }} />
    </div>
  );
}

export function SupplyDemandMeter({
  demandMw,
  supplyMw,
  reserveMw,
  color,
}: {
  demandMw: number;
  supplyMw: number;
  reserveMw: number;
  color: string;
}) {
  const demandPercent = supplyMw > 0 ? clamp((demandMw / supplyMw) * 100, 0, 100) : 0;
  const reservePercent = supplyMw > 0 ? clamp((reserveMw / supplyMw) * 100, 0, 100) : 0;
  return (
    <div>
      <div className="relative h-4 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${demandPercent}%`, backgroundColor: color }} />
        <div
          className="absolute inset-y-0 right-0 bg-emerald-300/80 dark:bg-emerald-500/60"
          style={{ width: `${reservePercent}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span>需要</span>
        <span>供給力</span>
        <span>予備力</span>
      </div>
      <style jsx global>{`
        @keyframes network-flow-dash {
          from {
            stroke-dashoffset: 0;
          }
          to {
            stroke-dashoffset: -34;
          }
        }
      `}</style>
    </div>
  );
}

export function NetFlowMeter({
  valueMw,
  maxAbsMw,
  color,
}: {
  valueMw: number;
  maxAbsMw: number;
  color: string;
}) {
  const positivePercent = valueMw > 0 ? clamp((Math.abs(valueMw) / maxAbsMw) * 50, 0, 50) : 0;
  const negativePercent = valueMw < 0 ? clamp((Math.abs(valueMw) / maxAbsMw) * 50, 0, 50) : 0;
  return (
    <div>
      <div className="relative h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300 dark:bg-slate-500" />
        {positivePercent > 0 ? (
          <div
            className="absolute inset-y-0 left-1/2 rounded-r-full"
            style={{ width: `${positivePercent}%`, backgroundColor: color }}
          />
        ) : null}
        {negativePercent > 0 ? (
          <div
            className="absolute inset-y-0 right-1/2 rounded-l-full bg-amber-500"
            style={{ width: `${negativePercent}%` }}
          />
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
        <span>送電</span>
        <span>受電</span>
      </div>
    </div>
  );
}

export function CompositionLegendList({
  items,
  className,
}: {
  items: Array<{ name: string; totalKwh: number; percent: number; color: string }>;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      {items.map((item) => (
        <div
          key={item.name}
          className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/60"
        >
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
              aria-hidden="true"
            />
            <p className="min-w-0 truncate text-sm font-medium text-slate-800 dark:text-slate-200">{item.name}</p>
          </div>
          <div className="mt-1 flex items-end justify-between gap-3 pl-5">
            <p className="text-xs text-slate-500 dark:text-slate-400">{formatCompactEnergy(item.totalKwh)}</p>
            <p className="shrink-0 text-base font-semibold text-slate-900 dark:text-slate-100">{decimalFmt.format(item.percent)}%</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function LoadingOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 flex items-center justify-center rounded-3xl bg-white/60 backdrop-blur-sm dark:bg-slate-900/60">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600" />
        <p className="text-sm font-medium text-teal-700 dark:text-teal-400">データ読み込み中...</p>
      </div>
    </div>
  );
}

export function ChartSkeleton({ height = 320 }: { height?: number }) {
  return (
    <div className="animate-pulse" style={{ height }}>
      <div className="h-full rounded-2xl bg-slate-200/60 dark:bg-slate-700/40" />
    </div>
  );
}
