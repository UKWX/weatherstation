import type {
  ClimateDateString,
  ClimateDay,
  MonthlySummary,
  AnnualSummary,
} from '@/types/weather'

// ── Metric selectors ──────────────────────────────────────────────────────────

export type DailyMetric =
  | 'highest-max'
  | 'lowest-max'
  | 'highest-min'
  | 'lowest-min'
  | 'highest-range'
  | 'lowest-range'
  | 'wettest'

export type MonthlyMetric =
  | 'mean-max'
  | 'mean-min'
  | 'mean-temp'
  | 'mean-diurnal-range'
  | 'rainfall'

export type AnnualMetric =
  | 'mean-max'
  | 'mean-min'
  | 'mean-temp'
  | 'mean-diurnal-range'
  | 'rainfall'

export type ProgressionMetric =
  | 'highest-max'
  | 'lowest-min'
  | 'highest-min'
  | 'lowest-max'
  | 'highest-range'
  | 'lowest-range'
  | 'wettest'

// ── Daily filters ─────────────────────────────────────────────────────────────

export type SeasonFilter = 'all' | 'winter' | 'spring' | 'summer' | 'autumn'

export interface DailyFilters {
  /** 1–12 or null for all months */
  month: number | null
  season: SeasonFilter
  yearFrom: number | null
  yearTo: number | null
}

export interface MonthlyFilters {
  /** 1–12 or null for all months */
  monthFilter: number | null
  yearFrom: number | null
  yearTo: number | null
  /** When true, exclude months where coverage is incomplete */
  requireComplete: boolean
}

// ── Output shapes ─────────────────────────────────────────────────────────────

export interface DailyRankEntry {
  /** Dense rank (1-based; ties share the same rank) */
  rank: number
  date: ClimateDateString
  value: number
  provisional: boolean
}

export interface MonthlyRankEntry {
  rank: number
  year: number
  month: number
  value: number
  provisional: boolean
  complete: boolean
}

export interface AnnualRankEntry {
  rank: number
  year: number
  value: number
  provisional: boolean
  complete: boolean
  /** Coverage percentage 0–100 for temperature; rainfall complete flag */
  coverageNote: string
}

export interface CalendarDateRecord {
  month: number
  day: number
  /** Number of years that have a record for this date */
  sampleSize: number
  highestMax: { value: number | null; years: number[] }
  lowestMax: { value: number | null; years: number[] }
  highestMin: { value: number | null; years: number[] }
  lowestMin: { value: number | null; years: number[] }
  wettestYear: { value: number | null; years: number[] }
}

export interface OverallRecord {
  label: string
  value: number | null
  unit: string
  holders: Array<{ date: ClimateDateString; label: string }>
  period?: string
  note?: string
}

export interface ThresholdYearRow {
  year: number
  provisional: boolean
  atOrAbove20C: number
  atOrAbove25C: number
  atOrAbove30C: number
  frostDays: number
  rainDays: number
  heavyRainDays: number
}

export interface ThresholdSummary {
  heavyRainThresholdMm: number
  allTimeAtOrAbove20C: number
  allTimeAtOrAbove25C: number
  allTimeAtOrAbove30C: number
  allTimeFrostDays: number
  allTimeRainDays: number
  allTimeHeavyRainDays: number
  byYear: ThresholdYearRow[]
}

export interface SpellRecord {
  length: number
  startDate: ClimateDateString | null
  endDate: ClimateDateString | null
}

export interface SpellSummary {
  longestDry: SpellRecord
  longestWet: SpellRecord
  longestWarm: SpellRecord
  longestCold: SpellRecord
  warmThresholdC: number
  coldThresholdC: number
  /** Note explaining how missing data breaks streaks */
  missingDataRule: string
}

export interface RecordProgressionEntry {
  date: ClimateDateString
  value: number
  isNewRecord: boolean
  isTie: boolean
  /** Previous record value before this date, null if this is the first */
  previousValue: number | null
}

export interface RecordProgressionSummary {
  metric: ProgressionMetric
  entries: RecordProgressionEntry[]
  /** How many total record events (new records + ties) exist */
  eventCount: number
  /** Years that currently hold a share of the record */
  currentRecordYears: number[]
  currentValue: number | null
}

export interface YearRecordCount {
  year: number
  count: number
  provisional: boolean
}

// ── Indexed analysis layer ────────────────────────────────────────────────────

export interface RecordsIndex {
  /** All loaded ClimateDay records merged and date-sorted */
  allDays: ClimateDay[]
  /** Years whose data has been loaded */
  loadedYears: number[]

  // Pre-sorted arrays for O(n-filter) daily lookups
  daysByMaxTempDesc: ClimateDay[]
  daysByMaxTempAsc: ClimateDay[]
  daysByMinTempDesc: ClimateDay[]
  daysByMinTempAsc: ClimateDay[]
  /** Only days where rainfallMm is non-null, sorted descending */
  daysByRainfallDesc: ClimateDay[]

  /** Monthly summaries keyed "YYYY-MM" */
  monthlySummaries: Map<string, MonthlySummary>

  /** Annual summaries keyed by year */
  annualSummaries: Map<number, AnnualSummary>

  /** All ClimateDay records grouped by "MM-DD" for calendar-date lookups */
  daysByCalendarDate: Map<string, ClimateDay[]>
}
