/**
 * CSV/JSON parsers — read raw downloaded files into typed row arrays.
 */

import { promises as fs } from "node:fs";
import iconv from "iconv-lite";
import { parse } from "csv-parse/sync";
import type {
  AreaReserveSeries,
  FlowRow,
  GenerationRow,
} from "../../src/lib/dashboard-types";
import {
  FLOW_AREAS,
  parseNumber,
  roundTo,
  compareAreaOrder,
  type IntertieFlowRow,
} from "./constants";

export async function parseGenerationCsv(filePath: string): Promise<GenerationRow[]> {
  const raw = await fs.readFile(filePath);
  const text = raw.toString("utf-8").replace(/^\uFEFF/, "");
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];

  if (rows.length === 0) {
    return [];
  }

  const slotLabels = Object.keys(rows[0]).filter((key) => /^\d{2}:\d{2}\[kWh\]$/.test(key));

  return rows.map((row) => ({
    plantCode: row["発電所コード"] ?? "",
    area: row["エリア"] ?? "",
    plantName: row["発電所名"] ?? "",
    unitName: row["ユニット名"] ?? "",
    sourceType: row["発電方式・燃種"] ?? "",
    targetDate: row["対象日"] ?? "",
    values: slotLabels.map((label) => parseNumber(row[label])),
    dailyKwh: parseNumber(row["日量[kWh]"]),
    updatedAt: row["更新日時"] ?? "",
  }));
}

export async function parseFlowCsv(filePaths: string[]): Promise<FlowRow[]> {
  const parsed: FlowRow[] = [];

  for (const filePath of filePaths) {
    const raw = await fs.readFile(filePath);
    const text = iconv.decode(raw, "cp932");
    const rows = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    if (rows.length === 0) {
      continue;
    }

    const slotLabels = Object.keys(rows[0]).filter((key) => /^([01]\d|2[0-3]):[03]0$/.test(key));

    for (const row of rows) {
      parsed.push({
        targetDate: row["対象年月日"] ?? "",
        area: row["対象エリア"] ?? "",
        voltageKv: row["電圧"] ?? "",
        lineName: row["送電線名"] ?? "",
        positiveDirection: row["潮流方向(正方向)"] ?? "",
        values: slotLabels.map((label) => parseNumber(row[label])),
      });
    }
  }

  return parsed;
}

export async function parseIntertieCsv(filePaths: string[]): Promise<IntertieFlowRow[]> {
  const parsed: IntertieFlowRow[] = [];

  for (const filePath of filePaths) {
    const raw = await fs.readFile(filePath);
    const text = iconv.decode(raw, "cp932");
    const rows = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    for (const row of rows) {
      parsed.push({
        intertieName: row["連系線"] ?? "",
        targetDate: row["対象日付"] ?? "",
        time: row["対象時刻"] ?? "",
        actualMw: parseNumber(row["潮流実績"]),
      });
    }
  }

  return parsed;
}

export async function parseReserveJson(filePath: string): Promise<AreaReserveSeries[]> {
  const content = await fs.readFile(filePath, "utf-8");
  const payload = JSON.parse(content) as {
    todayAreaRsvRateList?: Array<{
      areaCd: string;
      areaRsvRateItems?: Array<{
        koikJyyu?: number;
        koikKyu?: number;
        koikRsv?: number;
        koikRsvRate?: number;
        koikSyuRate?: number;
        areaJyyu?: number;
        areaKyu?: number;
        areaRsv?: number;
        areaRsvRate?: number;
        areaSyuRate?: number;
      }>;
    }>;
  };

  const areaCodeMap = new Map<string, string>(FLOW_AREAS.map((item) => [item.code, item.name]));

  const rows = (payload.todayAreaRsvRateList ?? []).flatMap((row) => {
    const area = areaCodeMap.get(row.areaCd);
    if (!area || !row.areaRsvRateItems || row.areaRsvRateItems.length === 0) {
      return [];
    }

    const series: AreaReserveSeries = {
      area,
      demandMw: row.areaRsvRateItems.map((item) => roundTo(item.areaJyyu ?? 0, 3)),
      supplyMw: row.areaRsvRateItems.map((item) => roundTo(item.areaKyu ?? 0, 3)),
      reserveMw: row.areaRsvRateItems.map((item) => roundTo(item.areaRsv ?? 0, 3)),
      reserveRate: row.areaRsvRateItems.map((item) => roundTo(item.areaRsvRate ?? 0, 2)),
      usageRate: row.areaRsvRateItems.map((item) => roundTo(item.areaSyuRate ?? 0, 2)),
      blockDemandMw: row.areaRsvRateItems.map((item) => roundTo(item.koikJyyu ?? 0, 3)),
      blockSupplyMw: row.areaRsvRateItems.map((item) => roundTo(item.koikKyu ?? 0, 3)),
      blockReserveMw: row.areaRsvRateItems.map((item) => roundTo(item.koikRsv ?? 0, 3)),
      blockReserveRate: row.areaRsvRateItems.map((item) => roundTo(item.koikRsvRate ?? 0, 2)),
      blockUsageRate: row.areaRsvRateItems.map((item) => roundTo(item.koikSyuRate ?? 0, 2)),
    };
    return [series];
  });

  return rows.sort((a, b) => compareAreaOrder(a.area, b.area));
}
