export type GenerationRow = {
  area: string;
  plantCode: string;
  plantName: string;
  unitName: string;
  sourceType: string;
  targetDate: string;
  values: number[];
  dailyKwh: number;
  updatedAt: string;
};

export type FlowRow = {
  area: string;
  voltageKv: string;
  lineName: string;
  positiveDirection: string;
  targetDate: string;
  values: number[];
};

export type AreaTotal = {
  area: string;
  totalKwh: number;
};

export type SourceTotal = {
  source: string;
  totalKwh: number;
};

export type HourlyPoint = {
  time: string;
  value: number;
};

export type HourlyAreaPoint = {
  time: string;
  values: Record<string, number>;
};

export type HourlySourcePoint = {
  time: string;
  values: Record<string, number>;
};

export type TopUnit = {
  area: string;
  plantName: string;
  unitName: string;
  sourceType: string;
  maxOutputManKw: number;
  dailyKwh: number;
};

/** Per-unit time-series entry for generator status charts */
export type UnitSeries = {
  area: string;
  plantName: string;
  unitName: string;
  sourceType: string;
  dailyKwh: number;
  /** 48-slot (30-min interval) output time-series (kWh per slot) */
  values: number[];
};

export type PlantSummary = {
  area: string;
  plantName: string;
  sourceType: string;
  dailyKwh: number;
  maxOutputManKw: number;
  /** 48-slot (30-min interval) output time-series (kWh per slot) */
  values?: number[];
};

export type AreaFlowSummary = {
  area: string;
  lineCount: number;
  peakAbsMw: number;
  avgAbsMw: number;
};

export type LineSeries = {
  area: string;
  voltageKv: string;
  lineName: string;
  positiveDirection: string;
  peakAbsMw: number;
  avgMw: number;
  values: number[];
};

export type IntertieSeries = {
  intertieName: string;
  sourceArea: string;
  targetArea: string;
  peakAbsMw: number;
  avgMw: number;
  avgAbsMw: number;
  values: number[];
};

export type InterAreaFlow = {
  sourceArea: string;
  targetArea: string;
  avgMw: number;
  avgAbsMw: number;
  peakAbsMw: number;
  intertieCount: number;
  intertieNames: string[];
};

export type AreaBalance = {
  area: string;
  dailyKwh: number;
  peakAbsMw: number;
  lineCount: number;
  stressIndex: number;
};

export type AreaReserveSeries = {
  area: string;
  demandMw: number[];
  supplyMw: number[];
  reserveMw: number[];
  reserveRate: number[];
  usageRate: number[];
  blockDemandMw: number[];
  blockSupplyMw: number[];
  blockReserveMw: number[];
  blockReserveRate: number[];
  blockUsageRate: number[];
};

export type JepxSpotPrice = {
  /** システムプライス（円/kWh） - 48コマ（30分単位） */
  systemPrices: number[];
  /** エリアプライス（円/kWh） - エリア名→48コマ */
  areaPrices: Record<string, number[]>;
  /** 約定量（MWh） - 48コマ */
  volumes: number[];
  /** 売り入札量（MWh） - 48コマ */
  sellVolumes?: number[];
  /** 買い入札量（MWh） - 48コマ */
  buyVolumes?: number[];
};

export type DashboardData = {
  meta: {
    targetDate: string;
    fetchedAt: string;
    generationRows: number;
    flowRows: number;
    slotCount: number;
    slotLabels: {
      generation: string[];
      flow: string[];
    };
    sources: {
      generationCsv: string;
      flowCsv: string;
      intertieCsv?: string;
      reserveJson?: string;
    };
  };
  generation: {
    areaTotals: AreaTotal[];
    sourceTotals: SourceTotal[];
    hourlyBySource: HourlySourcePoint[];
    hourlyBySourceByArea?: Record<string, HourlySourcePoint[]>;
    hourlyTotalByArea: HourlyAreaPoint[];
    topUnits: TopUnit[];
    plantSummaries?: PlantSummary[];
    /** All units with 48-slot time-series for generator status charts */
    unitSeries?: UnitSeries[];
  };
  reserves?: {
    areaSeries: AreaReserveSeries[];
  };
  flows: {
    areaSummaries: AreaFlowSummary[];
    hourlyAbsByArea: HourlyAreaPoint[];
    hourlyAbsStats: Array<{
      time: string;
      avgAbsMw: number;
      p95AbsMw: number;
    }>;
    lineSeries: LineSeries[];
    intertieSeries?: IntertieSeries[];
    interAreaFlows?: InterAreaFlow[];
  };
  insights: {
    areaBalance: AreaBalance[];
  };
  jepx?: {
    spot: JepxSpotPrice;
  };
};
