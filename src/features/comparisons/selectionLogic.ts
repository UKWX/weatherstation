/**
 * Pure helpers for resolving and validating comparison selections, plus
 * URL parameter serialisation/deserialisation.
 *
 * No side effects; no fetching.
 */
import {
  daysInMonth,
  getMeteorologicalSeasonYear,
  parseIsoClimateDate,
  toClimateDateString,
} from '@/lib/climate'
import type { ClimateDateString, MeteorologicalSeason } from '@/types/weather'
import type {
  ComparisonSelector,
  CustomPeriodSelector,
  DateVsDateSelector,
  MonthVsMonthSelector,
  ResolvedPeriod,
  ResolvedSelection,
  SamePeriodSelector,
  SamePeriodYearEntry,
  SeasonVsSeasonSelector,
  ValidationError,
  ValidationOk,
  ValidationResult,
  YearVsYearSelector,
} from './types'
import { COMPARISON_URL_PARAMS } from './types'

const MS_PER_DAY = 86_400_000

// ── Date-range resolvers ──────────────────────────────────────────────────────

/** Returns the inclusive start/end dates for a calendar month. */
export function getMonthDateRange(
  year: number,
  month: number,
): { startDate: ClimateDateString; endDate: ClimateDateString } {
  return {
    startDate: toClimateDateString(year, month, 1),
    endDate: toClimateDateString(year, month, daysInMonth(year, month)),
  }
}

/** Returns the inclusive start/end dates for a calendar year. */
export function getYearDateRange(
  year: number,
): { startDate: ClimateDateString; endDate: ClimateDateString } {
  return {
    startDate: toClimateDateString(year, 1, 1),
    endDate: toClimateDateString(year, 12, 31),
  }
}

/**
 * Returns the inclusive start/end dates for a meteorological season.
 *
 * The `seasonYear` is the meteorological year of the season:
 *   - Spring seasonYear 2024 → Mar 2024 – May 2024
 *   - Summer seasonYear 2024 → Jun 2024 – Aug 2024
 *   - Autumn seasonYear 2024 → Sep 2024 – Nov 2024
 *   - Winter seasonYear 2024 → Dec 2023 – Feb 2024  (crosses calendar year)
 */
export function getSeasonDateRange(
  season: MeteorologicalSeason,
  seasonYear: number,
): { startDate: ClimateDateString; endDate: ClimateDateString } {
  switch (season) {
    case 'winter':
      return {
        startDate: toClimateDateString(seasonYear - 1, 12, 1),
        endDate: toClimateDateString(seasonYear, 2, daysInMonth(seasonYear, 2)),
      }
    case 'spring':
      return {
        startDate: toClimateDateString(seasonYear, 3, 1),
        endDate: toClimateDateString(seasonYear, 5, 31),
      }
    case 'summer':
      return {
        startDate: toClimateDateString(seasonYear, 6, 1),
        endDate: toClimateDateString(seasonYear, 8, 31),
      }
    case 'autumn':
      return {
        startDate: toClimateDateString(seasonYear, 9, 1),
        endDate: toClimateDateString(seasonYear, 11, 30),
      }
  }
}

/**
 * Returns the number of calendar days in a period (inclusive).
 * Returns 0 if start > end.
 */
export function periodDurationDays(
  startDate: ClimateDateString,
  endDate: ClimateDateString,
): number {
  const start = utcDayMs(startDate)
  const end = utcDayMs(endDate)
  if (end < start) return 0
  return Math.round((end - start) / MS_PER_DAY) + 1
}

/** Returns the years covered by a date range, inclusive. */
export function yearsInRange(
  startDate: ClimateDateString,
  endDate: ClimateDateString,
): number[] {
  const startYear = parseIsoClimateDate(startDate).year
  const endYear = parseIsoClimateDate(endDate).year
  const result: number[] = []
  for (let y = startYear; y <= endYear; y++) result.push(y)
  return result
}

/**
 * Returns the set of calendar years that must be fetched for a two-period
 * selection.  De-duplicated.
 */
export function yearsRequiredForTwoPeriod(
  left: ResolvedPeriod,
  right: ResolvedPeriod,
): readonly number[] {
  return [
    ...new Set([
      ...yearsInRange(left.startDate, left.endDate),
      ...yearsInRange(right.startDate, right.endDate),
    ]),
  ].sort((a, b) => a - b)
}

/**
 * Resolves a same-period MD range for a specific calendar year.
 *
 * Leap-day handling: if endMD is "02-29" and the year is not a leap year,
 * the end date is clamped to "02-28".
 */
export function resolveSamePeriodForYear(
  startMD: string,
  endMD: string,
  year: number,
): SamePeriodYearEntry {
  const startDate = toClimateDateString(
    year,
    Number(startMD.slice(0, 2)),
    Number(startMD.slice(3, 5)),
  )

  let endDay = Number(endMD.slice(3, 5))
  const endMonth = Number(endMD.slice(0, 2))
  const maxDay = daysInMonth(year, endMonth)
  if (endDay > maxDay) endDay = maxDay

  const endDate = toClimateDateString(year, endMonth, endDay)

  const label =
    startMD === endMD
      ? `${startDate} (${year})`
      : `${startMD} – ${endMD} ${year}`

  return { year, label, startDate, endDate }
}

// ── Season year label ─────────────────────────────────────────────────────────

export function seasonLabel(
  season: MeteorologicalSeason,
  seasonYear: number,
): string {
  const name = season.charAt(0).toUpperCase() + season.slice(1)
  if (season === 'winter') {
    return `${name} ${seasonYear - 1}/${String(seasonYear).slice(-2)}`
  }
  return `${name} ${seasonYear}`
}

// ── Validation ────────────────────────────────────────────────────────────────

function ok(selection: ResolvedSelection): ValidationOk {
  return { valid: true, selection }
}

function err(message: string): ValidationError {
  return { valid: false, message }
}

export function validateSelector(selector: ComparisonSelector): ValidationResult {
  switch (selector.mode) {
    case 'date-vs-date':
      return validateDateVsDate(selector)
    case 'month-vs-month':
      return validateMonthVsMonth(selector)
    case 'year-vs-year':
      return validateYearVsYear(selector)
    case 'season-vs-season':
      return validateSeasonVsSeason(selector)
    case 'same-period':
      return validateSamePeriod(selector)
    case 'custom':
      return validateCustom(selector)
  }
}

function validateDateVsDate(sel: DateVsDateSelector): ValidationResult {
  if (!sel.leftDate || !sel.rightDate) return err('Select both dates.')
  const left = parseDateOrNull(sel.leftDate)
  const right = parseDateOrNull(sel.rightDate)
  if (!left) return err('Left date is invalid.')
  if (!right) return err('Right date is invalid.')
  return ok({
    mode: 'date-vs-date',
    left: { label: sel.leftDate, startDate: sel.leftDate, endDate: sel.leftDate, season: null },
    right: { label: sel.rightDate, startDate: sel.rightDate, endDate: sel.rightDate, season: null },
  })
}

function validateMonthVsMonth(sel: MonthVsMonthSelector): ValidationResult {
  if (sel.leftYear == null || sel.leftMonth == null)
    return err('Select a left month.')
  if (sel.rightYear == null || sel.rightMonth == null)
    return err('Select a right month.')
  const l = getMonthDateRange(sel.leftYear, sel.leftMonth)
  const r = getMonthDateRange(sel.rightYear, sel.rightMonth)
  const MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  return ok({
    mode: 'month-vs-month',
    left: {
      label: `${MONTH_NAMES[sel.leftMonth - 1]} ${sel.leftYear}`,
      ...l,
      season: null,
    },
    right: {
      label: `${MONTH_NAMES[sel.rightMonth - 1]} ${sel.rightYear}`,
      ...r,
      season: null,
    },
  })
}

function validateYearVsYear(sel: YearVsYearSelector): ValidationResult {
  if (sel.leftYear == null) return err('Select a left year.')
  if (sel.rightYear == null) return err('Select a right year.')
  const l = getYearDateRange(sel.leftYear)
  const r = getYearDateRange(sel.rightYear)
  return ok({
    mode: 'year-vs-year',
    left: { label: String(sel.leftYear), ...l, season: null },
    right: { label: String(sel.rightYear), ...r, season: null },
  })
}

function validateSeasonVsSeason(sel: SeasonVsSeasonSelector): ValidationResult {
  if (!sel.leftSeason || sel.leftSeasonYear == null) return err('Select a left season.')
  if (!sel.rightSeason || sel.rightSeasonYear == null) return err('Select a right season.')
  const l = getSeasonDateRange(sel.leftSeason, sel.leftSeasonYear)
  const r = getSeasonDateRange(sel.rightSeason, sel.rightSeasonYear)
  return ok({
    mode: 'season-vs-season',
    left: {
      label: seasonLabel(sel.leftSeason, sel.leftSeasonYear),
      ...l,
      season: sel.leftSeason,
    },
    right: {
      label: seasonLabel(sel.rightSeason, sel.rightSeasonYear),
      ...r,
      season: sel.rightSeason,
    },
  })
}

function validateSamePeriod(sel: SamePeriodSelector): ValidationResult {
  if (!sel.startMD || !sel.endMD) return err('Select a period range.')
  if (!MD_PATTERN.test(sel.startMD) || !MD_PATTERN.test(sel.endMD))
    return err('Period range format must be MM-DD.')
  if (sel.years.length < 2)
    return err('Select at least two years to compare.')

  const years = sel.years
    .map((y) => resolveSamePeriodForYear(sel.startMD, sel.endMD, y))
    .sort((a, b) => a.year - b.year)

  return ok({
    mode: 'same-period',
    startMD: sel.startMD,
    endMD: sel.endMD,
    years,
  })
}

function validateCustom(sel: CustomPeriodSelector): ValidationResult {
  if (!sel.leftStart || !sel.leftEnd) return err('Select a left period.')
  if (!sel.rightStart || !sel.rightEnd) return err('Select a right period.')

  const leftStart = parseDateOrNull(sel.leftStart)
  const leftEnd = parseDateOrNull(sel.leftEnd)
  const rightStart = parseDateOrNull(sel.rightStart)
  const rightEnd = parseDateOrNull(sel.rightEnd)

  if (!leftStart || !leftEnd) return err('Left period dates are invalid.')
  if (!rightStart || !rightEnd) return err('Right period dates are invalid.')

  if (sel.leftStart > sel.leftEnd)
    return err('Left period start must be on or before its end.')
  if (sel.rightStart > sel.rightEnd)
    return err('Right period start must be on or before its end.')

  const leftDays = periodDurationDays(sel.leftStart, sel.leftEnd)
  const rightDays = periodDurationDays(sel.rightStart, sel.rightEnd)

  if (leftDays !== rightDays) {
    return err(
      `Custom periods must have equal duration. ` +
        `Left is ${leftDays} day${leftDays === 1 ? '' : 's'}, ` +
        `right is ${rightDays} day${rightDays === 1 ? '' : 's'}.`,
    )
  }

  return ok({
    mode: 'custom',
    left: {
      label: `${sel.leftStart} – ${sel.leftEnd}`,
      startDate: sel.leftStart,
      endDate: sel.leftEnd,
      season: null,
    },
    right: {
      label: `${sel.rightStart} – ${sel.rightEnd}`,
      startDate: sel.rightStart,
      endDate: sel.rightEnd,
      season: null,
    },
  })
}

// ── URL param serialisation ───────────────────────────────────────────────────

const P = COMPARISON_URL_PARAMS

export function selectorToUrlParams(
  selector: ComparisonSelector,
): Record<string, string> {
  const p: Record<string, string> = { [P.mode]: selector.mode }

  switch (selector.mode) {
    case 'date-vs-date':
      if (selector.leftDate) p[P.leftDate] = selector.leftDate
      if (selector.rightDate) p[P.rightDate] = selector.rightDate
      break
    case 'month-vs-month':
      if (selector.leftYear != null) p[P.leftYear] = String(selector.leftYear)
      if (selector.leftMonth != null) p[P.leftMonth] = String(selector.leftMonth)
      if (selector.rightYear != null) p[P.rightYear] = String(selector.rightYear)
      if (selector.rightMonth != null) p[P.rightMonth] = String(selector.rightMonth)
      break
    case 'year-vs-year':
      if (selector.leftYear != null) p[P.leftYear] = String(selector.leftYear)
      if (selector.rightYear != null) p[P.rightYear] = String(selector.rightYear)
      break
    case 'season-vs-season':
      if (selector.leftSeason) p[P.leftSeason] = selector.leftSeason
      if (selector.leftSeasonYear != null) p[P.leftSeasonYear] = String(selector.leftSeasonYear)
      if (selector.rightSeason) p[P.rightSeason] = selector.rightSeason
      if (selector.rightSeasonYear != null) p[P.rightSeasonYear] = String(selector.rightSeasonYear)
      break
    case 'same-period':
      if (selector.startMD) p[P.startMD] = selector.startMD
      if (selector.endMD) p[P.endMD] = selector.endMD
      if (selector.years.length > 0) p[P.years] = selector.years.join(',')
      break
    case 'custom':
      if (selector.leftStart) p[P.leftStart] = selector.leftStart
      if (selector.leftEnd) p[P.leftEnd] = selector.leftEnd
      if (selector.rightStart) p[P.rightStart] = selector.rightStart
      if (selector.rightEnd) p[P.rightEnd] = selector.rightEnd
      break
  }

  return p
}

export function urlParamsToSelector(
  params: URLSearchParams,
): ComparisonSelector | null {
  const mode = params.get(P.mode)

  switch (mode) {
    case 'date-vs-date':
      return {
        mode: 'date-vs-date',
        leftDate: (params.get(P.leftDate) ?? '') as ClimateDateString | '',
        rightDate: (params.get(P.rightDate) ?? '') as ClimateDateString | '',
      }
    case 'month-vs-month':
      return {
        mode: 'month-vs-month',
        leftYear: intOrNull(params.get(P.leftYear)),
        leftMonth: intOrNull(params.get(P.leftMonth)),
        rightYear: intOrNull(params.get(P.rightYear)),
        rightMonth: intOrNull(params.get(P.rightMonth)),
      }
    case 'year-vs-year':
      return {
        mode: 'year-vs-year',
        leftYear: intOrNull(params.get(P.leftYear)),
        rightYear: intOrNull(params.get(P.rightYear)),
      }
    case 'season-vs-season':
      return {
        mode: 'season-vs-season',
        leftSeason: (params.get(P.leftSeason) as MeteorologicalSeason | null) ?? null,
        leftSeasonYear: intOrNull(params.get(P.leftSeasonYear)),
        rightSeason: (params.get(P.rightSeason) as MeteorologicalSeason | null) ?? null,
        rightSeasonYear: intOrNull(params.get(P.rightSeasonYear)),
      }
    case 'same-period': {
      const yearsRaw = params.get(P.years) ?? ''
      const years = yearsRaw
        .split(',')
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0)
      return {
        mode: 'same-period',
        startMD: params.get(P.startMD) ?? '',
        endMD: params.get(P.endMD) ?? '',
        years,
      }
    }
    case 'custom':
      return {
        mode: 'custom',
        leftStart: (params.get(P.leftStart) ?? '') as ClimateDateString | '',
        leftEnd: (params.get(P.leftEnd) ?? '') as ClimateDateString | '',
        rightStart: (params.get(P.rightStart) ?? '') as ClimateDateString | '',
        rightEnd: (params.get(P.rightEnd) ?? '') as ClimateDateString | '',
      }
    default:
      return null
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

const MD_PATTERN = /^\d{2}-\d{2}$/

function parseDateOrNull(value: string): ClimateDateString | null {
  try {
    parseIsoClimateDate(value)
    return value as ClimateDateString
  } catch {
    return null
  }
}

function utcDayMs(date: ClimateDateString): number {
  const { year, month, day } = parseIsoClimateDate(date)
  return Date.UTC(year, month - 1, day)
}

function intOrNull(value: string | null): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isInteger(n) ? n : null
}

// Re-export getMeteorologicalSeasonYear so page components can use it without
// importing from the lib directly.
export { getMeteorologicalSeasonYear }
