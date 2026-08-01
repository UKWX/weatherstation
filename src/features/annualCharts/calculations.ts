import {
  calculateSafeAverage,
  compareClimateDates,
  formatEuropeLondonDisplay,
  parseIsoClimateDate,
} from '@/lib/climate'
import { buildAnnualSummary } from '@/features/climateArchive/calculations'
import type {
  AnnualClimatePayload,
  ClimateDateString,
  ClimateDay,
  ClimateValueStatus,
  DailyNormal,
  MonthlyNormal,
} from '@/types/weather'

export type AnnualExtremeCategory =
  | 'highest-max'
  | 'lowest-max'
  | 'highest-min'
  | 'lowest-min'

export interface AnnualTemperatureRow {
  readonly date: ClimateDateString
  readonly dateKey: string
  readonly month: number
  readonly day: number
  readonly timestamp: number
  readonly observedMaxC: number | null
  readonly observedMinC: number | null
  readonly normalMaxC: number | null
  readonly normalMinC: number | null
  readonly maxAnomalyC: number | null
  readonly minAnomalyC: number | null
  readonly status: ClimateValueStatus
}

export interface CalendarDateExtremeMetric {
  readonly value: number | null
  readonly years: readonly number[]
}

export interface CalendarDateExtremeSummary {
  readonly highestMax: CalendarDateExtremeMetric
  readonly lowestMax: CalendarDateExtremeMetric
  readonly highestMin: CalendarDateExtremeMetric
  readonly lowestMin: CalendarDateExtremeMetric
}

export interface AnnualTrendPoint {
  readonly year: number
  readonly label: string
  readonly timestamp: number
  readonly meanMaxTempC: number | null
  readonly meanMinTempC: number | null
  readonly meanTempC: number | null
  readonly rainfallTotalMm: number | null
  readonly temperatureComplete: boolean
  readonly rainfallComplete: boolean
  readonly provisional: boolean
}

export interface AnnualTrendReferenceLines {
  readonly meanMaxTempC: number | null
  readonly meanMinTempC: number | null
  readonly meanTempC: number | null
  readonly rainfallTotalMm: number | null
}

export interface AnnualTrendData {
  readonly points: readonly AnnualTrendPoint[]
  readonly references: AnnualTrendReferenceLines
}

export function buildAnnualTemperatureRows(
  dailyNormals: readonly DailyNormal[],
  yearRecords: readonly ClimateDay[],
): readonly AnnualTemperatureRow[] {
  const normalsByKey = new Map(dailyNormals.map((normal) => [normal.dateKey, normal]))

  return [...yearRecords]
    .sort((left, right) => compareClimateDates(left.date, right.date))
    .map((record) => {
      const { month, day, year } = parseIsoClimateDate(record.date)
      const dateKey = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const normal = normalsByKey.get(dateKey) ?? null
      const timestamp = Date.UTC(year, month - 1, day, 12)

      return {
        date: record.date,
        dateKey,
        month,
        day,
        timestamp,
        observedMaxC: record.maxTempC,
        observedMinC: record.minTempC,
        normalMaxC: normal?.normalMaxTempC ?? null,
        normalMinC: normal?.normalMinTempC ?? null,
        maxAnomalyC:
          record.maxTempC != null && normal?.normalMaxTempC != null
            ? record.maxTempC - normal.normalMaxTempC
            : null,
        minAnomalyC:
          record.minTempC != null && normal?.normalMinTempC != null
            ? record.minTempC - normal.normalMinTempC
            : null,
        status: record.status,
      }
    })
}

export function buildCalendarDateExtremeSummaries(
  payloads: readonly AnnualClimatePayload[],
): ReadonlyMap<string, CalendarDateExtremeSummary> {
  const summaries = new Map<
    string,
    {
      highestMax: { value: number | null; years: Set<number> }
      lowestMax: { value: number | null; years: Set<number> }
      highestMin: { value: number | null; years: Set<number> }
      lowestMin: { value: number | null; years: Set<number> }
    }
  >()

  for (const payload of payloads) {
    for (const record of payload.records) {
      const { month, day } = parseIsoClimateDate(record.date)
      const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const existing =
        summaries.get(key) ??
        {
          highestMax: { value: null, years: new Set<number>() },
          lowestMax: { value: null, years: new Set<number>() },
          highestMin: { value: null, years: new Set<number>() },
          lowestMin: { value: null, years: new Set<number>() },
        }

      updateExtremeMetric(existing.highestMax, record.maxTempC, payload.year, 'max')
      updateExtremeMetric(existing.lowestMax, record.maxTempC, payload.year, 'min')
      updateExtremeMetric(existing.highestMin, record.minTempC, payload.year, 'max')
      updateExtremeMetric(existing.lowestMin, record.minTempC, payload.year, 'min')
      summaries.set(key, existing)
    }
  }

  return new Map(
    [...summaries.entries()].map(([key, value]) => [
      key,
      {
        highestMax: toCalendarDateMetric(value.highestMax),
        lowestMax: toCalendarDateMetric(value.lowestMax),
        highestMin: toCalendarDateMetric(value.highestMin),
        lowestMin: toCalendarDateMetric(value.lowestMin),
      },
    ]),
  )
}

export function buildAnnualTrendData(
  payloads: readonly AnnualClimatePayload[],
  monthlyNormals: readonly MonthlyNormal[],
): AnnualTrendData {
  const points = [...payloads]
    .sort((left, right) => left.year - right.year)
    .map((payload) => {
      const summary = buildAnnualSummary(payload.year, payload.records, monthlyNormals)
      return {
        year: payload.year,
        label: String(payload.year),
        timestamp: Date.UTC(payload.year, 0, 1, 12),
        meanMaxTempC: summary.meanMaxTempC,
        meanMinTempC: summary.meanMinTempC,
        meanTempC: summary.meanTempC,
        rainfallTotalMm: summary.rainfallTotalMm,
        temperatureComplete:
          !summary.coverage.provisional &&
          summary.coverage.maxTemperature.complete &&
          summary.coverage.minTemperature.complete,
        rainfallComplete:
          !summary.coverage.provisional && summary.coverage.rainfall.complete,
        provisional: summary.coverage.provisional,
      }
    })

  return {
    points,
    references: {
      meanMaxTempC: calculateSafeAverage(
        points
          .filter((point) => point.temperatureComplete)
          .map((point) => point.meanMaxTempC),
      ),
      meanMinTempC: calculateSafeAverage(
        points
          .filter((point) => point.temperatureComplete)
          .map((point) => point.meanMinTempC),
      ),
      meanTempC: calculateSafeAverage(
        points
          .filter((point) => point.temperatureComplete)
          .map((point) => point.meanTempC),
      ),
      rainfallTotalMm: calculateSafeAverage(
        points
          .filter((point) => point.rainfallComplete)
          .map((point) => point.rainfallTotalMm),
      ),
    },
  }
}

export function formatAnnualChartTick(timestamp: number, spanMs: number): string {
  const date = new Date(timestamp)
  if (spanMs <= 40 * 24 * 60 * 60 * 1000) {
    return formatEuropeLondonDisplay(date, { day: 'numeric', month: 'short' })
  }
  if (spanMs <= 220 * 24 * 60 * 60 * 1000) {
    return formatEuropeLondonDisplay(date, { month: 'short' })
  }
  return formatEuropeLondonDisplay(date, { year: 'numeric' })
}

export function buildAnnualQuickRangesForYear(year: number): readonly {
  label: string
  start: number
  end: number
}[] {
  const fullStart = Date.UTC(year, 0, 1, 12)
  const fullEnd = Date.UTC(year, 11, 31, 12)

  return [
    { label: '1 month', start: fullEnd - 30 * 24 * 60 * 60 * 1000, end: fullEnd },
    { label: '3 months', start: fullEnd - 91 * 24 * 60 * 60 * 1000, end: fullEnd },
    { label: '6 months', start: fullEnd - 183 * 24 * 60 * 60 * 1000, end: fullEnd },
    { label: 'Full year', start: fullStart, end: fullEnd },
  ]
}

function updateExtremeMetric(
  metric: { value: number | null; years: Set<number> },
  value: number | null,
  year: number,
  mode: 'max' | 'min',
): void {
  if (value == null) {
    return
  }

  if (metric.value == null) {
    metric.value = value
    metric.years = new Set([year])
    return
  }

  if (value === metric.value) {
    metric.years.add(year)
    return
  }

  const isBetter = mode === 'max' ? value > metric.value : value < metric.value
  if (isBetter) {
    metric.value = value
    metric.years = new Set([year])
  }
}

function toCalendarDateMetric(
  metric: { value: number | null; years: Set<number> },
): CalendarDateExtremeMetric {
  return {
    value: metric.value,
    years: [...metric.years].sort((left, right) => left - right),
  }
}
