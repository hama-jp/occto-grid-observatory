import {
  SummaryCard,
  CompactStatCard,
  MiniBarList,
  DataChip,
} from "@/components/ui/dashboard-ui";
import { decimalFmt } from "@/lib/formatters";
import type { JepxSpotPrice } from "@/lib/dashboard-types";
import type { BarListItem } from "@/components/ui/dashboard-ui";
import { FLOW_AREA_COLORS, AREA_DISPLAY_ORDER } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function weightedAvg(prices: number[], volumes: number[]): number {
  let sumPV = 0;
  let sumV = 0;
  for (let i = 0; i < prices.length; i++) {
    const v = volumes[i] ?? 0;
    sumPV += prices[i] * v;
    sumV += v;
  }
  return sumV > 0 ? sumPV / sumV : avg(prices);
}

const priceFmt = new Intl.NumberFormat("ja-JP", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const volumeFmt = new Intl.NumberFormat("ja-JP", {
  maximumFractionDigits: 0,
});

// ---------------------------------------------------------------------------
// Exported highlight builder
// ---------------------------------------------------------------------------

export type JepxHighlights = {
  systemAvgPrice: number;
  systemWeightedAvgPrice: number;
  systemMaxPrice: number;
  systemMinPrice: number;
  systemMaxSlot: number;
  systemMinSlot: number;
  totalVolumeMwh: number;
  areaPriceItems: BarListItem[];
  peakAreaPrice: { area: string; price: number } | null;
  priceSpread: number;
};

export function buildJepxHighlights(
  spot: JepxSpotPrice,
  slotLabels: string[],
): JepxHighlights {
  const prices = spot.systemPrices;
  const volumes = spot.volumes;
  const systemAvgPrice = avg(prices);
  const systemWeightedAvgPrice = weightedAvg(prices, volumes);
  const systemMaxPrice = Math.max(...prices);
  const systemMinPrice = Math.min(...prices);
  const systemMaxSlot = prices.indexOf(systemMaxPrice);
  const systemMinSlot = prices.indexOf(systemMinPrice);
  const totalVolumeMwh = volumes.reduce((s, v) => s + v, 0);

  // Area average prices
  const areaAvgs: Array<{ area: string; avgPrice: number }> = [];
  for (const area of AREA_DISPLAY_ORDER) {
    const areaPrices = spot.areaPrices[area];
    if (areaPrices && areaPrices.length > 0) {
      areaAvgs.push({ area, avgPrice: avg(areaPrices) });
    }
  }
  // Also include any areas not in display order
  for (const [area, areaPrices] of Object.entries(spot.areaPrices)) {
    if (!AREA_DISPLAY_ORDER.includes(area) && areaPrices.length > 0) {
      areaAvgs.push({ area, avgPrice: avg(areaPrices) });
    }
  }

  const maxAreaAvg = Math.max(...areaAvgs.map((a) => a.avgPrice), 1);
  const areaPriceItems: BarListItem[] = areaAvgs.map((a) => ({
    label: a.area,
    valueLabel: `${priceFmt.format(a.avgPrice)} 円`,
    percent: maxAreaAvg > 0 ? (a.avgPrice / maxAreaAvg) * 100 : 0,
    color: FLOW_AREA_COLORS[a.area] ?? FLOW_AREA_COLORS.default,
    note: `システム比 ${systemAvgPrice > 0 ? (a.avgPrice >= systemAvgPrice ? "+" : "") + priceFmt.format(a.avgPrice - systemAvgPrice) : "0"} 円`,
  }));

  const peakArea = areaAvgs.length > 0
    ? areaAvgs.reduce((max, a) => (a.avgPrice > max.avgPrice ? a : max))
    : null;

  return {
    systemAvgPrice,
    systemWeightedAvgPrice,
    systemMaxPrice,
    systemMinPrice,
    systemMaxSlot,
    systemMinSlot,
    totalVolumeMwh,
    areaPriceItems,
    peakAreaPrice: peakArea ? { area: peakArea.area, price: peakArea.avgPrice } : null,
    priceSpread: systemMaxPrice - systemMinPrice,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type JepxMarketCardProps = {
  spot: JepxSpotPrice;
  slotLabels: string[];
  selectedArea: string;
  clampedSlotIndex: number;
};

export function JepxMarketCard({
  spot,
  slotLabels,
  selectedArea,
  clampedSlotIndex,
}: JepxMarketCardProps) {
  const highlights = buildJepxHighlights(spot, slotLabels);
  const currentPrice = spot.systemPrices[clampedSlotIndex] ?? highlights.systemAvgPrice;
  const currentVolume = spot.volumes[clampedSlotIndex] ?? 0;
  const currentSlotLabel = slotLabels[clampedSlotIndex] ?? "-";

  // Area price at current slot
  const currentAreaPrice =
    selectedArea !== "全エリア" && spot.areaPrices[selectedArea]
      ? spot.areaPrices[selectedArea][clampedSlotIndex] ?? null
      : null;

  // Price level indicator
  const priceLevel =
    currentPrice >= 20
      ? { label: "高騰", colorClass: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-400" }
      : currentPrice >= 10
        ? { label: "やや高", colorClass: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-400" }
        : { label: "安定", colorClass: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400" };

  // Mini sparkline: show 8 evenly spaced price bars
  const step = Math.max(1, Math.floor(spot.systemPrices.length / 8));
  const sparkBars: Array<{ slot: number; price: number }> = [];
  for (let i = 0; i < spot.systemPrices.length; i += step) {
    sparkBars.push({ slot: i, price: spot.systemPrices[i] });
    if (sparkBars.length >= 8) break;
  }
  const sparkMax = Math.max(...sparkBars.map((b) => b.price), 0.01);

  return (
    <SummaryCard
      title="JEPXスポット市場"
      value={`${priceFmt.format(currentPrice)} 円/kWh`}
      detail={`${currentSlotLabel} 時点のシステムプライス`}
      accentColor="#6366f1"
    >
      {/* Price level badge */}
      <div className="mb-3 flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${priceLevel.colorClass}`}>
          {priceLevel.label}
        </span>
        {currentAreaPrice !== null ? (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {selectedArea}: {priceFmt.format(currentAreaPrice)} 円/kWh
          </span>
        ) : null}
      </div>

      {/* Spark bars */}
      <div className="mb-3">
        <div className="flex h-10 items-end gap-0.5">
          {sparkBars.map((bar) => {
            const heightPercent = sparkMax > 0 ? (bar.price / sparkMax) * 100 : 0;
            const isActive = bar.slot <= clampedSlotIndex && (bar.slot + step) > clampedSlotIndex;
            return (
              <div
                key={bar.slot}
                className={`flex-1 rounded-t transition-all duration-300 ${isActive ? "opacity-100" : "opacity-60"}`}
                style={{
                  height: `${Math.max(heightPercent, 4)}%`,
                  backgroundColor: isActive ? "#6366f1" : "#a5b4fc",
                }}
                title={`${slotLabels[bar.slot] ?? ""}: ${priceFmt.format(bar.price)} 円/kWh`}
              />
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
          <span>{slotLabels[0] ?? ""}</span>
          <span>{slotLabels[slotLabels.length - 1] ?? ""}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <CompactStatCard
          label="日平均"
          value={`${priceFmt.format(highlights.systemAvgPrice)} 円`}
          detail={`加重平均 ${priceFmt.format(highlights.systemWeightedAvgPrice)} 円`}
        />
        <CompactStatCard
          label="約定量"
          value={`${volumeFmt.format(currentVolume)} MWh`}
          detail={`日計 ${volumeFmt.format(highlights.totalVolumeMwh)} MWh`}
        />
      </div>

      {/* Price range chips */}
      <div className="mt-3 flex flex-wrap gap-2">
        <DataChip
          label={`高値 ${slotLabels[highlights.systemMaxSlot] ?? ""}`}
          value={`${priceFmt.format(highlights.systemMaxPrice)} 円`}
          color="#ef4444"
        />
        <DataChip
          label={`安値 ${slotLabels[highlights.systemMinSlot] ?? ""}`}
          value={`${priceFmt.format(highlights.systemMinPrice)} 円`}
          color="#22c55e"
        />
        <DataChip
          label="スプレッド"
          value={`${priceFmt.format(highlights.priceSpread)} 円`}
          color="#8b5cf6"
        />
      </div>
    </SummaryCard>
  );
}

// ---------------------------------------------------------------------------
// Full section with area breakdown (used in bottom section)
// ---------------------------------------------------------------------------

type JepxAreaBreakdownProps = {
  spot: JepxSpotPrice;
  slotLabels: string[];
};

export function JepxAreaBreakdown({ spot, slotLabels }: JepxAreaBreakdownProps) {
  const highlights = buildJepxHighlights(spot, slotLabels);

  if (highlights.areaPriceItems.length === 0) return null;

  return (
    <SummaryCard
      title="エリアプライス"
      value={
        highlights.peakAreaPrice
          ? `${highlights.peakAreaPrice.area} ${priceFmt.format(highlights.peakAreaPrice.price)} 円`
          : "-"
      }
      detail="日平均が最も高いエリア"
      accentColor="#8b5cf6"
    >
      <MiniBarList items={highlights.areaPriceItems.slice(0, 5)} />
    </SummaryCard>
  );
}
