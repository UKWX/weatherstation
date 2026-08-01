import {
  EUROPE_LONDON_TIMEZONE,
  RAIN_DAY_THRESHOLD_MM,
  RAINFALL_START_DATE,
} from '@/config/weather'
import type {
  ClimateDateString,
  ClimateDay,
  MeteorologicalSeason,
  MetricCoverage,
  ObservationCounts,
  PeriodCoverage,
} from '@/types/weather'

const CLIMATE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const MS_PER_DAY = 24 * 60 * 60 * 1000

export interface ClimateDateParts {
  year: number
  month: number
  day: number
}

export interface FormatMeasurementOptions {
  unit?: string
  nullText?: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}

export interface TiedValuesResult<T> {
  value: number
  items: readonly T[]
}

export interface PeriodOptions {
  referenceDate?: ClimateDateString | Date
}

export interface ObservationCountOptions extends PeriodOptions {
  startDate: ClimateDateString
  endDate: ClimateDateString
  availabilityStartDate?: ClimateDateString | null
}

export interface ThresholdCounts {
  atOrAbove20C: number
  atOrAbove25C: number
  atOrAbove30C: number
  frostDays: number
  rainDays: number
  heavyRainDays: number
}

export interface StreakSummary {
  length: number
  startDate: ClimateDateString | null
  endDate: ClimateDateString | null
  dates: readonly ClimateDateString[]
}

export function parseIsoClimateDate(value: string): ClimateDateParts {
  const match = CLIMATE_DATE_PATTERN.exec(value)

  if (!match) {
    throw new RangeError(`Invalid climate date: ${value}`)
  }

  const [, yearText, monthText, dayText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const candidate = new Date(Date.UTC(year, month - 1, day))

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid climate date: ${value}`)
  }

  return { year, month, day }
}

export function formatEuropeLondonDisplay(
  value: ClimateDateString | string | Date,
  options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  },
): string {
  const date = normaliseDateLike(value)

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: EUROPE_LONDON_TIMEZONE,
    ...options,
  }).format(date)
}

export function formatNullableMeasurement(
  value: number | null | undefined,
  options: FormatMeasurementOptions = {},
): string {
  const {
    unit,
    nullText = '—',
    minimumFractionDigits = 1,
    maximumFractionDigits = 1,
  } = options

  if (value == null || !Number.isFinite(value)) {
    return nullText
  }

  const formatted = new Intl.NumberFormat('en-GB', {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value)

  return unit ? `${formatted} ${unit}` : formatted
}

export function calculateDailyMeanTemperature(
  maxTempC: number | null | undefined,
  minTempC: number | null | undefined,
): number | null {
  if (!isFiniteNumber(maxTempC) || !isFiniteNumber(minTempC)) {
    return null
  }

  return (maxTempC + minTempC) / 2
}

export function calculateSafeAverage(
  values: readonly (number | null | undefined)[],
): number | null {
  const validValues = values.filter(isFiniteNumber)

  if (validValues.length === 0) {
    return null
  }

  return validValues.reduce((sum, value) => sum + value, 0) / validValues.length
}

export function calculateSafeTotal(
  values: readonly (number | null | undefined)[],
): number | null {
  const validValues = values.filter(isFiniteNumber)

  if (validValues.length === 0) {
    return null
  }

  return validValues.reduce((sum, value) => sum + value, 0)
}

export function collectTiedValues<T>(
  items: readonly T[],
  valueSelector: (item: T) => number | null | undefined,
  mode: 'max' | 'min' = 'max',
): TiedValuesResult<T> | null {
  let bestValue: number | null = null
  let tiedItems: T[] = []

  for (const item of items) {
    const value = valueSelector(item)

    if (!isFiniteNumber(value)) {
      continue
    }

    if (bestValue == null) {
      bestValue = value
      tiedItems = [item]
      continue
    }

    if (value === bestValue) {
      tiedItems.push(item)
      continue
    }

    const isBetter = mode === 'max' ? value > bestValue : value < bestValue

    if (isBetter) {
      bestValue = value
      tiedItems = [item]
    }
  }

  if (bestValue == null) {
    return null
  }

  return {
    value: bestValue,
    items: tiedItems,
  }
}

export function calculateTemperatureAnomaly(
  observed: number | null | undefined,
  normal: number | null | undefined,
): number | null {
  if (!isFiniteNumber(observed) || !isFiniteNumber(normal)) {
    return null
  }

  return observed - normal
}

export function calculateRainfallPercentageOfNormal(
  observed: number | null | undefined,
  normal: number | null | undefined,
): number | null {
  if (!isFiniteNumber(observed) || !isFiniteNumber(normal) || normal <= 0) {
    return null
  }

  return (observed / normal) * 100
}

export function calculateRainfallDifferenceFromNormal(
  observed: number | null | undefined,
  normal: number | null | undefined,
): number | null {
  if (!isFiniteNumber(observed) || !isFiniteNumber(normal)) {
    return null
  }

  return observed - normal
}

export function getMeteorologicalSeason(
  value: ClimateDateString | ClimateDateParts,
): MeteorologicalSeason {
  const { month } = typeof value === 'string' ? parseIsoClimateDate(value) : value

  if (month === 12 || month <= 2) {
    return 'winter'
  }

  if (month <= 5) {
    return 'spring'
  }

  if (month <= 8) {
    return 'summer'
  }

  return 'autumn'
}

export function getMeteorologicalSeasonYear(
  value: ClimateDateString | ClimateDateParts,
): number {
  const parts = typeof value === 'string' ? parseIsoClimateDate(value) : value

  return parts.month === 12 ? parts.year + 1 : parts.year
}

export function expectedDaysInPeriod(
  startDate: ClimateDateString,
  endDate: ClimateDateString,
  options: PeriodOptions = {},
): number {
  const clampedEndDate = getClampedPeriodEndDate(startDate, endDate, options)

  if (clampedEndDate == null) {
    return 0
  }

  return differenceInDaysInclusive(startDate, clampedEndDate)
}

export function isProvisionalPeriod(
  startDate: ClimateDateString,
  endDate: ClimateDateString,
  options: PeriodOptions = {},
): boolean {
  const referenceDate = normaliseReferenceClimateDate(options.referenceDate)

  return compareClimateDates(referenceDate, startDate) >= 0 &&
    compareClimateDates(referenceDate, endDate) < 0
}

export function countValidAndMissingObservations<T extends { date: ClimateDateString }>(
  records: readonly T[],
  valueSelector: (record: T) => number | null | undefined,
  options: ObservationCountOptions,
): ObservationCounts & { availableDays: number; expectedDays: number } {
  const clampedEndDate = getClampedPeriodEndDate(
    options.startDate,
    options.endDate,
    options,
  )

  if (clampedEndDate == null) {
    return {
      valid: 0,
      missing: 0,
      unavailable: 0,
      availableDays: 0,
      expectedDays: 0,
    }
  }

  const expectedDays = differenceInDaysInclusive(options.startDate, clampedEndDate)
  const recordsByDate = new Map(records.map((record) => [record.date, record]))
  let valid = 0
  let missing = 0
  let unavailable = 0

  for (const date of iterateClimateDates(options.startDate, clampedEndDate)) {
    if (
      options.availabilityStartDate != null &&
      compareClimateDates(date, options.availabilityStartDate) < 0
    ) {
      unavailable += 1
      continue
    }

    const record = recordsByDate.get(date)
    const value = record == null ? null : valueSelector(record)

    if (isFiniteNumber(value)) {
      valid += 1
    } else {
      missing += 1
    }
  }

  return {
    valid,
    missing,
    unavailable,
    availableDays: expectedDays - unavailable,
    expectedDays,
  }
}

export function calculateMonthlyCompleteness(
  year: number,
  month: number,
  records: readonly ClimateDay[],
  options: PeriodOptions = {},
): PeriodCoverage {
  const startDate = toClimateDateString(year, month, 1)
  const endDate = toClimateDateString(year, month, daysInMonth(year, month))

  return calculatePeriodCoverage(startDate, endDate, records, options)
}

export function calculateAnnualCompleteness(
  year: number,
  records: readonly ClimateDay[],
  options: PeriodOptions = {},
): PeriodCoverage {
  return calculatePeriodCoverage(
    toClimateDateString(year, 1, 1),
    toClimateDateString(year, 12, 31),
    records,
    options,
  )
}

export function calculateThresholdCounts(
  records: readonly ClimateDay[],
  heavyRainThresholdMm: number,
): ThresholdCounts {
  let atOrAbove20C = 0
  let atOrAbove25C = 0
  let atOrAbove30C = 0
  let frostDays = 0
  let rainDays = 0
  let heavyRainDays = 0

  for (const record of records) {
    if (isFiniteNumber(record.maxTempC)) {
      if (record.maxTempC >= 20) {
        atOrAbove20C += 1
      }

      if (record.maxTempC >= 25) {
        atOrAbove25C += 1
      }

      if (record.maxTempC >= 30) {
        atOrAbove30C += 1
      }
    }

    if (isFiniteNumber(record.minTempC) && record.minTempC < 0) {
      frostDays += 1
    }

    if (isFiniteNumber(record.rainfallMm)) {
      if (record.rainfallMm > RAIN_DAY_THRESHOLD_MM) {
        rainDays += 1
      }

      if (record.rainfallMm >= heavyRainThresholdMm) {
        heavyRainDays += 1
      }
    }
  }

  return {
    atOrAbove20C,
    atOrAbove25C,
    atOrAbove30C,
    frostDays,
    rainDays,
    heavyRainDays,
  }
}

export function calculateDryStreak(
  records: readonly ClimateDay[],
  options: PeriodOptions = {},
): StreakSummary {
  return calculateLongestStreak(
    records,
    (record) => isFiniteNumber(record.rainfallMm) && record.rainfallMm <= RAIN_DAY_THRESHOLD_MM,
    options,
  )
}

export function calculateWetStreak(
  records: readonly ClimateDay[],
  options: PeriodOptions = {},
): StreakSummary {
  return calculateLongestStreak(
    records,
    (record) => isFiniteNumber(record.rainfallMm) && record.rainfallMm > RAIN_DAY_THRESHOLD_MM,
    options,
  )
}

export function calculateWarmStreak(
  records: readonly ClimateDay[],
  thresholdC = 20,
  options: PeriodOptions = {},
): StreakSummary {
  return calculateLongestStreak(
    records,
    (record) => isFiniteNumber(record.maxTempC) && record.maxTempC >= thresholdC,
    options,
  )
}

export function calculateColdStreak(
  records: readonly ClimateDay[],
  thresholdC = 0,
  options: PeriodOptions = {},
): StreakSummary {
  return calculateLongestStreak(
    records,
    (record) => isFiniteNumber(record.minTempC) && record.minTempC < thresholdC,
    options,
  )
}

function calculatePeriodCoverage(
  startDate: ClimateDateString,
  endDate: ClimateDateString,
  records: readonly ClimateDay[],
  options: PeriodOptions,
): PeriodCoverage {
  const provisional = isProvisionalPeriod(startDate, endDate, options)
  const maxTemperature = toMetricCoverage(
    countValidAndMissingObservations(records, (record) => record.maxTempC, {
      startDate,
      endDate,
      ...options,
    }),
    provisional,
  )
  const minTemperature = toMetricCoverage(
    countValidAndMissingObservations(records, (record) => record.minTempC, {
      startDate,
      endDate,
      ...options,
    }),
    provisional,
  )
  const meanTemperature = toMetricCoverage(
    countValidAndMissingObservations(records, (record) => record.meanTempC, {
      startDate,
      endDate,
      ...options,
    }),
    provisional,
  )
  const rainfall = toMetricCoverage(
    countValidAndMissingObservations(records, (record) => record.rainfallMm, {
      startDate,
      endDate,
      availabilityStartDate: RAINFALL_START_DATE,
      ...options,
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

function calculateLongestStreak(
  records: readonly ClimateDay[],
  predicate: (record: ClimateDay) => boolean,
  options: PeriodOptions,
): StreakSummary {
  if (records.length === 0) {
    return emptyStreak()
  }

  const sortedRecords = [...records].sort((left, right) =>
    compareClimateDates(left.date, right.date),
  )
  const startDate = sortedRecords[0]?.date
  const endDate = sortedRecords.at(-1)?.date

  if (startDate == null || endDate == null) {
    return emptyStreak()
  }

  const clampedEndDate = getClampedPeriodEndDate(startDate, endDate, options)

  if (clampedEndDate == null) {
    return emptyStreak()
  }

  const recordsByDate = new Map(sortedRecords.map((record) => [record.date, record]))
  let bestDates: ClimateDateString[] = []
  let currentDates: ClimateDateString[] = []

  for (const date of iterateClimateDates(startDate, clampedEndDate)) {
    const record = recordsByDate.get(date)

    if (record != null && predicate(record)) {
      currentDates.push(date)

      if (currentDates.length > bestDates.length) {
        bestDates = [...currentDates]
      }
      continue
    }

    currentDates = []
  }

  if (bestDates.length === 0) {
    return emptyStreak()
  }

  return {
    length: bestDates.length,
    startDate: bestDates[0] ?? null,
    endDate: bestDates.at(-1) ?? null,
    dates: bestDates,
  }
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

function emptyStreak(): StreakSummary {
  return {
    length: 0,
    startDate: null,
    endDate: null,
    dates: [],
  }
}

function normaliseReferenceClimateDate(
  value: ClimateDateString | Date | undefined,
): ClimateDateString {
  if (typeof value === 'string') {
    parseIsoClimateDate(value)
    return value
  }

  return toEuropeLondonClimateDate(value ?? new Date())
}

function getClampedPeriodEndDate(
  startDate: ClimateDateString,
  endDate: ClimateDateString,
  options: PeriodOptions,
): ClimateDateString | null {
  const referenceDate = normaliseReferenceClimateDate(options.referenceDate)

  if (compareClimateDates(referenceDate, startDate) < 0) {
    return null
  }

  return compareClimateDates(referenceDate, endDate) < 0 ? referenceDate : endDate
}

function normaliseDateLike(value: ClimateDateString | string | Date): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.valueOf())) {
      throw new RangeError('Invalid date')
    }

    return value
  }

  if (CLIMATE_DATE_PATTERN.test(value)) {
    return toUtcDate(parseIsoClimateDate(value), 12)
  }

  const date = new Date(value)

  if (Number.isNaN(date.valueOf())) {
    throw new RangeError(`Invalid date: ${value}`)
  }

  return date
}

function toEuropeLondonClimateDate(date: Date): ClimateDateString {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: EUROPE_LONDON_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value

  if (year == null || month == null || day == null) {
    throw new RangeError('Unable to format Europe/London climate date')
  }

  return `${year}-${month}-${day}` as ClimateDateString
}

function compareClimateDates(
  left: ClimateDateString,
  right: ClimateDateString,
): number {
  return toUtcDate(parseIsoClimateDate(left)).valueOf() -
    toUtcDate(parseIsoClimateDate(right)).valueOf()
}

function differenceInDaysInclusive(
  startDate: ClimateDateString,
  endDate: ClimateDateString,
): number {
  return (
    (toUtcDate(parseIsoClimateDate(endDate)).valueOf() -
      toUtcDate(parseIsoClimateDate(startDate)).valueOf()) /
      MS_PER_DAY +
    1
  )
}

function* iterateClimateDates(
  startDate: ClimateDateString,
  endDate: ClimateDateString,
): Generator<ClimateDateString> {
  let cursor = toUtcDate(parseIsoClimateDate(startDate))
  const finalDate = toUtcDate(parseIsoClimateDate(endDate))

  while (cursor.valueOf() <= finalDate.valueOf()) {
    yield toClimateDateString(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth() + 1,
      cursor.getUTCDate(),
    )
    cursor = new Date(cursor.valueOf() + MS_PER_DAY)
  }
}

function toUtcDate(parts: ClimateDateParts, hour = 0): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour))
}

function toClimateDateString(
  year: number,
  month: number,
  day: number,
): ClimateDateString {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(
    2,
    '0',
  )}-${String(day).padStart(2, '0')}` as ClimateDateString
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value)
}
