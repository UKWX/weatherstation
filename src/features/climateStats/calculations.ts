import { daysInMonth, parseIsoClimateDate } from '@/lib/climate'
import { RAIN_DAY_THRESHOLD_MM } from '@/config/weather'
import { monthNormal } from '@/features/normals/rainfallNormals'
import type {
  AnnualClimatePayload,
  AnnualSummary,
  ClimateDay,
  DailyNormal,
  MonthlyNormal,
  MonthlySummary,
} from '@/types/weather'

export interface ClimateStatsRow {
  readonly timestamp: number
  readonly label: string
  readonly provisional: boolean
  readonly values: Record<string, number | null>
}

export interface MonthlyTemperatureStatsRow {
  readonly month: number
  readonly label: string
  readonly observedMaxC: number | null
  readonly observedMinC: number | null
  readonly observedMeanC: number | null
  readonly normalMaxC: number | null
  readonly normalMinC: number | null
  readonly normalMeanC: number | null
  readonly maxAnomalyC: number | null
  readonly minAnomalyC: number | null
  readonly meanAnomalyC: number | null
}

export interface DailyTemperatureStatsRow {
  readonly date: ClimateDay['date']
  readonly timestamp: number
  readonly label: string
  readonly maxC: number | null
  readonly minC: number | null
  readonly meanC: number | null
  readonly normalMaxC: number | null
  readonly normalMinC: number | null
  readonly normalMeanC: number | null
  readonly maxAnomalyC: number | null
  readonly minAnomalyC: number | null
  readonly meanAnomalyC: number | null
  readonly provisional: boolean
}

export interface MonthlyRainfallStatsRow {
  readonly month: number
  readonly label: string
  readonly observedMm: number | null
  readonly normalMm: number | null
  readonly differenceMm: number | null
  readonly percentageOfNormal: number | null
  readonly rainDays: number
  readonly complete: boolean
  readonly unavailable: boolean
}

export interface DailyRainfallStatsRow {
  readonly date: ClimateDay['date']
  readonly timestamp: number
  readonly label: string
  readonly rainfallMm: number | null
  readonly cumulativeMm: number | null
  readonly rollingMm: number | null
  readonly rainDay: number | null
  readonly provisional: boolean
  readonly unavailable: boolean
}

export interface AnnualClimateStatsRow {
  readonly year: number
  readonly label: string
  readonly meanMaxC: number | null
  readonly meanMinC: number | null
  readonly meanC: number | null
  readonly rainfallMm: number | null
  readonly rainfallPercentageOfNormal: number | null
  readonly provisional: boolean
  readonly temperatureComplete: boolean
  readonly rainfallComplete: boolean
}

export interface TemperatureRangeStatsRow {
  readonly date: ClimateDay['date']
  readonly timestamp: number
  readonly label: string
  readonly maxC: number | null
  readonly minC: number | null
  readonly rangeC: number | null
  readonly provisional: boolean
}

export interface MonthlyThresholdStatsRow {
  readonly month: number
  readonly label: string
  readonly warm20Days: number
  readonly warm25Days: number
  readonly warm30Days: number
  readonly frostDays: number
  readonly rainDays: number
  readonly heavyRainDays: number
}

export const CLIMATE_STATS_MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

export function buildMonthlyTemperatureStats(
  summaries: readonly MonthlySummary[],
  normals: readonly Pick<MonthlyNormal, 'month' | 'meanMaxTempC' | 'meanMinTempC' | 'meanTempC'>[],
): readonly MonthlyTemperatureStatsRow[] {
  return CLIMATE_STATS_MONTH_LABELS.map((label, index) => {
    const month = index + 1
    const summary = summaries.find((entry) => entry.month === month)
    const normal = normals.find((entry) => entry.month === month)
    return {
      month,
      label,
      observedMaxC: summary?.meanMaxTempC ?? null,
      observedMinC: summary?.meanMinTempC ?? null,
      observedMeanC: summary?.meanTempC ?? null,
      normalMaxC: normal?.meanMaxTempC ?? null,
      normalMinC: normal?.meanMinTempC ?? null,
      normalMeanC: normal?.meanTempC ?? null,
      maxAnomalyC: summary?.meanMaxTempAnomalyC ?? null,
      minAnomalyC: summary?.meanMinTempAnomalyC ?? null,
      meanAnomalyC: summary?.meanTempAnomalyC ?? null,
    }
  })
}

export function buildDailyTemperatureStats(
  records: readonly ClimateDay[],
  normals: readonly DailyNormal[],
): readonly DailyTemperatureStatsRow[] {
  const normalByDate = new Map(normals.map((normal) => [normal.dateKey, normal]))
  return [...records]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((record) => {
      const { year, month, day } = parseIsoClimateDate(record.date)
      const normal = normalByDate.get(`${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
      return {
        date: record.date,
        timestamp: Date.UTC(year, month - 1, day, 12),
        label: record.date,
        maxC: record.maxTempC,
        minC: record.minTempC,
        meanC: record.meanTempC,
        normalMaxC: normal?.normalMaxTempC ?? null,
        normalMinC: normal?.normalMinTempC ?? null,
        normalMeanC: normal?.normalMeanTempC ?? null,
        maxAnomalyC: difference(record.maxTempC, normal?.normalMaxTempC ?? null),
        minAnomalyC: difference(record.minTempC, normal?.normalMinTempC ?? null),
        meanAnomalyC: difference(record.meanTempC, normal?.normalMeanTempC ?? null),
        provisional: record.status !== 'finalised',
      }
    })
}

export function buildMonthlyRainfallStats(
  year: number,
  summaries: readonly MonthlySummary[],
  normals: readonly (Pick<MonthlyNormal, 'month'> & Partial<Pick<MonthlyNormal, 'rainfallMm'>>)[],
): readonly MonthlyRainfallStatsRow[] {
  return CLIMATE_STATS_MONTH_LABELS.map((label, index) => {
    const month = index + 1
    const summary = summaries.find((entry) => entry.month === month)
    const normal = normals.find((entry) => entry.month === month)
    const unavailable = year < 2020 || (year === 2020 && month < 5)
    const observedMm = unavailable ? null : (summary?.rainfallTotalMm ?? null)
    const normalMm = normal?.rainfallMm ?? monthNormal(index)
    return {
      month,
      label,
      observedMm,
      normalMm,
      differenceMm: difference(observedMm, normalMm),
      percentageOfNormal: percentOf(observedMm, normalMm),
      rainDays: unavailable ? 0 : (summary?.rainDays ?? 0),
      complete: !unavailable && (summary?.coverage.rainfall.complete ?? false),
      unavailable,
    }
  })
}

export function buildDailyRainfallStats(
  records: readonly ClimateDay[],
  rollingDays = 7,
): readonly DailyRainfallStatsRow[] {
  const windowSize = Math.max(1, Math.floor(rollingDays))
  const sorted = [...records].sort((left, right) => left.date.localeCompare(right.date))
  let cumulative = 0
  return sorted.map((record, index) => {
    const { year, month, day } = parseIsoClimateDate(record.date)
    const unavailable = record.date < '2020-05-01'
    const rainfallMm = unavailable ? null : record.rainfallMm
    if (rainfallMm != null) cumulative += rainfallMm
    const window = sorted.slice(Math.max(0, index - windowSize + 1), index + 1)
    const validWindow = window
      .filter(
        (entry): entry is ClimateDay & { readonly rainfallMm: number } =>
          entry.date >= '2020-05-01' && entry.rainfallMm != null,
      )
      .map((entry) => entry.rainfallMm)
    const rollingMm = validWindow.length === windowSize ? validWindow.reduce((sum, value) => sum + value, 0) : null
    return {
      date: record.date,
      timestamp: Date.UTC(year, month - 1, day, 12),
      label: record.date,
      rainfallMm,
      cumulativeMm: rainfallMm == null ? null : cumulative,
      rollingMm,
      rainDay: rainfallMm == null ? null : rainfallMm > RAIN_DAY_THRESHOLD_MM ? 1 : 0,
      provisional: record.status !== 'finalised',
      unavailable,
    }
  })
}

export function buildAnnualClimateStats(
  payloads: readonly AnnualClimatePayload[],
  summaries: readonly AnnualSummary[],
): readonly AnnualClimateStatsRow[] {
  return [...payloads]
    .sort((left, right) => left.year - right.year)
    .map((payload) => {
      const summary = summaries.find((entry) => entry.year === payload.year)
      return {
        year: payload.year,
        label: String(payload.year),
        meanMaxC: summary?.meanMaxTempC ?? null,
        meanMinC: summary?.meanMinTempC ?? null,
        meanC: summary?.meanTempC ?? null,
        rainfallMm: summary?.rainfallTotalMm ?? null,
        rainfallPercentageOfNormal: summary?.rainfallPercentageOfNormal ?? null,
        provisional: payload.complete === false || summary?.coverage.provisional === true,
        temperatureComplete: summary?.coverage.maxTemperature.complete ?? false,
        rainfallComplete: summary?.coverage.rainfall.complete ?? false,
      }
    })
}

export function buildTemperatureRangeStats(
  records: readonly ClimateDay[],
): readonly TemperatureRangeStatsRow[] {
  return [...records]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((record) => {
      const { year, month, day } = parseIsoClimateDate(record.date)
      return {
        date: record.date,
        timestamp: Date.UTC(year, month - 1, day, 12),
        label: record.date,
        maxC: record.maxTempC,
        minC: record.minTempC,
        rangeC: difference(record.maxTempC, record.minTempC),
        provisional: record.status !== 'finalised',
      }
    })
}

export function buildMonthlyThresholdStats(
  records: readonly ClimateDay[],
): readonly MonthlyThresholdStatsRow[] {
  return CLIMATE_STATS_MONTH_LABELS.map((label, index) => {
    const month = index + 1
    const monthRecords = records.filter((record) => parseIsoClimateDate(record.date).month === month)
    return {
      month,
      label,
      warm20Days: count(monthRecords, (record) => record.maxTempC != null && record.maxTempC >= 20),
      warm25Days: count(monthRecords, (record) => record.maxTempC != null && record.maxTempC >= 25),
      warm30Days: count(monthRecords, (record) => record.maxTempC != null && record.maxTempC >= 30),
      frostDays: count(monthRecords, (record) => record.minTempC != null && record.minTempC < 0),
      rainDays: count(monthRecords, (record) => record.rainfallMm != null && record.rainfallMm > RAIN_DAY_THRESHOLD_MM),
      heavyRainDays: count(monthRecords, (record) => record.rainfallMm != null && record.rainfallMm >= 10),
    }
  })
}

export function toClimateStatsRows(
  rows: readonly MonthlyTemperatureStatsRow[],
): readonly ClimateStatsRow[] {
  return rows.map((row) => ({
    timestamp: Date.UTC(2000, row.month - 1, 15, 12),
    label: row.label,
    provisional: false,
    values: {
      observedMax: row.observedMaxC,
      observedMin: row.observedMinC,
      observedMean: row.observedMeanC,
      normalMax: row.normalMaxC,
      normalMin: row.normalMinC,
      normalMean: row.normalMeanC,
      maxAnomaly: row.maxAnomalyC,
      minAnomaly: row.minAnomalyC,
      meanAnomaly: row.meanAnomalyC,
    },
  }))
}

function difference(left: number | null, right: number | null): number | null {
  return left != null && right != null && Number.isFinite(left) && Number.isFinite(right) ? left - right : null
}

function percentOf(value: number | null, normal: number | null): number | null {
  return value != null && normal != null && normal !== 0 ? (value / normal) * 100 : null
}

function count(records: readonly ClimateDay[], predicate: (record: ClimateDay) => boolean): number {
  return records.filter(predicate).length
}

export function expectedDaysForMonth(year: number, month: number): number {
  return daysInMonth(year, month)
}
