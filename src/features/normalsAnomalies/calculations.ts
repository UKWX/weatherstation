import {
  calculateRainfallDifferenceFromNormal,
  calculateRainfallPercentageOfNormal,
  calculateSafeAverage,
  calculateTemperatureAnomaly,
} from '@/lib/climate'
import { RAINFALL_START_DATE } from '@/config/weather'
import type {
  ClimateDateString,
  ClimateDay,
  DailyNormal,
  MonthlySummary,
  MonthlyNormal,
} from '@/types/weather'

// ── Daily temperature normals ─────────────────────────────────────────────────

export interface DailyNormalsRow {
  /** MM-DD key (01-01 … 12-31) */
  readonly dateKey: string
  readonly month: number
  readonly day: number
  readonly normalMaxC: number | null
  readonly normalMinC: number | null
  /** Observed max for the selected year on this calendar day */
  readonly obsMaxC: number | null
  /** Observed min for the selected year on this calendar day */
  readonly obsMinC: number | null
  /** Anomaly from normal max (null when either value is missing) */
  readonly maxAnomalyC: number | null
  /** Anomaly from normal min (null when either value is missing) */
  readonly minAnomalyC: number | null
}

/**
 * Pairs each daily normal with the corresponding observed day from the
 * selected year.  Does not fabricate any values.
 */
export function buildDailyNormalsRows(
  dailyNormals: readonly DailyNormal[],
  yearRecords: readonly ClimateDay[],
  year: number,
): readonly DailyNormalsRow[] {
  const obsMap = new Map<string, ClimateDay>(
    yearRecords.map((r) => {
      const parts = r.date.split('-')
      const mm = parts[1] ?? ''
      const dd = parts[2] ?? ''
      return [`${mm}-${dd}`, r]
    }),
  )

  return dailyNormals.map((n) => {
    const obs = obsMap.get(n.dateKey) ?? null
    const isLeap = n.month === 2 && n.day === 29
    // Feb-29 observed only exists in a leap year
    const hasObs = obs != null && (!isLeap || isLeapYear(year))
    const obsMaxC = hasObs ? (obs?.maxTempC ?? null) : null
    const obsMinC = hasObs ? (obs?.minTempC ?? null) : null
    return {
      dateKey: n.dateKey,
      month: n.month,
      day: n.day,
      normalMaxC: n.normalMaxTempC,
      normalMinC: n.normalMinTempC,
      obsMaxC,
      obsMinC,
      maxAnomalyC: calculateTemperatureAnomaly(obsMaxC, n.normalMaxTempC),
      minAnomalyC: calculateTemperatureAnomaly(obsMinC, n.normalMinTempC),
    }
  })
}

function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0)
}

// ── Monthly temperature anomalies ─────────────────────────────────────────────

export interface MonthlyTempAnomalyRow {
  readonly month: number
  readonly monthName: string
  readonly meanMaxAnomalyC: number | null
  readonly meanMinAnomalyC: number | null
  readonly meanTempAnomalyC: number | null
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

export const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/**
 * Derives per-month temperature anomaly rows from already-computed
 * MonthlySummary objects (anomalies are pre-filled by buildMonthlySummary).
 */
export function buildMonthlyTempAnomalies(
  summaries: readonly MonthlySummary[],
): readonly MonthlyTempAnomalyRow[] {
  return MONTH_NAMES.map((name, idx) => {
    const m = idx + 1
    const s = summaries.find((s) => s.month === m) ?? null
    return {
      month: m,
      monthName: name,
      meanMaxAnomalyC: s?.meanMaxTempAnomalyC ?? null,
      meanMinAnomalyC: s?.meanMinTempAnomalyC ?? null,
      meanTempAnomalyC: s?.meanTempAnomalyC ?? null,
    }
  })
}

// ── Monthly rainfall context ──────────────────────────────────────────────────

export interface MonthlyRainfallRow {
  readonly month: number
  readonly monthName: string
  /** Observed total (null when unavailable or no valid days) */
  readonly observedMm: number | null
  /** 1991–2020 monthly normal (null when no normal for this month) */
  readonly normalMm: number | null
  /** Difference observed − normal (null when either missing) */
  readonly differenceMm: number | null
  /** Percentage of normal (null when either missing or normal is zero) */
  readonly percentageOfNormal: number | null
  /** True when the period is not complete (provisional, incomplete, or partial month) */
  readonly incomplete: boolean
  /** Number of valid (observed) rainfall days in the month */
  readonly validDays: number
  /** Expected days in the month */
  readonly expectedDays: number
  /** True when rainfall records are not available at all for this month */
  readonly rainfallUnavailable: boolean
}

/**
 * Builds monthly rainfall context rows.
 * Only uses monthly normals — does NOT fabricate daily rainfall normals.
 */
export function buildMonthlyRainfallRows(
  year: number,
  summaries: readonly MonthlySummary[],
  monthlyNormals: readonly MonthlyNormal[],
): readonly MonthlyRainfallRow[] {
  return MONTH_NAMES.map((name, idx) => {
    const m = idx + 1
    const s = summaries.find((s) => s.month === m) ?? null
    const normal = monthlyNormals.find((n) => n.month === m) ?? null
    const rainfallUnavailable = isRainfallUnavailableForMonth(year, m)
    const observedMm = rainfallUnavailable ? null : (s?.rainfallTotalMm ?? null)
    const normalMm = normal?.rainfallMm ?? null
    const coverage = s?.coverage ?? null
    const validDays = coverage?.rainfall?.valid ?? 0
    const expectedDays = coverage?.expectedDays ?? daysInMonthOf(year, m)
    const incomplete = rainfallUnavailable
      ? false
      : (s?.coverage?.provisional ?? false) ||
        (s?.coverage?.rainfall?.complete === false)

    return {
      month: m,
      monthName: name,
      observedMm,
      normalMm,
      differenceMm: calculateRainfallDifferenceFromNormal(observedMm, normalMm),
      percentageOfNormal: calculateRainfallPercentageOfNormal(observedMm, normalMm),
      incomplete,
      validDays,
      expectedDays,
      rainfallUnavailable,
    }
  })
}

function isRainfallUnavailableForMonth(year: number, month: number): boolean {
  const parts = RAINFALL_START_DATE.split('-').map(Number)
  const startYear = parts[0] ?? 0
  const startMonth = parts[1] ?? 1
  return year < startYear || (year === startYear && month < startMonth)
}

function daysInMonthOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// ── Year-to-date context ──────────────────────────────────────────────────────

export interface YtdTempContext {
  /** Observed mean max for completed months */
  readonly obsYtdMeanMaxC: number | null
  readonly obsYtdMeanMinC: number | null
  readonly obsYtdMeanTempC: number | null
  /** Expected mean max from monthly normals for completed months */
  readonly normalYtdMeanMaxC: number | null
  readonly normalYtdMeanMinC: number | null
  readonly normalYtdMeanTempC: number | null
  readonly ytdMeanMaxAnomalyC: number | null
  readonly ytdMeanMinAnomalyC: number | null
  readonly ytdMeanTempAnomalyC: number | null
}

export interface YtdRainfallContext {
  /** Observed YTD rainfall total (completed months only) */
  readonly observedMm: number | null
  /**
   * Expected YTD from monthly normals.
   * Clearly labelled as a prorated estimate when months overlap the current date.
   */
  readonly expectedMm: number | null
  readonly differenceMm: number | null
  readonly percentageOfNormal: number | null
  /**
   * If true, expectedMm is derived from monthly normals (not daily normals),
   * and the caller must label this clearly.
   */
  readonly expectedIsProrated: boolean
  /** Number of completed months with observed rainfall in the YTD window */
  readonly completedRainfallMonths: number
}

export interface YtdContext {
  /** ISO year in view */
  readonly year: number
  /**
   * True when the year is still in progress — either current year or the
   * archive data is marked provisional/incomplete.
   */
  readonly provisional: boolean
  /** Last completed month index (1–12), or null if none complete */
  readonly lastCompletedMonth: number | null
  readonly temperature: YtdTempContext
  readonly rainfall: YtdRainfallContext
  /** Number of months with temperature coverage */
  readonly temperatureMonthsCovered: number
}

/**
 * Builds year-to-date context.
 * Uses only completed months (provisional = false, coverage complete) for
 * reliable numbers.  Falls back to prorated monthly normals for rainfall
 * because daily rainfall normals are not available.
 */
export function buildYtdContext(
  year: number,
  summaries: readonly MonthlySummary[],
  monthlyNormals: readonly MonthlyNormal[],
  referenceDate: ClimateDateString | null,
): YtdContext {
  const currentYear = referenceDate
    ? Number(referenceDate.split('-')[0])
    : new Date().getFullYear()
  const isCurrentYear = year === currentYear

  // Completed months: coverage complete or we treat all non-provisional months
  // as complete for prior years
  const completedSummaries = summaries.filter((s) =>
    isCurrentYear
      ? s.coverage.maxTemperature.complete && !s.coverage.provisional
      : !s.coverage.provisional,
  )

  const lastCompletedMonth =
    completedSummaries.length > 0
      ? Math.max(...completedSummaries.map((s) => s.month))
      : null

  const ytdSummaries = lastCompletedMonth == null
    ? []
    : completedSummaries.filter((s) => s.month <= lastCompletedMonth)

  const ytdNormals = lastCompletedMonth == null
    ? []
    : monthlyNormals.filter((n) => n.month <= lastCompletedMonth)

  const obsYtdMeanMaxC = calculateSafeAverage(ytdSummaries.map((s) => s.meanMaxTempC))
  const obsYtdMeanMinC = calculateSafeAverage(ytdSummaries.map((s) => s.meanMinTempC))
  const obsYtdMeanTempC = calculateSafeAverage(ytdSummaries.map((s) => s.meanTempC))
  const normalYtdMeanMaxC = calculateSafeAverage(ytdNormals.map((n) => n.meanMaxTempC))
  const normalYtdMeanMinC = calculateSafeAverage(ytdNormals.map((n) => n.meanMinTempC))
  const normalYtdMeanTempC = calculateSafeAverage(ytdNormals.map((n) => n.meanTempC))

  // Rainfall — only completed months with available rainfall data
  const rainfallSummaries = ytdSummaries.filter(
    (s) => !isRainfallUnavailableForMonth(year, s.month) && s.coverage.rainfall.complete,
  )
  const rainfallNormals = ytdNormals.filter(
    (n) => !isRainfallUnavailableForMonth(year, n.month),
  )

  let observedMm: number | null = null
  let expectedMm: number | null = null

  if (rainfallSummaries.length > 0) {
    let ok = true
    let sum = 0
    for (const s of rainfallSummaries) {
      if (s.rainfallTotalMm == null) { ok = false; break }
      sum += s.rainfallTotalMm
    }
    if (ok) observedMm = sum
  }

  if (rainfallNormals.length > 0) {
    let sum = 0
    let ok = true
    for (const n of rainfallNormals) {
      if (n.rainfallMm == null) { ok = false; break }
      sum += n.rainfallMm
    }
    if (ok) expectedMm = sum
  }

  const provisional =
    isCurrentYear ||
    summaries.some((s) => s.coverage.provisional || !s.coverage.maxTemperature.complete)

  return {
    year,
    provisional,
    lastCompletedMonth,
    temperature: {
      obsYtdMeanMaxC,
      obsYtdMeanMinC,
      obsYtdMeanTempC,
      normalYtdMeanMaxC,
      normalYtdMeanMinC,
      normalYtdMeanTempC,
      ytdMeanMaxAnomalyC: calculateTemperatureAnomaly(obsYtdMeanMaxC, normalYtdMeanMaxC),
      ytdMeanMinAnomalyC: calculateTemperatureAnomaly(obsYtdMeanMinC, normalYtdMeanMinC),
      ytdMeanTempAnomalyC: calculateTemperatureAnomaly(obsYtdMeanTempC, normalYtdMeanTempC),
    },
    rainfall: {
      observedMm,
      expectedMm,
      differenceMm: calculateRainfallDifferenceFromNormal(observedMm, expectedMm),
      percentageOfNormal: calculateRainfallPercentageOfNormal(observedMm, expectedMm),
      expectedIsProrated: true, // always prorated because only monthly normals exist
      completedRainfallMonths: rainfallSummaries.length,
    },
    temperatureMonthsCovered: ytdSummaries.length,
  }
}

// ── Ranking tables ────────────────────────────────────────────────────────────

export type RankingMetric =
  | 'meanMaxAnomaly'
  | 'meanMinAnomaly'
  | 'meanTempAnomaly'
  | 'rainfallPercentage'

export type RankingPeriod = 'annual' | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export interface RankingRow {
  readonly year: number
  readonly month: number | null
  readonly label: string
  readonly value: number
}

/**
 * Builds a ranked list of months from a flat array of MonthlySummary objects
 * (potentially from multiple years).
 *
 * Rules:
 * - Only rows where both observed and normal values exist are included.
 * - For rainfall, zero-normal months are excluded (safe divide).
 * - Sorted warmest/wettest first for positive metrics, or coldest/driest first.
 * - period = 'annual' groups by year and averages; period = 1–12 filters to
 *   that month across all years.
 */
export function buildRankingRows(
  allSummaries: readonly MonthlySummary[],
  metric: RankingMetric,
  period: RankingPeriod,
  direction: 'warmest' | 'coldest' | 'wettest' | 'driest',
): readonly RankingRow[] {
  const getValue = (s: MonthlySummary): number | null => {
    switch (metric) {
      case 'meanMaxAnomaly':
        return s.meanMaxTempAnomalyC
      case 'meanMinAnomaly':
        return s.meanMinTempAnomalyC
      case 'meanTempAnomaly':
        return s.meanTempAnomalyC
      case 'rainfallPercentage':
        return s.rainfallPercentageOfNormal
    }
  }

  const filtered = allSummaries.filter((s) => {
    if (period !== 'annual' && s.month !== period) return false
    const v = getValue(s)
    return v != null && Number.isFinite(v)
  })

  if (period === 'annual') {
    // Group by year, compute average anomaly across months
    const byYear = new Map<number, number[]>()
    for (const s of filtered) {
      const v = getValue(s)
      if (v == null) continue
      const existing = byYear.get(s.year) ?? []
      existing.push(v)
      byYear.set(s.year, existing)
    }
    const yearRows: RankingRow[] = []
    for (const [year, values] of byYear) {
      const avg = calculateSafeAverage(values)
      if (avg == null) continue
      yearRows.push({ year, month: null, label: String(year), value: avg })
    }
    return sortRanking(yearRows, direction)
  }

  const rows: RankingRow[] = filtered.map((s) => ({
    year: s.year,
    month: s.month,
    label: `${MONTH_ABBR[s.month - 1] ?? ''} ${s.year}`,
    value: getValue(s) as number,
  }))

  return sortRanking(rows, direction)
}

function sortRanking(rows: RankingRow[], direction: 'warmest' | 'coldest' | 'wettest' | 'driest'): readonly RankingRow[] {
  const asc = direction === 'coldest' || direction === 'driest'
  return [...rows].sort((a, b) => asc ? a.value - b.value : b.value - a.value)
}
