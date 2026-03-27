import {
  DASHBOARD_SECTION_OPTIONS,
  type DashboardSectionId,
} from "@/lib/constants";
import {
  toInputDateValue,
  toDisplayDateValue,
} from "@/lib/formatters";
import {
  SELECT_CLASS,
  PILL_BUTTON_CLASS,
} from "@/lib/styles";

type DashboardHeaderProps = {
  targetDate: string;
  fetchedAtLabel: string;
  selectedDate: string;
  earliestAvailableDate: string;
  latestAvailableDate: string;
  availableDateSet: Set<string>;
  isDateLoading: boolean;
  dateError: string | null;
  selectedArea: string;
  areas: string[];
  onDateChange: (date: string) => void;
  onDateError: (error: string | null) => void;
  onAreaChange: (area: string) => void;
};

export function DashboardHeader({
  targetDate,
  fetchedAtLabel,
  selectedDate,
  earliestAvailableDate,
  latestAvailableDate,
  availableDateSet,
  isDateLoading,
  dateError,
  selectedArea,
  areas,
  onDateChange,
  onDateError,
  onAreaChange,
}: DashboardHeaderProps) {
  return (
    <header className="animate-fade-in-up rounded-3xl border border-white/70 bg-white/85 px-4 py-4 shadow-[var(--panel-shadow)] backdrop-blur-sm md:px-6 md:py-6 dark:border-slate-700/80 dark:bg-slate-800/85">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.22em] text-teal-600 dark:text-teal-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-teal-500 animate-[pulse-subtle_2s_ease-in-out_infinite]" />
            OCCTO GRID OBSERVATORY
          </p>
          <h1 className="mt-1 text-xl font-bold leading-tight tracking-tight md:text-3xl">
            発電実績 <span className="text-teal-600 dark:text-teal-400">×</span>送電潮流実績 ダッシュボード
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            対象日: <span className="font-medium text-slate-700 dark:text-slate-300">{targetDate}</span>
            <span className="mx-2 text-slate-300 dark:text-slate-600">|</span>
            最終取り込み: {fetchedAtLabel}
          </p>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            ※ 対象日の確定データは概ね翌日 13〜14 時 (JST) 頃に反映されます
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 md:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="dashboard-date" className="text-sm font-medium text-slate-500 dark:text-slate-400">
              対象日
            </label>
            <input
              id="dashboard-date"
              type="date"
              className={SELECT_CLASS}
              value={toInputDateValue(selectedDate)}
              min={toInputDateValue(earliestAvailableDate)}
              max={toInputDateValue(latestAvailableDate)}
              onChange={(event) => {
                const nextDate = toDisplayDateValue(event.target.value);
                if (!nextDate) {
                  onDateError("対象日を入力してください。");
                  return;
                }
                if (!availableDateSet.has(nextDate)) {
                  onDateError(`${nextDate} の公開データはまだありません。最新は ${latestAvailableDate} です。`);
                  return;
                }
                onDateError(null);
                onDateChange(nextDate);
              }}
              disabled={isDateLoading}
            />
            {isDateLoading ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-teal-700 dark:text-teal-400">
                <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-teal-200 border-t-teal-600" />
                読み込み中...
              </span>
            ) : null}
          </div>
          <p className="hidden text-xs text-slate-400 md:block dark:text-slate-500">
            公開データ範囲: {earliestAvailableDate} 〜 {latestAvailableDate}
          </p>
          <div className="flex items-center gap-2">
            <label htmlFor="area" className="text-sm font-medium text-slate-500 dark:text-slate-400">
              エリア
            </label>
            <select
              id="area"
              className={SELECT_CLASS}
              value={selectedArea}
              onChange={(event) => onAreaChange(event.target.value)}
            >
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>
          {dateError ? <p className="text-xs font-medium text-rose-600 dark:text-rose-400">{dateError}</p> : null}
        </div>
      </div>
    </header>
  );
}

type SectionToggleProps = {
  visibleSectionSet: Set<DashboardSectionId>;
  onSetVisibleSectionIds: (ids: DashboardSectionId[] | ((current: DashboardSectionId[]) => DashboardSectionId[])) => void;
};

export function SectionToggle({ visibleSectionSet, onSetVisibleSectionIds }: SectionToggleProps) {
  return (
    <section className="animate-fade-in-up rounded-3xl border border-white/70 bg-white/85 p-3 shadow-[var(--panel-shadow)] backdrop-blur-sm md:p-5 dark:border-slate-700/80 dark:bg-slate-800/85" style={{ animationDelay: '80ms' }}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-block h-4 w-1 rounded-full bg-slate-400 dark:bg-slate-500" />
          <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">表示するパネル</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={PILL_BUTTON_CLASS}
            onClick={() => onSetVisibleSectionIds(DASHBOARD_SECTION_OPTIONS.map((item) => item.id))}
          >
            すべて表示
          </button>
          <button
            type="button"
            className={PILL_BUTTON_CLASS}
            onClick={() => onSetVisibleSectionIds(["summary", "areaCards", "composition", "network"])}
          >
            俯瞰モード
          </button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {DASHBOARD_SECTION_OPTIONS.map((item) => {
          const active = visibleSectionSet.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              role="switch"
              aria-checked={active}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-200 active:scale-[0.96] ${
                active
                  ? "border-teal-500 bg-gradient-to-b from-teal-500 to-teal-600 text-white shadow-sm shadow-teal-500/20"
                  : "border-slate-200 bg-white text-slate-600 shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:border-teal-300 hover:text-teal-700 hover:shadow-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-teal-500 dark:hover:text-teal-400"
              }`}
              onClick={() =>
                onSetVisibleSectionIds((current: DashboardSectionId[]) => {
                  if (current.includes(item.id)) {
                    return current.filter((id) => id !== item.id);
                  }
                  return [...current, item.id];
                })
              }
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
