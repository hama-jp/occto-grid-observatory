"use client";

import { useEffect, useMemo, useState } from "react";
import type { DashboardData } from "@/lib/dashboard-types";
import { toDateStamp, formatJstDateTime } from "@/lib/formatters";

export function useDashboardData(initialData: DashboardData, availableDates: string[]) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [selectedDate, setSelectedDate] = useState<string>(initialData.meta.targetDate);
  const [isDateLoading, setIsDateLoading] = useState<boolean>(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const filteredIntertieSeries = useMemo(
    () => (data.flows.intertieSeries ?? []).filter((row) => row.sourceArea !== "不明" && row.targetArea !== "不明"),
    [data.flows.intertieSeries],
  );

  const fetchedAtLabel = useMemo(() => formatJstDateTime(initialData.meta.fetchedAt), [initialData.meta.fetchedAt]);

  const selectableDates = useMemo(() => {
    const merged = new Set<string>([...availableDates, initialData.meta.targetDate, data.meta.targetDate]);
    return Array.from(merged).sort((a, b) => toDateStamp(b).localeCompare(toDateStamp(a), "en"));
  }, [availableDates, data.meta.targetDate, initialData.meta.targetDate]);

  const availableDateSet = useMemo(() => new Set<string>(selectableDates), [selectableDates]);
  const earliestAvailableDate = selectableDates.at(-1) ?? data.meta.targetDate;
  const latestAvailableDate = selectableDates[0] ?? data.meta.targetDate;
  const selectedDateIsAvailable = availableDateSet.has(selectedDate);

  useEffect(() => {
    if (!selectedDateIsAvailable || selectedDate === data.meta.targetDate) {
      return;
    }

    let cancelled = false;
    const previousDate = data.meta.targetDate;

    const fetchByDate = async (): Promise<void> => {
      setIsDateLoading(true);
      setDateError(null);

      try {
        const dateStamp = toDateStamp(selectedDate);
        const dataBasePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
        const response = await fetch(`${dataBasePath}/data/normalized/dashboard-${dateStamp}.json`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`data not found for ${selectedDate}`);
        }
        const nextData = (await response.json()) as DashboardData;
        if (cancelled) {
          return;
        }
        setData(nextData);
      } catch (error: unknown) {
        if (cancelled) {
          return;
        }
        setDateError(error instanceof Error ? error.message : "対象日のデータを読み込めませんでした");
        setSelectedDate(previousDate);
      } finally {
        if (!cancelled) {
          setIsDateLoading(false);
        }
      }
    };

    void fetchByDate();
    return () => {
      cancelled = true;
    };
  }, [data.meta.targetDate, selectedDate, selectedDateIsAvailable]);

  return {
    data,
    filteredIntertieSeries,
    fetchedAtLabel,
    selectedDate,
    setSelectedDate,
    isDateLoading,
    dateError,
    setDateError,
    selectableDates,
    availableDateSet,
    earliestAvailableDate,
    latestAvailableDate,
  };
}
