import type { AreaSupplyCard } from "@/lib/dashboard-computations";
import { FLOW_AREA_COLORS } from "@/lib/constants";
import {
  decimalFmt,
  normalizeSourceName,
  formatCompactEnergy,
} from "@/lib/formatters";
import {
  CompactStatCard,
  SegmentedBar,
  ReserveRateBadge,
  ValueProgressBar,
  SupplyDemandMeter,
  NetFlowMeter,
} from "@/components/ui/dashboard-ui";

type AreaCardsSectionProps = {
  areaSupplyCards: AreaSupplyCard[];
  selectedArea: string;
  selectedFlowSlotLabel: string;
  selectedFlowDateTimeLabel: string;
  maxAreaNetIntertieAbsMw: number;
  maxAreaPeakAbsMw: number;
};

export function AreaCardsSection({
  areaSupplyCards,
  selectedArea,
  selectedFlowSlotLabel,
  selectedFlowDateTimeLabel,
  maxAreaNetIntertieAbsMw,
  maxAreaPeakAbsMw,
}: AreaCardsSectionProps) {
  return (
    <section className="rounded-3xl border border-white/70 bg-white/90 p-3 shadow-[var(--panel-shadow)] backdrop-blur-sm md:p-5 dark:border-slate-700/80 dark:bg-slate-800/90">
      <div className="mb-4 flex flex-col gap-1 md:mb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
            <span className="inline-block h-5 w-1 rounded-full bg-teal-500" />
            エリア別需給カード
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {selectedArea === "全エリア"
              ? `全${areaSupplyCards.length}エリアの需要、予備率、電源構成、連系収支を俯瞰`
              : `${selectedArea} の需要、予備率、電源構成、連系収支を表示`}
          </p>
        </div>
        <p className="rounded-lg bg-slate-100 px-3 py-1 text-xs tabular-nums text-slate-500 dark:bg-slate-700/50 dark:text-slate-400">{selectedFlowDateTimeLabel} 時点</p>
      </div>
      <div className="stagger-children grid grid-cols-1 gap-4 xl:grid-cols-2">
        {areaSupplyCards.map((card) => {
          const areaColor = FLOW_AREA_COLORS[card.area] ?? FLOW_AREA_COLORS.default;
          const netDirection =
            card.netIntertieMw > 0 ? "受電超過" : card.netIntertieMw < 0 ? "送電超過" : "概ね均衡";
          const peerDirection =
            (card.peer?.signedMw ?? 0) > 0 ? "受電" : (card.peer?.signedMw ?? 0) < 0 ? "送電" : "均衡";
          return (
            <article
              key={card.area}
              className="group/card overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white/98 to-slate-50/96 shadow-[var(--panel-shadow)] transition-all duration-300 hover:shadow-[var(--panel-shadow-hover)] dark:border-slate-700/80 dark:from-slate-800/98 dark:to-slate-850/96"
            >
              <div className="h-1 transition-all duration-300 group-hover/card:h-1.5" style={{ background: `linear-gradient(90deg, ${areaColor}, ${areaColor}88)` }} />
              <div className="p-4 md:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-3 w-3 rounded-full"
                        style={{ backgroundColor: areaColor }}
                      />
                      <h3 className="text-xl font-semibold text-slate-900">{card.area}</h3>
                      <ReserveRateBadge reserveRate={card.reserveRate} />
                    </div>
                    <p className="mt-1 text-sm text-slate-600">全国発電シェア {card.sharePercent.toFixed(1)}%</p>
                    <div className="mt-2 max-w-sm">
                      <ValueProgressBar value={card.sharePercent} max={100} color={areaColor} />
                    </div>
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 px-4 py-3 text-white shadow-md md:px-5 md:py-3.5 dark:from-slate-700 dark:to-slate-800">
                    <p className="text-[11px] font-medium tracking-[0.16em] text-slate-400">日量発電</p>
                    <p className="mt-1 text-xl font-bold tabular-nums md:text-2xl">{formatCompactEnergy(card.totalKwh)}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs tracking-[0.16em] text-slate-500">需給バランス</p>
                      <p className="text-xs text-slate-500">{selectedFlowSlotLabel} 時点</p>
                    </div>
                    <div className="mt-3">
                      <SupplyDemandMeter
                        demandMw={card.demandMw}
                        supplyMw={card.supplyMw}
                        reserveMw={card.reserveMw}
                        reserveRate={card.reserveRate}
                        color={areaColor}
                      />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs tracking-[0.16em] text-slate-500">電源構成</p>
                      <p className="text-xs text-slate-500">
                        主力 {normalizeSourceName(card.topSource)} {card.topSourceShare.toFixed(1)}%
                      </p>
                    </div>
                    <div className="mt-3">
                      <SegmentedBar segments={card.sourceMix} />
                    </div>
                    <div className="mt-3 space-y-2">
                      {card.sourceMix.slice(0, 3).map((segment) => (
                        <div key={`${card.area}-${segment.label}`} className="flex items-center justify-between gap-3 text-sm">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                            <span className="truncate text-slate-700">{segment.label}</span>
                          </div>
                          <span className="shrink-0 text-slate-500">
                            {decimalFmt.format(segment.percent)}% / {formatCompactEnergy(segment.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                    <p className="text-xs tracking-[0.16em] text-slate-500">連系収支</p>
                    <div className="mt-3">
                      <NetFlowMeter
                        valueMw={card.netIntertieMw}
                        maxAbsMw={maxAreaNetIntertieAbsMw}
                        color={areaColor}
                      />
                    </div>
                    <p className="mt-3 text-base font-semibold text-slate-900">{netDirection}</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {decimalFmt.format(Math.abs(card.netIntertieMw))} MW
                    </p>
                  </div>
                  <CompactStatCard
                    label="最大相手先"
                    value={card.peer ? card.peer.counterpart : "-"}
                    detail={
                      card.peer
                        ? `${peerDirection} ${decimalFmt.format(Math.abs(card.peer.signedMw))} MW`
                        : "連系データなし"
                    }
                    className="h-full"
                  />
                  <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                    <p className="text-xs tracking-[0.16em] text-slate-500">地域内ピーク</p>
                    <div className="mt-3">
                      <ValueProgressBar value={card.peakAbsMw} max={maxAreaPeakAbsMw} color={areaColor} />
                    </div>
                    <p className="mt-3 text-base font-semibold text-slate-900">
                      {decimalFmt.format(card.peakAbsMw)} MW
                    </p>
                    <p className="mt-1 text-sm text-slate-600">地内送電線の最大|潮流|</p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                  <p className="text-xs tracking-[0.16em] text-slate-500">主要発電所</p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {card.primaryPlant?.plantName ?? "-"}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {card.primaryPlant
                      ? `${card.primaryPlant.sourceType || "不明"} / ${formatCompactEnergy(card.primaryPlant.dailyKwh)}`
                      : "発電所データなし"}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
