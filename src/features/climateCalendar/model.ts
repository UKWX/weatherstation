import { RAINFALL_START_DATE, WEATHER_UNITS } from '@/config/weather'
import {
  calculateTemperatureAnomaly,
  collectTiedValues,
  compareClimateDates,
  daysInMonth,
  formatNullableMeasurement,
  parseIsoClimateDate,
  toClimateDateString,
} from '@/lib/climate'
import type {
  AnnualClimatePayload,
  ClimateDateString,
  ClimateDay,
  ClimateValueStatus,
  DailyNormal,
} from '@/types/weather'

export const CALENDAR_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export const CALENDAR_MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

export const CALENDAR_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export type CalendarMetric = 'max' | 'min' | 'mean' | 'rainfall'
export type CalendarMetricAvailability = 'value' | 'missing' | 'unavailable'

export interface MetricLegendBucket {
  readonly key: string
  readonly shortLabel: string
  readonly label: string
  readonly className: string
}

export interface MetricLegend {
  readonly title: string
  readonly scaleDescription: string
  readonly buckets: readonly MetricLegendBucket[]
}

export interface CalendarDayCell {
  readonly date: ClimateDateString
  readonly year: number
  readonly month: number
  readonly day: number
  readonly status: ClimateValueStatus
  readonly provisional: boolean
  readonly metric: CalendarMetric
  readonly availability: CalendarMetricAvailability
  readonly value: number | null
  readonly normalValue: number | null
  readonly anomaly: number | null
  readonly bucketKey: string | null
  readonly label: string
  readonly shortValueLabel: string
}

export interface CalendarMonthView {
  readonly year: number
  readonly month: number
  readonly name: string
  readonly weeks: readonly (readonly (CalendarDayCell | null)[])[]
  readonly days: readonly CalendarDayCell[]
}

export interface OnThisDayRow {
  readonly year: number
  readonly date: ClimateDateString
  readonly maxTempC: number | null
  readonly minTempC: number | null
  readonly meanTempC: number | null
  readonly rainfallMm: number | null
  readonly status: ClimateValueStatus
  readonly rainfallAvailability: CalendarMetricAvailability
  readonly maxAnomalyC: number | null
  readonly minAnomalyC: number | null
  readonly meanAnomalyC: number | null
}

export interface OnThisDaySummaryEntry {
  readonly value: number
  readonly years: readonly number[]
}

export interface OnThisDayData {
  readonly rows: readonly OnThisDayRow[]
  readonly chartRows: readonly OnThisDayRow[]
  readonly normal: DailyNormal | null
  readonly sampleSize: number
  readonly rainfallSampleSize: number
  readonly leapDay: boolean
  readonly meanTempC: number | null
  readonly medianMeanTempC: number | null
  readonly highestMax: OnThisDaySummaryEntry | null
  readonly lowestMax: OnThisDaySummaryEntry | null
  readonly highestMin: OnThisDaySummaryEntry | null
  readonly lowestMin: OnThisDaySummaryEntry | null
  readonly wettest: OnThisDaySummaryEntry | null
}

interface MetricDescriptor {
  readonly label: string
  readonly unit: string
  readonly getValue: (record: ClimateDay) => number | null
  readonly getNormalValue: (normal: DailyNormal | null) => number | null
  readonly formatValue: (value: number | null) => string
}

const RAINFALL_BUCKETS = [0.1, 2, 5, 10, 20]

const METRIC_DESCRIPTORS: Record<CalendarMetric, MetricDescriptor> = {
  max: {
    label: 'Maximum temperature',
    unit: WEATHER_UNITS.temperature,
    getValue: (record) => record.maxTempC,
    getNormalValue: (normal) => normal?.normalMaxTempC ?? null,
    formatValue: (value) => formatNullableMeasurement(value, { unit: WEATHER_UNITS.temperature }),
  },
  min: {
    label: 'Minimum temperature',
    unit: WEATHER_UNITS.temperature,
    getValue: (record) => record.minTempC,
    getNormalValue: (normal) => normal?.normalMinTempC ?? null,
    formatValue: (value) => formatNullableMeasurement(value, { unit: WEATHER_UNITS.temperature }),
  },
  mean: {
    label: 'Mean temperature',
    unit: WEATHER_UNITS.temperature,
    getValue: (record) => record.meanTempC,
    getNormalValue: (normal) => normal?.normalMeanTempC ?? null,
    formatValue: (value) => formatNullableMeasurement(value, { unit: WEATHER_UNITS.temperature }),
  },
  rainfall: {
    label: 'Rainfall',
    unit: WEATHER_UNITS.rainfall,
    getValue: (record) => record.rainfallMm,
    getNormalValue: () => null,
    formatValue: (value) => formatNullableMeasurement(value, { unit: WEATHER_UNITS.rainfall }),
  },
}

function getNormalMap(normals: readonly DailyNormal[]): Map<string, DailyNormal> {
  return new Map(normals.map((normal) => [normal.dateKey, normal]))
}

function getRecordMap(records: readonly ClimateDay[]): Map<ClimateDateString, ClimateDay> {
  return new Map(records.map((record) => [record.date, record]))
}

export function getMonthDayKey(month: number, day: number): string {
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function getMonthDayKeyFromDate(date: ClimateDateString): string {
  const { month, day } = parseIsoClimateDate(date)
  return getMonthDayKey(month, day)
}

export function isRainfallUnavailableForDate(date: ClimateDateString): boolean {
  return compareClimateDates(date, RAINFALL_START_DATE) < 0
}

export function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0)
}

function getTemperatureLegend(values: readonly number[], metric: CalendarMetric): MetricLegend {
  const min = Math.floor(Math.min(...values))
  const max = Math.ceil(Math.max(...values))
  const span = Math.max(max - min, 5)
  const step = span / 5
  const thresholds = Array.from({ length: 4 }, (_, index) => min + step * (index + 1))
  const labels = ['Cool', 'Mild', 'Seasonal', 'Warm', 'Hot']
  const buckets = labels.map((shortLabel, index) => {
    const lower = index === 0 ? null : thresholds[index - 1] ?? null
    const upper = thresholds[index] ?? null
    const rangeLabel =
      lower == null
        ? `< ${upper!.toFixed(1)} ${WEATHER_UNITS.temperature}`
        : upper == null
          ? `≥ ${lower.toFixed(1)} ${WEATHER_UNITS.temperature}`
          : `${lower.toFixed(1)}–${upper.toFixed(1)} ${WEATHER_UNITS.temperature}`

    return {
      key: `temp-${index}`,
      shortLabel,
      label: rangeLabel,
      className: `calendar-tone-temp-${index}`,
    }
  })

  return {
    title: `${METRIC_DESCRIPTORS[metric].label} scale`,
    scaleDescription: `${METRIC_DESCRIPTORS[metric].label} uses a year-specific temperature scale.`,
    buckets,
  }
}

function getRainfallLegend(): MetricLegend {
  return {
    title: 'Rainfall scale',
    scaleDescription: 'Rainfall uses dedicated depth bands rather than the temperature colour scale.',
    buckets: [
      { key: 'rain-0', shortLabel: 'Dry', label: '0.0 mm', className: 'calendar-tone-rain-0' },
      { key: 'rain-1', shortLabel: 'Trace', label: '< 0.1 mm', className: 'calendar-tone-rain-1' },
      { key: 'rain-2', shortLabel: 'Light', label: '0.1–2.0 mm', className: 'calendar-tone-rain-2' },
      { key: 'rain-3', shortLabel: 'Showery', label: '2.0–5.0 mm', className: 'calendar-tone-rain-3' },
      { key: 'rain-4', shortLabel: 'Wet', label: '5.0–10.0 mm', className: 'calendar-tone-rain-4' },
      { key: 'rain-5', shortLabel: 'Very wet', label: '≥ 10.0 mm', className: 'calendar-tone-rain-5' },
    ],
  }
}

export function getMetricLegend(metric: CalendarMetric, records: readonly ClimateDay[]): MetricLegend {
  if (metric === 'rainfall') {
    return getRainfallLegend()
  }

  const descriptor = METRIC_DESCRIPTORS[metric]
  const values = records
    .map((record) => descriptor.getValue(record))
    .filter((value): value is number => value != null && Number.isFinite(value))

  if (values.length === 0) {
    return getTemperatureLegend([0, 5, 10, 15, 20], metric)
  }

  return getTemperatureLegend(values, metric)
}

function getBucketKey(metric: CalendarMetric, value: number | null, legend: MetricLegend): string | null {
  if (value == null) {
    return null
  }

  if (metric === 'rainfall') {
    if (value === 0) return legend.buckets[0]?.key ?? null
    if (value < RAINFALL_BUCKETS[0]!) return legend.buckets[1]?.key ?? null
    if (value < RAINFALL_BUCKETS[1]!) return legend.buckets[2]?.key ?? null
    if (value < RAINFALL_BUCKETS[2]!) return legend.buckets[3]?.key ?? null
    if (value < RAINFALL_BUCKETS[3]!) return legend.buckets[4]?.key ?? null
    return legend.buckets[5]?.key ?? null
  }

  const ranges = legend.buckets.map((bucket) => {
    const numbers = bucket.label.match(/-?\d+\.?\d*/g)?.map(Number) ?? []
    return numbers
  })

  if (value < (ranges[0]?.[0] ?? Infinity)) return legend.buckets[0]?.key ?? null
  for (let index = 1; index < legend.buckets.length - 1; index += 1) {
    const lower = ranges[index]?.[0] ?? -Infinity
    const upper = ranges[index]?.[1] ?? Infinity
    if (value >= lower && value < upper) {
      return legend.buckets[index]?.key ?? null
    }
  }
  return legend.buckets.at(-1)?.key ?? null
}

function getMetricAvailability(metric: CalendarMetric, record: ClimateDay | null): CalendarMetricAvailability {
  if (record == null) {
    return 'missing'
  }

  if (metric === 'rainfall' && isRainfallUnavailableForDate(record.date)) {
    return 'unavailable'
  }

  return METRIC_DESCRIPTORS[metric].getValue(record) == null ? 'missing' : 'value'
}

function getShortValueLabel(metric: CalendarMetric, value: number | null, availability: CalendarMetricAvailability): string {
  if (availability === 'unavailable') return 'N/A'
  if (availability === 'missing') return 'Missing'
  if (value == null) return '—'
  if (metric === 'rainfall') return `${Math.round(value)}mm`
  return `${Math.round(value)}°`
}

export function buildCalendarMonthView(
  year: number,
  month: number,
  records: readonly ClimateDay[],
  normals: readonly DailyNormal[],
  metric: CalendarMetric,
): CalendarMonthView {
  const legend = getMetricLegend(metric, records)
  const recordMap = getRecordMap(records)
  const normalMap = getNormalMap(normals)
  const monthDays = daysInMonth(year, month)
  const weeks: (CalendarDayCell | null)[][] = []
  let currentWeek: (CalendarDayCell | null)[] = []
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const days: CalendarDayCell[] = []

  for (let index = 0; index < firstWeekday; index += 1) {
    currentWeek.push(null)
  }

  for (let day = 1; day <= monthDays; day += 1) {
    const date = toClimateDateString(year, month, day)
    const record = recordMap.get(date) ?? null
    const normal = normalMap.get(getMonthDayKey(month, day)) ?? null
    const descriptor = METRIC_DESCRIPTORS[metric]
    const availability = getMetricAvailability(metric, record)
    const value = availability === 'value' && record != null ? descriptor.getValue(record) : null
    const normalValue = descriptor.getNormalValue(normal)
    const anomaly = metric === 'rainfall' ? null : calculateTemperatureAnomaly(value, normalValue)
    const label = descriptor.formatValue(value)
    const cell: CalendarDayCell = {
      date,
      year,
      month,
      day,
      status: record?.status ?? 'incomplete',
      provisional: record?.status === 'provisional',
      metric,
      availability,
      value,
      normalValue,
      anomaly,
      bucketKey: availability === 'value' ? getBucketKey(metric, value, legend) : null,
      label,
      shortValueLabel: getShortValueLabel(metric, value, availability),
    }
    days.push(cell)
    currentWeek.push(cell)
    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null)
    }
    weeks.push(currentWeek)
  }

  return {
    year,
    month,
    name: CALENDAR_MONTH_NAMES[month - 1] ?? String(month),
    weeks,
    days,
  }
}

export function buildAnnualCalendarViews(
  year: number,
  records: readonly ClimateDay[],
  normals: readonly DailyNormal[],
  metric: CalendarMetric,
): readonly CalendarMonthView[] {
  return Array.from({ length: 12 }, (_, index) =>
    buildCalendarMonthView(year, index + 1, records, normals, metric),
  )
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!
}

function toSummaryEntry(result: ReturnType<typeof collectTiedValues<OnThisDayRow>> | null): OnThisDaySummaryEntry | null {
  if (result == null) {
    return null
  }

  return {
    value: result.value,
    years: result.items.map((item) => item.year),
  }
}

export function buildOnThisDayData(
  month: number,
  day: number,
  annualPayloads: readonly (AnnualClimatePayload | null | undefined)[],
  dailyNormals: readonly DailyNormal[],
): OnThisDayData {
  const dateKey = getMonthDayKey(month, day)
  const normal = dailyNormals.find((entry) => entry.dateKey === dateKey) ?? null
  const rows = annualPayloads.flatMap((payload) => {
    if (payload == null) {
      return []
    }

    const date = toClimateDateString(payload.year, month, day)
    const record = payload.records.find((entry) => entry.date === date)
    if (record == null) {
      return []
    }

    return [{
      year: payload.year,
      date,
      maxTempC: record.maxTempC,
      minTempC: record.minTempC,
      meanTempC: record.meanTempC,
      rainfallMm: record.rainfallMm,
      status: record.status,
      rainfallAvailability: isRainfallUnavailableForDate(date)
        ? 'unavailable'
        : record.rainfallMm == null
          ? 'missing'
          : 'value',
      maxAnomalyC: calculateTemperatureAnomaly(record.maxTempC, normal?.normalMaxTempC ?? null),
      minAnomalyC: calculateTemperatureAnomaly(record.minTempC, normal?.normalMinTempC ?? null),
      meanAnomalyC: calculateTemperatureAnomaly(record.meanTempC, normal?.normalMeanTempC ?? null),
    } satisfies OnThisDayRow]
  })

  const chartRows = [...rows].sort((left, right) => left.year - right.year)
  const sortedRows = [...rows].sort((left, right) => right.year - left.year)
  const validMeanTemps = rows
    .map((row) => row.meanTempC)
    .filter((value): value is number => value != null && Number.isFinite(value))
  const rainfallRows = rows.filter((row) => row.rainfallAvailability === 'value' && row.rainfallMm != null)

  return {
    rows: sortedRows,
    chartRows,
    normal,
    sampleSize: rows.length,
    rainfallSampleSize: rainfallRows.length,
    leapDay: month === 2 && day === 29,
    meanTempC: mean(validMeanTemps),
    medianMeanTempC: median(validMeanTemps),
    highestMax: toSummaryEntry(collectTiedValues(rows, (row) => row.maxTempC, 'max')),
    lowestMax: toSummaryEntry(collectTiedValues(rows, (row) => row.maxTempC, 'min')),
    highestMin: toSummaryEntry(collectTiedValues(rows, (row) => row.minTempC, 'max')),
    lowestMin: toSummaryEntry(collectTiedValues(rows, (row) => row.minTempC, 'min')),
    wettest: toSummaryEntry(collectTiedValues(rainfallRows, (row) => row.rainfallMm, 'max')),
  }
}

export function describeStatus(status: ClimateValueStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}
