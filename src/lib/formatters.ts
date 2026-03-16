import { AREA_DISPLAY_ORDER } from "./constants";

const numberFmt = new Intl.NumberFormat("ja-JP");
const decimalFmt = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 });
const manKwFmt = new Intl.NumberFormat("ja-JP", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const jstDateTimeFmt = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export { numberFmt, decimalFmt, manKwFmt, jstDateTimeFmt };

export type ShareSegment = {
  label: string;
  value: number;
  percent: number;
  color: string;
};

export function normalizeSourceName(source: string): string {
  const trimmed = source.trim();
  return trimmed.length > 0 ? trimmed : "不明";
}

export function formatEnergyGwh(kwh: number): string {
  return `${decimalFmt.format(kwh / 1_000_000)} GWh`;
}

export function formatCompactEnergy(kwh: number): string {
  if (Math.abs(kwh) >= 1_000_000_000) {
    return `${decimalFmt.format(kwh / 1_000_000_000)} TWh`;
  }
  if (Math.abs(kwh) >= 1_000_000) {
    return `${decimalFmt.format(kwh / 1_000_000)} GWh`;
  }
  if (Math.abs(kwh) >= 1_000) {
    return `${decimalFmt.format(kwh / 1_000)} MWh`;
  }
  return `${numberFmt.format(Math.round(kwh))} kWh`;
}

export function formatVoltageKv(voltage: string | undefined): string {
  const trimmed = (voltage ?? "").trim();
  if (!trimmed) {
    return "";
  }
  if (/[vVＶ]/.test(trimmed)) {
    return trimmed.replace(/kv/gi, "kV");
  }
  return `${trimmed}kV`;
}

export function formatJstDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return jstDateTimeFmt.format(date);
}

export function toDateStamp(dateText: string): string {
  return dateText.trim().replaceAll("/", "").replaceAll("-", "");
}

export function toInputDateValue(dateText: string): string {
  const matched = dateText.trim().match(/^(\d{4})[/-](\d{2})[/-](\d{2})$/);
  if (!matched) {
    return "";
  }
  return `${matched[1]}-${matched[2]}-${matched[3]}`;
}

export function toDisplayDateValue(dateText: string): string {
  if (!dateText.trim()) {
    return "";
  }
  const matched = dateText.trim().match(/^(\d{4})[/-](\d{2})[/-](\d{2})$/);
  if (!matched) {
    return dateText;
  }
  return `${matched[1]}/${matched[2]}/${matched[3]}`;
}

export function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function compareAreaOrder(a: string, b: string): number {
  const aIndex = AREA_DISPLAY_ORDER.indexOf(a);
  const bIndex = AREA_DISPLAY_ORDER.indexOf(b);
  if (aIndex === -1 && bIndex === -1) {
    return a.localeCompare(b, "ja-JP");
  }
  if (aIndex === -1) {
    return 1;
  }
  if (bIndex === -1) {
    return -1;
  }
  return aIndex - bIndex;
}

export function hashSeed(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function buildTopShareSegments<T>(
  rows: T[],
  total: number,
  limit: number,
  getLabel: (item: T) => string,
  getValue: (item: T) => number,
  getColor: (item: T, index: number) => string,
): ShareSegment[] {
  if (total <= 0 || rows.length === 0) {
    return [];
  }

  const segments = rows.slice(0, limit).map((item, index) => {
    const value = getValue(item);
    return {
      label: getLabel(item),
      value,
      percent: (value / total) * 100,
      color: getColor(item, index),
    };
  });

  const remainder = rows.slice(limit).reduce((sum, item) => sum + getValue(item), 0);
  if (remainder > 0) {
    segments.push({
      label: "その他",
      value: remainder,
      percent: (remainder / total) * 100,
      color: "#cbd5e1",
    });
  }

  return segments.filter((segment) => segment.percent > 0);
}
