/**
 * UI-level types for the Comparisons feature.
 *
 * These are separate from the domain ComparisonResult in types/weather.ts so
 * that the selector state can be richer without coupling the domain model to
 * UI concerns.
 */
import type { ClimateDateString, ComparisonMode, MeteorologicalSeason } from '@/types/weather'

// ── Selector state ────────────────────────────────────────────────────────────

export interface DateVsDateSelector {
  mode: 'date-vs-date'
  leftDate: ClimateDateString | ''
  rightDate: ClimateDateString | ''
}

export interface MonthVsMonthSelector {
  mode: 'month-vs-month'
  leftYear: number | null
  leftMonth: number | null
  rightYear: number | null
  rightMonth: number | null
}

export interface YearVsYearSelector {
  mode: 'year-vs-year'
  leftYear: number | null
  rightYear: number | null
}

export interface SeasonVsSeasonSelector {
  mode: 'season-vs-season'
  leftSeason: MeteorologicalSeason | null
  /** Meteorological season year (winter 2024 = Dec 2023 + Jan–Feb 2024) */
  leftSeasonYear: number | null
  rightSeason: MeteorologicalSeason | null
  rightSeasonYear: number | null
}

export interface SamePeriodSelector {
  mode: 'same-period'
  /** Month-day part of start, e.g. "06-01" */
  startMD: string
  /** Month-day part of end, e.g. "08-31" */
  endMD: string
  /** Selected comparison years */
  years: readonly number[]
}

export interface CustomPeriodSelector {
  mode: 'custom'
  leftStart: ClimateDateString | ''
  leftEnd: ClimateDateString | ''
  rightStart: ClimateDateString | ''
  rightEnd: ClimateDateString | ''
}

export type ComparisonSelector =
  | DateVsDateSelector
  | MonthVsMonthSelector
  | YearVsYearSelector
  | SeasonVsSeasonSelector
  | SamePeriodSelector
  | CustomPeriodSelector

// ── Resolved periods ──────────────────────────────────────────────────────────

export interface ResolvedPeriod {
  label: string
  startDate: ClimateDateString
  endDate: ClimateDateString
  /** Meteorological season, if applicable */
  season: MeteorologicalSeason | null
}

/** For same-period mode: one resolved period per year */
export interface SamePeriodYearEntry {
  year: number
  label: string
  startDate: ClimateDateString
  endDate: ClimateDateString
}

/** Validated two-period selection ready for calculation */
export interface TwoPeriodSelection {
  mode: ComparisonMode
  left: ResolvedPeriod
  right: ResolvedPeriod
}

/** Validated same-period selection ready for calculation */
export interface SamePeriodSelection {
  mode: 'same-period'
  startMD: string
  endMD: string
  years: readonly SamePeriodYearEntry[]
}

export type ResolvedSelection = TwoPeriodSelection | SamePeriodSelection

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationOk {
  valid: true
  selection: ResolvedSelection
}

export interface ValidationError {
  valid: false
  message: string
}

export type ValidationResult = ValidationOk | ValidationError

// ── URL param keys ────────────────────────────────────────────────────────────

export const COMPARISON_URL_PARAMS = {
  mode: 'cm',
  leftDate: 'ld',
  rightDate: 'rd',
  leftYear: 'ly',
  leftMonth: 'lm',
  rightYear: 'ry',
  rightMonth: 'rm',
  leftSeason: 'ls',
  leftSeasonYear: 'lsy',
  rightSeason: 'rs',
  rightSeasonYear: 'rsy',
  leftStart: 'lst',
  leftEnd: 'le',
  rightStart: 'rst',
  rightEnd: 're',
  startMD: 'smd',
  endMD: 'emd',
  years: 'yr',
} as const
