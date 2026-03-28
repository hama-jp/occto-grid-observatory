/**
 * Shared constants, types, and utility functions for the ingest pipeline.
 */

export const HKS_BASE = "https://hatsuden-kokai.occto.or.jp/hks-web-public";
export const OCCTO_LOGIN_URL =
  "https://occtonet3.occto.or.jp/public/dfw/RP11/OCCTO/SD/LOGIN_login#";

export const FLOW_AREAS = [
  { code: "01", name: "北海道" },
  { code: "02", name: "東北" },
  { code: "03", name: "東京" },
  { code: "04", name: "中部" },
  { code: "05", name: "北陸" },
  { code: "06", name: "関西" },
  { code: "07", name: "中国" },
  { code: "08", name: "四国" },
  { code: "09", name: "九州" },
  { code: "10", name: "沖縄" },
] as const;

export const AREA_ORDER_INDEX = new Map<string, number>(FLOW_AREAS.map((item, index) => [item.name, index]));

export type CliArgs = {
  mode: "daily" | "now" | "backfill";
  targetDates: string[];
  force: boolean;
  sample: "daily" | "monthly" | "quarterly";
};

export type DownloadResult = {
  generationCsv: string;
  flowCsvByArea: string[];
  intertieCsvByLine: string[];
  reserveJson: string;
};

export type IntertieFlowRow = {
  intertieName: string;
  targetDate: string;
  time: string;
  actualMw: number;
};

export type IntertieAreaDefinition = {
  sourceArea: string;
  targetArea: string;
};

export const INTERTIE_AREA_MAP: Record<string, IntertieAreaDefinition> = {
  "北海道・本州間電力連系設備": { sourceArea: "北海道", targetArea: "東北" },
  相馬双葉幹線: { sourceArea: "東北", targetArea: "東京" },
  周波数変換設備: { sourceArea: "東京", targetArea: "中部" },
  三重東近江線: { sourceArea: "中部", targetArea: "関西" },
  "南福光連系所・南福光変電所の連系設備": { sourceArea: "北陸", targetArea: "関西" },
  越前嶺南線: { sourceArea: "北陸", targetArea: "関西" },
  "西播東岡山線・山崎智頭線": { sourceArea: "関西", targetArea: "中国" },
  阿南紀北直流幹線: { sourceArea: "関西", targetArea: "四国" },
  本四連系線: { sourceArea: "中国", targetArea: "四国" },
  関門連系線: { sourceArea: "中国", targetArea: "九州" },
  北陸フェンス: { sourceArea: "中部", targetArea: "北陸" },
};

export class NoDataAvailableError extends Error {
  source: string;
  targetDate: string;

  constructor(source: string, targetDate: string, message?: string) {
    super(message ?? `${source} data is not available for ${targetDate}`);
    this.name = "NoDataAvailableError";
    this.source = source;
    this.targetDate = targetDate;
  }
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

export function parseNumber(raw: string | undefined): number {
  if (!raw) {
    return 0;
  }
  const normalized = raw.replaceAll(",", "").trim();
  if (normalized.length === 0) {
    return 0;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sanitizeFilePart(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned : "intertie";
}

export function compareAreaOrder(a: string, b: string): number {
  const aIndex = AREA_ORDER_INDEX.get(a) ?? Number.MAX_SAFE_INTEGER;
  const bIndex = AREA_ORDER_INDEX.get(b) ?? Number.MAX_SAFE_INTEGER;
  if (aIndex !== bIndex) {
    return aIndex - bIndex;
  }
  return a.localeCompare(b, "ja");
}

export function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fileExists(filePath: string): Promise<boolean> {
  const { promises: fs } = await import("node:fs");
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function normalizeDate(input: string): string | null {
  const unified = input.trim().replaceAll("-", "/");
  const matched = unified.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!matched) {
    return null;
  }
  const [, y, m, d] = matched;
  const date = new Date(`${y}-${m}-${d}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${y}/${m}/${d}`;
}

export function defaultTodayJst(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const jstNow = new Date(utc + 9 * 60 * 60_000);
  const yyyy = String(jstNow.getUTCFullYear());
  const mm = String(jstNow.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(jstNow.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

export function defaultYesterdayJst(): string {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000;
  const jstNow = new Date(utc + 9 * 60 * 60_000);
  const yesterdayJst = new Date(jstNow.getTime() - 24 * 60 * 60_000);
  const yyyy = String(yesterdayJst.getUTCFullYear());
  const mm = String(yesterdayJst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(yesterdayJst.getUTCDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

export function compareNormalizedDate(a: string, b: string): number {
  return a.replaceAll("/", "").localeCompare(b.replaceAll("/", ""), "en");
}
