import {
  calculateAnnualCompleteness,
  calculateMonthlyCompleteness,
  calculateRainfallDifferenceFromNormal,
  calculateRainfallPercentageOfNormal,
  calculateSafeAverage,
  calculateSafeTotal,
  calculateTemperatureAnomaly,
  collectTiedValues,
} from '@/lib/climate'
import { RAIN_DAY_THRESHOLD_MM, RAINFALL_START_DATE } from '@/config/weather'
import { ANNUAL_RAIN_NORMAL_MM, monthNormal } from '@/features/normals/rainfallNormals'
import type {
  ClimateDateString,
  ClimateDay,
  MonthlySummary,
  AnnualSummary,
  MonthlyNormal,
  TiedDatesMetric,
  PeriodCoverage,
} from '@/types/weather'

export interface ArchivePeriodOptions {
  referenceDate?: ClimateDateString | Date
}

/**
 * Returns true when rainfall records are available for the given year and month.
 * Rainfall records begin 2020-05-01.
 */
export function isRainfallAvailableForMonth(year: number, month: number): boolean {
  const [startYear, startMonth] = RAINFALL_START_DATE.split('-').map(Number) as [number, number]
  return year > startYear || (year === startYear && month >= startMonth)
}

/**
 * Returns true when rainfall records are available for the full given year.
 * Because rainfall starts 2020-05-01, the year 2020 cannot have a complete
 * rainfall total for January–December.
 */
export function isRainfallAvailableForYear(year: number): boolean {
  const [startYear] = RAINFALL_START_DATE.split('-').map(Number) as [number, number]
  return year > startYear
}

function recordsForMonth(
  records: readonly ClimateDay[],
  year: number,
  month: number,
): ClimateDay[] {
  return records.filter((r) => {
    const parts = r.date.split('-')
    return Number(parts[0]) === year && Number(parts[1]) === month
  })
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
    (r) => r.rainfallMm != null && r.rainfallMm > RAIN_DAY_THRESHOLD_MM,
  ).length
}

function safeRainfallTotal(records: readonly ClimateDay[]): number | null {
  const valid = records.filter((r) => r.rainfallMm != null)
  if (valid.length === 0) return null
  return calculateSafeTotal(valid.map((r) => r.rainfallMm))
}

export function buildMonthlySummary(
  year: number,
  month: number,
  allRecords: readonly ClimateDay[],
  monthlyNormal: MonthlyNormal | null,
  options: ArchivePeriodOptions = {},
): MonthlySummary {
  const records = recordsForMonth(allRecords, year, month)

  const highestMax = toTiedDates(collectTiedValues(records, (r) => r.maxTempC, 'max'))
  const lowestMin = toTiedDates(collectTiedValues(records, (r) => r.minTempC, 'min'))
  const wettestDay = toTiedDates(collectTiedValues(records, (r) => r.rainfallMm, 'max'))

  const meanMaxTempC = calculateSafeAverage(records.map((r) => r.maxTempC))
  const meanMinTempC = calculateSafeAverage(records.map((r) => r.minTempC))
  const meanTempC = calculateSafeAverage(records.map((r) => r.meanTempC))
  const rainfallTotalMm = safeRainfallTotal(records)
  const rainDays = countRainDays(records)

  const normalMaxC = monthlyNormal?.meanMaxTempC ?? null
  const normalMinC = monthlyNormal?.meanMinTempC ?? null
  const normalMeanC = monthlyNormal?.meanTempC ?? null
  const normalRainfallMm = monthNormal(month - 1)

  const coverage: PeriodCoverage = calculateMonthlyCompleteness(year, month, allRecords, options)

  return {
    year,
    month,
    highestMax,
    lowestMin,
    meanMaxTempC,
    meanMinTempC,
    meanTempC,
    meanMaxTempAnomalyC: calculateTemperatureAnomaly(meanMaxTempC, normalMaxC),
    meanMinTempAnomalyC: calculateTemperatureAnomaly(meanMinTempC, normalMinC),
    meanTempAnomalyC: calculateTemperatureAnomaly(meanTempC, normalMeanC),
    rainfallTotalMm,
    rainfallPercentageOfNormal: calculateRainfallPercentageOfNormal(
      rainfallTotalMm,
      normalRainfallMm,
    ),
    rainfallDifferenceFromNormalMm: calculateRainfallDifferenceFromNormal(
      rainfallTotalMm,
      normalRainfallMm,
    ),
    rainDays,
    wettestDay,
    coverage,
  }
}

export function buildAnnualSummary(
  year: number,
  records: readonly ClimateDay[],
  monthlyNormals: readonly MonthlyNormal[],
  options: ArchivePeriodOptions = {},
): AnnualSummary {
  const monthlySummaries = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1
    const normal = monthlyNormals.find((n) => n.month === month) ?? null
    return buildMonthlySummary(year, month, records, normal, options)
  })

  const highestMax = toTiedDates(collectTiedValues(records, (r) => r.maxTempC, 'max'))
  const lowestMin = toTiedDates(collectTiedValues(records, (r) => r.minTempC, 'min'))
  const wettestDay = toTiedDates(collectTiedValues(records, (r) => r.rainfallMm, 'max'))

  const meanMaxTempC = calculateSafeAverage(records.map((r) => r.maxTempC))
  const meanMinTempC = calculateSafeAverage(records.map((r) => r.minTempC))
  const meanTempC = calculateSafeAverage(records.map((r) => r.meanTempC))
  const rainfallTotalMm = safeRainfallTotal(records)
  const rainDays = countRainDays(records)

  // Annual normals: average monthly normal means, total monthly rainfall normals
  const normalMaxC = calculateSafeAverage(monthlyNormals.map((n) => n.meanMaxTempC))
  const normalMinC = calculateSafeAverage(monthlyNormals.map((n) => n.meanMinTempC))
  const normalMeanC = calculateSafeAverage(monthlyNormals.map((n) => n.meanTempC))
  const normalRainfallMm = ANNUAL_RAIN_NORMAL_MM

  const coverage: PeriodCoverage = calculateAnnualCompleteness(year, records, options)
  const temperatureAnomalyValid =
    !coverage.provisional &&
    coverage.maxTemperature.complete &&
    coverage.minTemperature.complete &&
    coverage.meanTemperature.complete
  const rainfallAnomalyValid =
    !coverage.provisional &&
    isRainfallAvailableForYear(year) &&
    coverage.rainfall.complete

  return {
    year,
    highestMax,
    lowestMin,
    meanMaxTempC,
    meanMinTempC,
    meanTempC,
    meanMaxTempAnomalyC: temperatureAnomalyValid
      ? calculateTemperatureAnomaly(meanMaxTempC, normalMaxC)
      : null,
    meanMinTempAnomalyC: temperatureAnomalyValid
      ? calculateTemperatureAnomaly(meanMinTempC, normalMinC)
      : null,
    meanTempAnomalyC: temperatureAnomalyValid
      ? calculateTemperatureAnomaly(meanTempC, normalMeanC)
      : null,
    rainfallTotalMm,
    rainfallPercentageOfNormal: rainfallAnomalyValid
      ? calculateRainfallPercentageOfNormal(rainfallTotalMm, normalRainfallMm)
      : null,
    rainfallDifferenceFromNormalMm: rainfallAnomalyValid
      ? calculateRainfallDifferenceFromNormal(rainfallTotalMm, normalRainfallMm)
      : null,
    rainDays,
    wettestDay,
    coverage,
    monthlySummaries,
  }
}
