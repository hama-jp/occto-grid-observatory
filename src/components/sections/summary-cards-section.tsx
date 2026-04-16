import { memo } from "react";
import {
  SummaryCard,
  CompactStatCard,
  DataChip,
  SegmentedBar,
  MiniBarList,
} from "@/components/ui/dashboard-ui";
import {
  numberFmt,
  decimalFmt,
  manKwFmt,
  normalizeSourceName,
  formatCompactEnergy,
  formatEnergyGwh,
} from "@/lib/formatters";
import { buildUnitLabel, type DashboardHighlights } from "@/lib/dashboard-computations";

type SummaryCardsTopProps = {
  dashboardHighlights: DashboardHighlights;
  areaTotalsLength: number;
};

function SummaryCardsTopImpl({ dashboardHighlights, areaTotalsLength }: SummaryCardsTopProps) {
  return (
    <section className="stagger-children grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <SummaryCard
        title="全国発電量"
        value={formatEnergyGwh(dashboardHighlights.totalGenerationKwh)}
        detail={`${areaTotalsLength} エリア合計`}
        accentColor="#0b525b"
      >
        <SegmentedBar segments={dashboardHighlights.areaShareSegments} />
        <div className="mt-3 flex flex-wrap gap-2">
          {dashboardHighlights.areaShareSegments.slice(0, 4).map((segment) => (
            <DataChip
              key={segment.label}
              label={segment.label}
              value={`${decimalFmt.format(segment.percent)}%`}
              color={segment.color}
            />
          ))}
        </div>
      </SummaryCard>
      <SummaryCard
        title="主力電源"
        value={dashboardHighlights.topSource ? normalizeSourceName(dashboardHighlights.topSource.source) : "-"}
        detail={
          dashboardHighlights.topSource
            ? `${dashboardHighlights.topSourceShare.toFixed(1)}% / ${formatCompactEnergy(
                dashboardHighlights.topSource.totalKwh,
              )}`
            : "データなし"
        }
        accentColor="#197278"
      >
        <SegmentedBar segments={dashboardHighlights.sourceShareSegments} />
        <MiniBarList items={dashboardHighlights.sourceShareSegments.slice(0, 4).map((segment) => ({
          label: segment.label,
          valueLabel: `${decimalFmt.format(segment.percent)}%`,
          percent: segment.percent,
          color: segment.color,
          note: formatCompactEnergy(segment.value),
        }))} />
      </SummaryCard>
      <SummaryCard
        title="発電トップ"
        value={dashboardHighlights.largestUnit ? buildUnitLabel(dashboardHighlights.largestUnit.plantName, dashboardHighlights.largestUnit.unitName) : "-"}
        detail={
          dashboardHighlights.largestUnit
            ? `${dashboardHighlights.largestUnit.area} / ${numberFmt.format(
                dashboardHighlights.largestUnit.dailyKwh,
              )} kWh（最大 ${manKwFmt.format(dashboardHighlights.largestUnit.maxOutputManKw)} 万kW）`
            : "データなし"
        }
        accentColor="#1d3557"
      >
        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-medium tracking-[0.14em] text-slate-500 dark:text-slate-400">最大ユニット</p>
            <MiniBarList items={dashboardHighlights.unitLeaderItems} compact />
          </div>
          <div>
            <p className="text-[11px] font-medium tracking-[0.14em] text-slate-500 dark:text-slate-400">最大発電所</p>
            <MiniBarList items={dashboardHighlights.plantLeaderItems} compact />
          </div>
        </div>
      </SummaryCard>
    </section>
  );
}

type SummaryCardsBottomProps = {
  dashboardHighlights: DashboardHighlights;
  selectedFlowDateTimeLabel: string;
};

function SummaryCardsBottomImpl({ dashboardHighlights, selectedFlowDateTimeLabel }: SummaryCardsBottomProps) {
  return (
    <section className="stagger-children grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <SummaryCard
        title="予備率監視"
        value={
          dashboardHighlights.lowestReserveArea
            ? `${dashboardHighlights.lowestReserveArea.area} ${decimalFmt.format(
                dashboardHighlights.lowestReserveArea.reserveRate,
              )}%`
            : "-"
        }
        detail={
          dashboardHighlights.lowestReserveArea
            ? `表示時刻 ${selectedFlowDateTimeLabel}`
            : "予備率データなし"
        }
        accentColor="#0f766e"
      >
        <MiniBarList items={dashboardHighlights.reserveWatchItems} />
      </SummaryCard>
      <SummaryCard
        title="需要ピーク"
        value={dashboardHighlights.peakDemandArea ? dashboardHighlights.peakDemandArea.area : "-"}
        detail={
          dashboardHighlights.peakDemandArea
            ? `${decimalFmt.format(dashboardHighlights.peakDemandArea.demandMw)} MW / ${selectedFlowDateTimeLabel}`
            : "需要データなし"
        }
        accentColor="#f77f00"
      >
        <MiniBarList items={dashboardHighlights.demandLeaderItems} />
      </SummaryCard>
      <SummaryCard
        title="連系潮流監視"
        value={
          dashboardHighlights.hottestIntertie
            ? `${dashboardHighlights.hottestIntertie.sourceArea} ⇄ ${dashboardHighlights.hottestIntertie.targetArea}`
            : "-"
        }
        detail={
          dashboardHighlights.hottestIntertie
            ? `${decimalFmt.format(dashboardHighlights.hottestIntertie.magnitudeMw)} MW / ${selectedFlowDateTimeLabel}`
            : "連系線データなし"
        }
        accentColor="#bc4749"
      >
        <MiniBarList items={dashboardHighlights.intertieWatchItems} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <CompactStatCard
            label="受電超過"
            value={dashboardHighlights.strongestImportValue}
            detail={dashboardHighlights.strongestImportDetail}
          />
          <CompactStatCard
            label="送電超過"
            value={dashboardHighlights.strongestExportValue}
            detail={dashboardHighlights.strongestExportDetail}
          />
        </div>
      </SummaryCard>
    </section>
  );
}

export const SummaryCardsTop = memo(SummaryCardsTopImpl);
export const SummaryCardsBottom = memo(SummaryCardsBottomImpl);
