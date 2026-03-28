import type { TopUnit } from "@/lib/dashboard-types";
import type { PlantSummaryRow } from "@/lib/dashboard-computations";
import { FLOW_AREA_COLORS } from "@/lib/constants";
import { numberFmt, manKwFmt } from "@/lib/formatters";
import { TABLE_HEADER_CLASS } from "@/lib/styles";

type RankingsSectionProps = {
  filteredTopUnits: TopUnit[];
  filteredTopPlants: PlantSummaryRow[];
};

export function RankingsSection({
  filteredTopUnits,
  filteredTopPlants,
}: RankingsSectionProps) {
  return (
    <section className="rounded-3xl border border-white/70 bg-white/90 p-3 shadow-[var(--panel-shadow)] backdrop-blur-sm md:p-5 dark:border-slate-700/80 dark:bg-slate-800/90">
      <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-slate-100">
            <span className="inline-block h-5 w-1 rounded-full bg-teal-500" />
            高発電ユニット上位
          </h2>
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="min-w-full text-xs md:text-sm">
              <thead>
                <tr className={TABLE_HEADER_CLASS}>
                  <th className="whitespace-nowrap py-2.5 pr-2 md:pr-3">エリア</th>
                  <th className="whitespace-nowrap py-2.5 pr-2 md:pr-3">発電所</th>
                  <th className="whitespace-nowrap py-2.5 pr-2 md:pr-3">ユニット</th>
                  <th className="whitespace-nowrap py-2.5 pr-2 md:pr-3">方式</th>
                  <th className="whitespace-nowrap py-2.5 text-right">日量(kWh)</th>
                  <th className="whitespace-nowrap py-2.5 text-right">参考:最大出力(万kW)</th>
                </tr>
              </thead>
              <tbody>
                {filteredTopUnits.slice(0, 24).map((unit, idx) => (
                  <tr key={`${unit.area}-${unit.plantName}-${unit.unitName}`} className={`border-b border-slate-100/80 transition-colors hover:bg-teal-50/40 dark:border-slate-700/50 dark:hover:bg-teal-950/20 ${idx % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/30' : ''}`}>
                    <td className="whitespace-nowrap py-2 pr-2 md:py-2.5 md:pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: FLOW_AREA_COLORS[unit.area] ?? FLOW_AREA_COLORS.default }} />
                        {unit.area}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 font-medium text-slate-800 md:py-2.5 md:pr-3 dark:text-slate-200">{unit.plantName}</td>
                    <td className="whitespace-nowrap py-2 pr-2 md:py-2.5 md:pr-3">{unit.unitName}</td>
                    <td className="whitespace-nowrap py-2 pr-2 md:py-2.5 md:pr-3 text-slate-500 dark:text-slate-400">{unit.sourceType}</td>
                    <td className="whitespace-nowrap py-2 text-right font-semibold tabular-nums md:py-2.5">{numberFmt.format(unit.dailyKwh)}</td>
                    <td className="whitespace-nowrap py-2 text-right tabular-nums text-slate-400 md:py-2.5 dark:text-slate-500">
                      {typeof unit.maxOutputManKw === "number" ? manKwFmt.format(unit.maxOutputManKw) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900 2xl:mt-0 dark:text-slate-100">
            <span className="inline-block h-5 w-1 rounded-full bg-teal-500" />
            高発電発電所上位（ユニット合計）
          </h3>
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="min-w-full text-xs md:text-sm">
              <thead>
                <tr className={TABLE_HEADER_CLASS}>
                  <th className="whitespace-nowrap py-2.5 pr-2 md:pr-3">エリア</th>
                  <th className="whitespace-nowrap py-2.5 pr-2 md:pr-3">発電所</th>
                  <th className="whitespace-nowrap py-2.5 pr-2 md:pr-3">方式</th>
                  <th className="whitespace-nowrap py-2.5 text-right">最大出力(万kW)</th>
                  <th className="whitespace-nowrap py-2.5 text-right">日量(kWh)</th>
                </tr>
              </thead>
              <tbody>
                {filteredTopPlants.slice(0, 24).map((plant, idx) => (
                  <tr key={`${plant.area}-${plant.plantName}`} className={`border-b border-slate-100/80 transition-colors hover:bg-teal-50/40 dark:border-slate-700/50 dark:hover:bg-teal-950/20 ${idx % 2 === 1 ? 'bg-slate-50/50 dark:bg-slate-800/30' : ''}`}>
                    <td className="whitespace-nowrap py-2 pr-2 md:py-2.5 md:pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: FLOW_AREA_COLORS[plant.area] ?? FLOW_AREA_COLORS.default }} />
                        {plant.area}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 font-medium text-slate-800 md:py-2.5 md:pr-3 dark:text-slate-200">{plant.plantName}</td>
                    <td className="whitespace-nowrap py-2 pr-2 md:py-2.5 md:pr-3 text-slate-500 dark:text-slate-400">{plant.sourceType || "不明"}</td>
                    <td className="whitespace-nowrap py-2 text-right tabular-nums md:py-2.5">
                      {typeof plant.maxOutputManKw === "number" ? manKwFmt.format(plant.maxOutputManKw) : "-"}
                    </td>
                    <td className="whitespace-nowrap py-2 text-right font-semibold tabular-nums md:py-2.5">{numberFmt.format(plant.dailyKwh)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
