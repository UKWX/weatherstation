/**
 * Pure calculation functions for the Comparisons feature.
 *
 * All functions accept pre-fetched ClimateDay records and normals; none
 * fetches data or has side effects.
 */
import {
  calculateRainfallDifferenceFromNormal,
  calculateRainfallPercentageOfNormal,
  calculateSafeAverage,
  calculateSafeTotal,
  calculateTemperatureAnomaly,
  calculateThresholdCounts,
  collectTiedValues,
  countValidAndMissingObservations,
  isProvisionalPeriod,
  parseIsoClimateDate,
} from '@/lib/climate'
import { RAINFALL_START_DATE, RAIN_DAY_THRESHOLD_MM } from '@/config/weather'
import type {
  ClimateDateString,
  ClimateDay,
  ComparisonPeriod,
  ComparisonPeriodResult,
  ComparisonResult,
  ComparisonSelection,
  MetricCoverage,
  MonthlyNormal,
  NullableMeasurement,
  ObservationCounts,
  PeriodCoverage,
  PeriodThresholdCounts,
  TiedDatesMetric,
} from '@/types/weather'
import type { ResolvedPeriod, SamePeriodYearEntry } from './types'

// ── Internal helpers ──────────────────────────────────────────────────────────

function isFiniteNum(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v)
}

function toTiedDates(
  result: ReturnType<typeof collectTiedValues<ClimateDay>> | null,
): TiedDatesMetric {
  return {
    value: result?.value ?? null,
    dates: (result?.items ?? []).map((r) => r.date),
  }
}

function countRainDays(records: readonly ClimateDay[]): number {
  return records.filter(
    (r) => isFiniteNum(r.rainfallMm) && r.rainfallMm > RAIN_DAY_THRESHOLD_MM,
  ).length
}

function safeRainfallTotal(records: readonly ClimateDay[]): number | null {
  const valid = records.filter((r) => r.rainfallMm != null)
  if (valid.length === 0) return null
  return calculateSafeTotal(valid.map((r) => r.rainfallMm))
}

function toMetricCoverage(
  counts: ObservationCounts & { availableDays: number },
  provisional: boolean,
): MetricCoverage {
  return {
    ...counts,
    complete:
      !provisional &&
      counts.availableDays > 0 &&
      counts.missing === 0 &&
      counts.unavailable === 0,
  }
}

/**
 * Extract only the records that fall within [startDate, endDate] from a
 * multi-year map.  Records outside the range are silently dropped.
 */
export function extractRecordsForPeriod(
  allRecordsByYear: ReadonlyMap<number, readonly ClimateDay[]>,
  startDate: ClimateDateString,
  endDate: ClimateDateString,
): readonly ClimateDay[] {
  const startParts = parseIsoClimateDate(startDate)
  const endParts = parseIsoClimateDate(endDate)

  const result: ClimateDay[] = []

  for (let y = startParts.year; y <= endParts.year; y++) {
    const yearRecords = allRecordsByYear.get(y) ?? []

    for (const record of yearRecords) {
      if (record.date >= startDate && record.date <= endDate) {
        result.push(record)
      }
    }
  }

  return result
}

/**
 * Compute the period coverage for an arbitrary date range.
 *
 * Uses the same logic as calculatePeriodCoverage in climate.ts but for
 * arbitrary date ranges without needing it exported.
 */
function buildPeriodCoverage(
  startDate: ClimateDateString,
  endDate: ClimateDateString,
  records: readonly ClimateDay[],
): PeriodCoverage {
  const provisional = isProvisionalPeriod(startDate, endDate)

  const maxTemperature = toMetricCoverage(
    countValidAndMissingObservations(records, (r) => r.maxTempC, {
      startDate,
      endDate,
    }),
    provisional,
  )
  const minTemperature = toMetricCoverage(
    countValidAndMissingObservations(records, (r) => r.minTempC, {
      startDate,
      endDate,
    }),
    provisional,
  )
  const meanTemperature = toMetricCoverage(
    countValidAndMissingObservations(records, (r) => r.meanTempC, {
      startDate,
      endDate,
    }),
    provisional,
  )
  const rainfall = toMetricCoverage(
    countValidAndMissingObservations(records, (r) => r.rainfallMm, {
      startDate,
      endDate,
      availabilityStartDate: RAINFALL_START_DATE,
    }),
    provisional,
  )

  return {
    startDate,
    endDate,
    expectedDays: maxTemperature.availableDays + maxTemperature.unavailable,
    provisional,
    maxTemperature,
    minTemperature,
    meanTemperature,
    rainfall,
  }
}

/**
 * Get the monthly normal for a specific month from the normals array,
 * or null if not found.
 */
function getNormalForMonth(
  normals: readonly MonthlyNormal[],
  month: number,
): MonthlyNormal | null {
  return normals.find((n) => n.month === month) ?? null
}

/**
 * Derive a blended normal for an arbitrary date range from monthly normals.
 *
 * For periods spanning multiple months we compute a weighted average for
 * temperature normals and a proportional total for rainfall, based on how many
 * days of each month fall within the period.
 */
function blendedNormalsForPeriod(
  startDate: ClimateDateString,
  endDate: ClimateDateString,
  normals: readonly MonthlyNormal[],
): { normalMeanC: number | null; normalMaxC: number | null; normalMinC: number | null; normalRainfallMm: number | null } {
  const { year: startYear, month: startMonth, day: startDay } = parseIsoClimateDate(startDate)
  const { year: endYear, month: endMonth, day: endDay } = parseIsoClimateDate(endDate)

  const MS = 86_400_000
  const startMs = Date.UTC(startYear, startMonth - 1, startDay)
  const endMs = Date.UTC(endYear, endMonth - 1, endDay)
  const totalDays = Math.round((endMs - startMs) / MS) + 1

  if (totalDays <= 0) {
    return { normalMeanC: null, normalMaxC: null, normalMinC: null, normalRainfallMm: null }
  }

  let weightedMax = 0
  let weightedMin = 0
  let weightedMean = 0
  let totalRainfall = 0
  let maxWeight = 0
  let minWeight = 0
  let meanWeight = 0
  let rainfallWeight = 0

  // Iterate month by month over the period
  let curYear = startYear
  let curMonth = startMonth

  while (
    curYear < endYear ||
    (curYear === endYear && curMonth <= endMonth)
  ) {
    const normal = getNormalForMonth(normals, curMonth)
    const daysInThisMonth = new Date(Date.UTC(curYear, curMonth, 0)).getUTCDate()

    // Days of this month within the period
    const monthStart = Date.UTC(curYear, curMonth - 1, 1)
    const monthEnd = Date.UTC(curYear, curMonth - 1, daysInThisMonth)
    const overlapStart = Math.max(startMs, monthStart)
    const overlapEnd = Math.min(endMs, monthEnd)
    const days = Math.round((overlapEnd - overlapStart) / MS) + 1

    if (days <= 0) {
      curMonth++
      if (curMonth > 12) { curMonth = 1; curYear++ }
      continue
    }

    const weight = days / totalDays

    if (normal != null) {
      if (isFiniteNum(normal.meanMaxTempC)) {
        weightedMax += normal.meanMaxTempC * weight
        maxWeight += weight
      }
      if (isFiniteNum(normal.meanMinTempC)) {
        weightedMin += normal.meanMinTempC * weight
        minWeight += weight
      }
      if (isFiniteNum(normal.meanTempC)) {
        weightedMean += normal.meanTempC * weight
        meanWeight += weight
      }
      if (isFiniteNum(normal.rainfallMm)) {
        // Rainfall normal: apportion monthly total to the days in period
        totalRainfall += normal.rainfallMm * (days / daysInThisMonth)
        rainfallWeight += 1
      }
    }

    curMonth++
    if (curMonth > 12) { curMonth = 1; curYear++ }
  }

  return {
    normalMaxC: maxWeight > 0.01 ? weightedMax / maxWeight : null,
    normalMinC: minWeight > 0.01 ? weightedMin / minWeight : null,
    normalMeanC: meanWeight > 0.01 ? weightedMean / meanWeight : null,
    normalRainfallMm: rainfallWeight > 0 ? totalRainfall : null,
  }
}

/**
 * Build all statistics for a single comparison period.
 *
 * `allRecordsByYear` should contain records for all years needed.
 * `monthlyNormals` is the full set of monthly normals.
 */
export function buildComparisonPeriodResult(
  period: ResolvedPeriod,
  allRecordsByYear: ReadonlyMap<number, readonly ClimateDay[]>,
  monthlyNormals: readonly MonthlyNormal[],
): ComparisonPeriodResult {
  const { startDate, endDate, label, season } = period
  const records = extractRecordsForPeriod(allRecordsByYear, startDate, endDate)

  const highestMax = toTiedDates(collectTiedValues(records, (r) => r.maxTempC, 'max'))
  const lowestMin = toTiedDates(collectTiedValues(records, (r) => r.minTempC, 'min'))
  const wettestDay = toTiedDates(collectTiedValues(records, (r) => r.rainfallMm, 'max'))

  const meanMaxTempC = calculateSafeAverage(records.map((r) => r.maxTempC))
  const meanMinTempC = calculateSafeAverage(records.map((r) => r.minTempC))
  const meanTempC = calculateSafeAverage(records.map((r) => r.meanTempC))
  const rainfallTotalMm = safeRainfallTotal(records)
  const rainDays = countRainDays(records)

  const { normalMeanC, normalRainfallMm } =
    blendedNormalsForPeriod(startDate, endDate, monthlyNormals)

  const temperatureAnomalyC = calculateTemperatureAnomaly(meanTempC, normalMeanC)

  const coverage = buildPeriodCoverage(startDate, endDate, records)

  // Only include rainfall percentage/difference when rainfall is not claimed
  // complete but at least partially available (avoid zero-reference confusion)
  const rainfallPercentageOfNormal =
    coverage.rainfall.availableDays > 0
      ? calculateRainfallPercentageOfNormal(rainfallTotalMm, normalRainfallMm)
      : null

  const rainfallDifferenceFromNormalMm =
    coverage.rainfall.availableDays > 0
      ? calculateRainfallDifferenceFromNormal(rainfallTotalMm, normalRainfallMm)
      : null

  const rawThresholds = calculateThresholdCounts(records, 10.0)
  const thresholds: PeriodThresholdCounts = {
    atOrAbove20C: rawThresholds.atOrAbove20C,
    atOrAbove25C: rawThresholds.atOrAbove25C,
    atOrAbove30C: rawThresholds.atOrAbove30C,
    frostDays: rawThresholds.frostDays,
    rainDays: rawThresholds.rainDays,
    heavyRainDays: rawThresholds.heavyRainDays,
  }

  const selectionPeriod: ComparisonPeriod = {
    label,
    startDate,
    endDate,
    season,
  }

  return {
    selection: selectionPeriod,
    meanMaxTempC,
    meanMinTempC,
    meanTempC,
    highestMax,
    lowestMin,
    rainfallTotalMm,
    rainfallPercentageOfNormal,
    rainfallDifferenceFromNormalMm,
    rainDays,
    wettestDay,
    temperatureAnomalyC,
    thresholds,
    coverage,
  }
}

/**
 * Build the combined comparison result with differences.
 *
 * Percentage difference: left relative to right (right is the "reference").
 * Avoided when reference is zero.
 */
export function buildComparisonResult(
  left: ComparisonPeriodResult,
  right: ComparisonPeriodResult,
): ComparisonResult {
  const meanTempDifferenceC = safeDifference(left.meanTempC, right.meanTempC)

  const rainfallDifferenceMm = safeDifference(
    left.rainfallTotalMm,
    right.rainfallTotalMm,
  )

  // Avoid percentage comparison when reference is zero
  const rainfallPercentageDifference =
    isFiniteNum(left.rainfallTotalMm) &&
    isFiniteNum(right.rainfallTotalMm) &&
    right.rainfallTotalMm > 0
      ? ((left.rainfallTotalMm - right.rainfallTotalMm) /
          right.rainfallTotalMm) *
        100
      : null

  const selection: ComparisonSelection = {
    mode: left.selection.season != null || right.selection.season != null
      ? 'season-vs-season'
      : 'custom',
    left: left.selection,
    right: right.selection,
  }

  return {
    selection,
    left,
    right,
    meanTempDifferenceC,
    rainfallDifferenceMm,
    rainfallPercentageDifference,
  }
}

/**
 * Returns left - right, or null if either is null.
 */
function safeDifference(
  left: NullableMeasurement,
  right: NullableMeasurement,
): NullableMeasurement {
  if (!isFiniteNum(left) || !isFiniteNum(right)) return null
  return left - right
}

/**
 * Build a per-year comparison entry for "same period" mode.
 */
export interface SamePeriodYearResult {
  year: number
  label: string
  startDate: ClimateDateString
  endDate: ClimateDateString
  result: ComparisonPeriodResult
}

export function buildSamePeriodResults(
  entries: readonly SamePeriodYearEntry[],
  allRecordsByYear: ReadonlyMap<number, readonly ClimateDay[]>,
  monthlyNormals: readonly MonthlyNormal[],
): SamePeriodYearResult[] {
  return entries.map((entry) => ({
    year: entry.year,
    label: entry.label,
    startDate: entry.startDate,
    endDate: entry.endDate,
    result: buildComparisonPeriodResult(
      { label: entry.label, startDate: entry.startDate, endDate: entry.endDate, season: null },
      allRecordsByYear,
      monthlyNormals,
    ),
  }))
}

/**
 * Determine a plain-language outcome label when comparing left vs right.
 *
 * Returns null when the comparison is not statistically supportable
 * (coverage too low, or values equal).
 */
export function deriveOutcomeLabel(
  left: ComparisonPeriodResult,
  right: ComparisonPeriodResult,
): {
  temperature: 'warmer' | 'colder' | 'similar' | null
  rainfall: 'wetter' | 'drier' | 'similar' | null
} {
  const tempDiff = left.meanTempC != null && right.meanTempC != null
    ? left.meanTempC - right.meanTempC
    : null

  const temperature: 'warmer' | 'colder' | 'similar' | null =
    tempDiff == null
      ? null
      : tempDiff > 0.05
        ? 'warmer'
        : tempDiff < -0.05
          ? 'colder'
          : 'similar'

  // Only produce rainfall outcome when both periods have rainfall coverage
  const leftRainAvail = left.coverage.rainfall.availableDays > 0
  const rightRainAvail = right.coverage.rainfall.availableDays > 0

  let rainfall: 'wetter' | 'drier' | 'similar' | null = null

  if (
    leftRainAvail &&
    rightRainAvail &&
    left.rainfallTotalMm != null &&
    right.rainfallTotalMm != null
  ) {
    const rainDiff = left.rainfallTotalMm - right.rainfallTotalMm
    if (rainDiff > 0.05) rainfall = 'wetter'
    else if (rainDiff < -0.05) rainfall = 'drier'
    else rainfall = 'similar'
  }

  return { temperature, rainfall }
}
