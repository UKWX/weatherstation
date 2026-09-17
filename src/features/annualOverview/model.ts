import {
  buildCalendarDateExtremeSummaries,
  type CalendarDateExtremeSummary,
} from '@/features/annualCharts/calculations'
import {
  calculateDailyMeanTemperature,
  calculateSafeAverage,
  compareClimateDates,
  daysInMonth,
  parseIsoClimateDate,
  toClimateDateString,
} from '@/lib/climate'
import type { AnnualClimatePayload, ClimateDateString, ClimateDay } from '@/types/weather'

export type AnnualOverviewRecordType =
  | 'record-high-max'
  | 'record-low-max'
  | 'record-high-min'
  | 'record-low-min'

export interface AnnualOverviewDay {
  readonly index: number
  readonly date: ClimateDateString
  readonly dateKey: string
  readonly month: number
  readonly day: number
  readonly timestamp: number
  readonly actualMaxC: number | null
  readonly actualMinC: number | null
  readonly actualMeanC: number | null
  readonly rollingMeanC: number | null
  readonly normalMaxC: number | null
  readonly normalMinC: number | null
  readonly recordHighMaxC: number | null
  readonly recordLowMaxC: number | null
  readonly recordHighMinC: number | null
  readonly recordLowMinC: number | null
  readonly recordFlags: readonly AnnualOverviewRecordType[]
}

export interface AnnualOverviewRecordEvent {
  readonly date: ClimateDateString
  readonly type: AnnualOverviewRecordType
  readonly currentValueC: number
  readonly previousRecordC: number
  readonly marginC: number
}

export interface AnnualOverviewDataset {
  readonly days: readonly AnnualOverviewDay[]
  readonly recordEvents: readonly AnnualOverviewRecordEvent[]
  readonly loadedHistoricalYears: readonly number[]
  readonly latestObservedDate: ClimateDateString | null
  readonly normalPeriodLabel: string
  readonly normalPeriodYears: readonly number[]
}

export function buildAnnualOverviewDataset(input: {
  readonly year: number
  readonly selectedYearRecords: readonly ClimateDay[]
  readonly historicalPayloads: readonly AnnualClimatePayload[]
}): AnnualOverviewDataset {
  const selectedByDate = new Map(
    input.selectedYearRecords.map((record) => [record.date, record] as const),
  )
  const historicalPayloads = [...input.historicalPayloads].sort((left, right) => left.year - right.year)
  const normalPeriodYears = selectNormalBaselineYears(
    input.year,
    historicalPayloads.map((payload) => payload.year),
  )
  const normalPayloads = historicalPayloads.filter((payload) => normalPeriodYears.includes(payload.year))
  const normalsByKey = buildDynamicNormalsByDateKey(normalPayloads)
  const recordBaselinePayloads = historicalPayloads.filter((payload) => payload.year < input.year)
  const recordBaselineByKey = buildCalendarDateExtremeSummaries(recordBaselinePayloads)

  const latestObservedDate = [...input.selectedYearRecords]
    .filter((record) => record.maxTempC != null || record.minTempC != null)
    .sort((left, right) => compareClimateDates(left.date, right.date))
    .at(-1)?.date ?? null

  const provisionalDays: Omit<AnnualOverviewDay, 'rollingMeanC'>[] = []

  for (let month = 1; month <= 12; month += 1) {
    const count = daysInMonth(input.year, month)
    for (let day = 1; day <= count; day += 1) {
      const date = toClimateDateString(input.year, month, day)
      const dateKey = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const record = selectedByDate.get(date) ?? null
      const normal = normalsByKey.get(dateKey) ?? null
      const baseline = recordBaselineByKey.get(dateKey)
      const actualMeanC =
        record?.meanTempC ?? calculateDailyMeanTemperature(record?.maxTempC, record?.minTempC)
      const recordFlags = detectRecordFlags(record, baseline)

      provisionalDays.push({
        index: provisionalDays.length,
        date,
        dateKey,
        month,
        day,
        timestamp: Date.UTC(input.year, month - 1, day, 12),
        actualMaxC: record?.maxTempC ?? null,
        actualMinC: record?.minTempC ?? null,
        actualMeanC,
        normalMaxC: normal?.normalMaxC ?? null,
        normalMinC: normal?.normalMinC ?? null,
        recordHighMaxC: baseline?.highestMax.value ?? null,
        recordLowMaxC: baseline?.lowestMax.value ?? null,
        recordHighMinC: baseline?.highestMin.value ?? null,
        recordLowMinC: baseline?.lowestMin.value ?? null,
        recordFlags,
      })
    }
  }

  const days = provisionalDays.map((day, index, allDays) => ({
    ...day,
    rollingMeanC: calculateRollingMean(allDays, index),
  }))

  return {
    days,
    recordEvents: days.flatMap((day) => buildRecordEventsForDay(day)),
    loadedHistoricalYears: historicalPayloads.map((payload) => payload.year),
    latestObservedDate,
    normalPeriodLabel: formatYearRangeLabel(normalPeriodYears),
    normalPeriodYears,
  }
}

export function buildSelectableYears(startYear: number, endYear: number): readonly number[] {
  if (endYear < startYear) {
    return []
  }

  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index)
}

export function selectNormalBaselineYears(
  year: number,
  availableYears: readonly number[],
  maxYears = 30,
): readonly number[] {
  return [...availableYears]
    .filter((candidateYear) => candidateYear < year)
    .sort((left, right) => left - right)
    .slice(-maxYears)
}

function detectRecordFlags(
  record: ClimateDay | null,
  baseline: CalendarDateExtremeSummary | undefined,
): readonly AnnualOverviewRecordType[] {
  if (record == null) {
    return []
  }

  const flags: AnnualOverviewRecordType[] = []

  if (
    record.maxTempC != null &&
    baseline?.highestMax.value != null &&
    record.maxTempC > baseline.highestMax.value
  ) {
    flags.push('record-high-max')
  }
  if (
    record.maxTempC != null &&
    baseline?.lowestMax.value != null &&
    record.maxTempC < baseline.lowestMax.value
  ) {
    flags.push('record-low-max')
  }
  if (
    record.minTempC != null &&
    baseline?.highestMin.value != null &&
    record.minTempC > baseline.highestMin.value
  ) {
    flags.push('record-high-min')
  }
  if (
    record.minTempC != null &&
    baseline?.lowestMin.value != null &&
    record.minTempC < baseline.lowestMin.value
  ) {
    flags.push('record-low-min')
  }

  return flags
}

function calculateRollingMean(
  days: readonly Omit<AnnualOverviewDay, 'rollingMeanC'>[],
  index: number,
): number | null {
  if (days[index]?.actualMeanC == null) {
    return null
  }

  const window = days.slice(Math.max(0, index - 6), index + 1)
  const values = window.map((day) => day.actualMeanC)
  const finiteValues = values.filter((value): value is number => value != null)

  if (finiteValues.length < 3) {
    return null
  }

  return calculateSafeAverage(values)
}

function buildRecordEventsForDay(day: AnnualOverviewDay): readonly AnnualOverviewRecordEvent[] {
  return day.recordFlags
    .map((type) => {
      const isMaxRecord = type === 'record-high-max' || type === 'record-low-max'
      const currentValueC = isMaxRecord ? day.actualMaxC : day.actualMinC
      const previousRecordC =
        type === 'record-high-max'
          ? day.recordHighMaxC
          : type === 'record-low-max'
            ? day.recordLowMaxC
            : type === 'record-high-min'
              ? day.recordHighMinC
              : day.recordLowMinC

      if (currentValueC == null || previousRecordC == null) {
        return null
      }

      return {
        date: day.date,
        type,
        currentValueC,
        previousRecordC,
        marginC:
          type === 'record-low-max' || type === 'record-low-min'
            ? previousRecordC - currentValueC
            : currentValueC - previousRecordC,
      }
    })
    .filter((event): event is AnnualOverviewRecordEvent => event != null)
}

function buildDynamicNormalsByDateKey(
  payloads: readonly AnnualClimatePayload[],
): ReadonlyMap<string, { normalMaxC: number | null; normalMinC: number | null }> {
  const valuesByKey = new Map<
    string,
    {
      maxValues: number[]
      minValues: number[]
    }
  >()

  for (const payload of payloads) {
    for (const record of payload.records) {
      const key = getAnnualOverviewDateKey(record.date)
      const existing = valuesByKey.get(key) ?? { maxValues: [], minValues: [] }
      if (record.maxTempC != null) {
        existing.maxValues.push(record.maxTempC)
      }
      if (record.minTempC != null) {
        existing.minValues.push(record.minTempC)
      }
      valuesByKey.set(key, existing)
    }
  }

  return new Map(
    [...valuesByKey.entries()].map(([key, value]) => [
      key,
      {
        normalMaxC: calculateSafeAverage(value.maxValues),
        normalMinC: calculateSafeAverage(value.minValues),
      },
    ]),
  )
}

function formatYearRangeLabel(years: readonly number[]): string {
  if (years.length === 0) {
    return 'No baseline years available'
  }

  const start = years[0]
  const end = years[years.length - 1]
  return start === end ? String(start) : `${start}–${end}`
}

export function getAnnualOverviewRecordLabel(type: AnnualOverviewRecordType): string {
  switch (type) {
    case 'record-high-max':
      return 'Record high maximum'
    case 'record-low-max':
      return 'Record low maximum'
    case 'record-high-min':
      return 'Record high minimum'
    case 'record-low-min':
      return 'Record low minimum'
  }
}

export function getAnnualOverviewRecordColor(type: AnnualOverviewRecordType): string {
  switch (type) {
    case 'record-high-max':
      return '#a3241d'
    case 'record-low-max':
      return '#0d7d7d'
    case 'record-high-min':
      return '#b8860b'
    case 'record-low-min':
      return '#1d3f8a'
  }
}

export function getAnnualOverviewDateKey(date: ClimateDateString): string {
  const parts = parseIsoClimateDate(date)
  return `${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}
