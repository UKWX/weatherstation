import { EUROPE_LONDON_TIMEZONE } from '@/config/weather'
import {
  getEuropeLondonClimateDate,
  parseIsoClimateDate,
  toClimateDateString,
} from '@/lib/climate'
import type {
  ClimateDateString,
} from '@/types/weather'
import type {
  CustomGraphComparisonMode,
  CustomGraphRequestPlan,
  CustomGraphRequestRange,
  CustomGraphResolution,
} from '@/features/customGraphs/types'

export const MINUTE_ARCHIVE_MAX_DAYS = 7

const LONDON_PARTS_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: EUROPE_LONDON_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'shortOffset',
})

const DISPLAY_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: EUROPE_LONDON_TIMEZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const DISPLAY_BUCKET_FORMATTERS: Record<CustomGraphResolution, Intl.DateTimeFormat> = {
  minute: new Intl.DateTimeFormat('en-GB', {
    timeZone: EUROPE_LONDON_TIMEZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }),
  hourly: new Intl.DateTimeFormat('en-GB', {
    timeZone: EUROPE_LONDON_TIMEZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }),
  daily: new Intl.DateTimeFormat('en-GB', {
    timeZone: EUROPE_LONDON_TIMEZONE,
    day: '2-digit',
    month: 'short',
  }),
  monthly: new Intl.DateTimeFormat('en-GB', {
    timeZone: EUROPE_LONDON_TIMEZONE,
    month: 'short',
    year: 'numeric',
  }),
  annual: new Intl.DateTimeFormat('en-GB', {
    timeZone: EUROPE_LONDON_TIMEZONE,
    year: 'numeric',
  }),
}

export type PresetKey =
  | 'last-hour'
  | 'last-3-hours'
  | 'last-6-hours'
  | 'today'
  | 'last-7-days'
  | 'month-to-date'
  | 'year-to-date'

interface LondonDateTimeParts {
  readonly year: number
  readonly month: number
  readonly day: number
  readonly hour: number
  readonly minute: number
  readonly second: number
  readonly offsetMinutes: number
}

function parseOffsetMinutes(value: string): number {
  if (value === 'GMT' || value === 'UTC') {
    return 0
  }

  const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(value)
  if (!match) {
    return 0
  }

  const sign = match[1] === '-' ? -1 : 1
  const hours = Number(match[2])
  const minutes = Number(match[3] ?? '0')
  return sign * (hours * 60 + minutes)
}

export function getLondonDateTimeParts(date: Date): LondonDateTimeParts {
  const parts = LONDON_PARTS_FORMATTER.formatToParts(date)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  const day = Number(parts.find((part) => part.type === 'day')?.value)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value)
  const second = Number(parts.find((part) => part.type === 'second')?.value)
  const offsetMinutes = parseOffsetMinutes(
    parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT',
  )

  return { year, month, day, hour, minute, second, offsetMinutes }
}

function formatPartsToInput(parts: Pick<LondonDateTimeParts, 'year' | 'month' | 'day' | 'hour' | 'minute'>): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
}

export function formatLondonDateTimeInput(date: Date): string {
  const parts = getLondonDateTimeParts(date)
  return formatPartsToInput(parts)
}

function localPartsMatch(input: string, timestampMs: number): boolean {
  return formatLondonDateTimeInput(new Date(timestampMs)) === input
}

export function parseLondonDateTimeInput(input: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(input)
  if (!match) {
    throw new RangeError(`Invalid Europe/London date-time: ${input}`)
  }

  const [, yearText, monthText, dayText, hourText, minuteText] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)

  let candidate = Date.UTC(year, month - 1, day, hour, minute)
  for (let index = 0; index < 4; index += 1) {
    const offsetMinutes = getLondonDateTimeParts(new Date(candidate)).offsetMinutes
    const adjusted = Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * 60_000
    if (adjusted === candidate) {
      break
    }
    candidate = adjusted
  }

  if (localPartsMatch(input, candidate)) {
    return candidate
  }

  for (const offsetMinutes of [-120, -60, 60, 120]) {
    const alternative = candidate + offsetMinutes * 60_000
    if (localPartsMatch(input, alternative)) {
      return alternative
    }
  }

  throw new RangeError(`Invalid Europe/London date-time: ${input}`)
}

export function formatLondonDateTimeDisplay(timestampMs: number): string {
  return DISPLAY_DATE_TIME_FORMATTER.format(new Date(timestampMs))
}

export function formatBucketLabel(timestampMs: number, resolution: CustomGraphResolution): string {
  return DISPLAY_BUCKET_FORMATTERS[resolution].format(new Date(timestampMs))
}

export function floorMinuteOrHourBucket(timestampMs: number, resolution: 'minute' | 'hourly'): number {
  const parts = getLondonDateTimeParts(new Date(timestampMs))
  const subHourMs = parts.minute * 60_000 + parts.second * 1_000 + (timestampMs % 1_000)
  if (resolution === 'minute') {
    return timestampMs - (parts.second * 1_000 + (timestampMs % 1_000))
  }
  return timestampMs - subHourMs
}

export function enumerateMinuteOrHourBuckets(
  startMs: number,
  endMs: number,
  resolution: 'minute' | 'hourly',
): number[] {
  const stepMs = resolution === 'minute' ? 60_000 : 3_600_000
  const buckets: number[] = []
  for (
    let bucketMs = floorMinuteOrHourBucket(startMs, resolution);
    bucketMs <= endMs;
    bucketMs += stepMs
  ) {
    buckets.push(bucketMs)
  }
  return buckets
}

export function enumerateClimateDates(
  startDate: ClimateDateString,
  endDate: ClimateDateString,
): ClimateDateString[] {
  const results: ClimateDateString[] = []
  const startParts = parseIsoClimateDate(startDate)
  const endParts = parseIsoClimateDate(endDate)
  let cursor = Date.UTC(startParts.year, startParts.month - 1, startParts.day)
  const finalDate = Date.UTC(endParts.year, endParts.month - 1, endParts.day)

  while (cursor <= finalDate) {
    const date = new Date(cursor)
    results.push(
      toClimateDateString(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
      ),
    )
    cursor += 86_400_000
  }

  return results
}

export function getLondonClimateDateForTimestamp(timestampMs: number): ClimateDateString {
  return getEuropeLondonClimateDate(new Date(timestampMs))
}

export function estimateMinuteArchiveFileCount(range: CustomGraphRequestRange): number {
  const startMs = parseLondonDateTimeInput(range.startDateTime)
  const endMs = parseLondonDateTimeInput(range.endDateTime)
  const startDate = getLondonClimateDateForTimestamp(startMs)
  const endDate = getLondonClimateDateForTimestamp(endMs)
  return enumerateClimateDates(startDate, endDate).length
}

export function isMinuteArchiveResolution(resolution: CustomGraphResolution): boolean {
  return resolution === 'minute' || resolution === 'hourly'
}

function shiftClimateDateYears(date: ClimateDateString, yearDelta: number): ClimateDateString {
  const parts = parseIsoClimateDate(date)
  const candidate = new Date(Date.UTC(parts.year + yearDelta, parts.month - 1, parts.day))
  if (candidate.getUTCMonth() !== parts.month - 1) {
    return toClimateDateString(parts.year + yearDelta, parts.month, parts.day - 1)
  }
  return toClimateDateString(parts.year + yearDelta, parts.month, parts.day)
}

function shiftRangeYears(
  startMs: number,
  endMs: number,
  years: number,
): { startMs: number; endMs: number } {
  const startParts = getLondonDateTimeParts(new Date(startMs))
  const endParts = getLondonDateTimeParts(new Date(endMs))
  return {
    startMs: parseLondonDateTimeInput(
      formatPartsToInput({
        year: startParts.year + years,
        month: startParts.month,
        day: startParts.day,
        hour: startParts.hour,
        minute: startParts.minute,
      }),
    ),
    endMs: parseLondonDateTimeInput(
      formatPartsToInput({
        year: endParts.year + years,
        month: endParts.month,
        day: endParts.day,
        hour: endParts.hour,
        minute: endParts.minute,
      }),
    ),
  }
}

function yearsForRange(startDate: ClimateDateString, endDate: ClimateDateString): number[] {
  const startYear = parseIsoClimateDate(startDate).year
  const endYear = parseIsoClimateDate(endDate).year
  return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index)
}

export function buildRequestPlan(
  range: CustomGraphRequestRange,
  resolution: CustomGraphResolution,
  comparisonMode: CustomGraphComparisonMode,
): CustomGraphRequestPlan {
  const startMs = parseLondonDateTimeInput(range.startDateTime)
  const endMs = parseLondonDateTimeInput(range.endDateTime)
  if (endMs < startMs) {
    throw new RangeError('End date/time must be after the start date/time')
  }

  const startDate = getLondonClimateDateForTimestamp(startMs)
  const endDate = getLondonClimateDateForTimestamp(endMs)
  const minuteArchiveDates = isMinuteArchiveResolution(resolution)
    ? enumerateClimateDates(startDate, endDate)
    : []
  const annualYears = isMinuteArchiveResolution(resolution) ? [] : yearsForRange(startDate, endDate)

  let comparisonRange: { startMs: number; endMs: number } | null = null
  let comparisonMinuteArchiveDates: ClimateDateString[] = []
  let comparisonAnnualYears: number[] = []

  if (comparisonMode === 'previous-period') {
    const durationMs = endMs - startMs
    comparisonRange = {
      startMs: startMs - durationMs - 60_000,
      endMs: endMs - durationMs - 60_000,
    }
  } else if (comparisonMode === 'previous-year') {
    comparisonRange = shiftRangeYears(startMs, endMs, -1)
  }

  if (comparisonRange != null) {
    const comparisonStartDate = getLondonClimateDateForTimestamp(comparisonRange.startMs)
    const comparisonEndDate = getLondonClimateDateForTimestamp(comparisonRange.endMs)
    if (isMinuteArchiveResolution(resolution)) {
      comparisonMinuteArchiveDates = enumerateClimateDates(comparisonStartDate, comparisonEndDate)
    } else {
      comparisonAnnualYears = yearsForRange(comparisonStartDate, comparisonEndDate)
    }
  }

  return {
    primaryRange: { startMs, endMs },
    comparisonRange,
    minuteArchiveDates,
    comparisonMinuteArchiveDates,
    annualYears,
    comparisonAnnualYears,
    minuteFileCountEstimate: minuteArchiveDates.length + comparisonMinuteArchiveDates.length,
    usesMinuteArchive: isMinuteArchiveResolution(resolution),
  }
}

export function validateMinuteArchiveLimit(dates: readonly ClimateDateString[]): boolean {
  return dates.length <= MINUTE_ARCHIVE_MAX_DAYS
}

export function buildArchiveDayPath(date: ClimateDateString): string {
  const { year, month, day } = parseIsoClimateDate(date)
  return `/archive/${String(year).padStart(4, '0')}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}.jsonl`
}

export function createPresetRange(preset: PresetKey, now: Date = new Date()): CustomGraphRequestRange {
  const current = now.valueOf()
  if (preset === 'last-hour') {
    return {
      startDateTime: formatLondonDateTimeInput(new Date(current - 3_600_000)),
      endDateTime: formatLondonDateTimeInput(now),
    }
  }
  if (preset === 'last-3-hours') {
    return {
      startDateTime: formatLondonDateTimeInput(new Date(current - 10_800_000)),
      endDateTime: formatLondonDateTimeInput(now),
    }
  }
  if (preset === 'last-6-hours') {
    return {
      startDateTime: formatLondonDateTimeInput(new Date(current - 21_600_000)),
      endDateTime: formatLondonDateTimeInput(now),
    }
  }

  const todayParts = getLondonDateTimeParts(now)
  const todayStart = parseLondonDateTimeInput(
    formatPartsToInput({
      year: todayParts.year,
      month: todayParts.month,
      day: todayParts.day,
      hour: 0,
      minute: 0,
    }),
  )

  if (preset === 'today') {
    return {
      startDateTime: formatLondonDateTimeInput(new Date(todayStart)),
      endDateTime: formatLondonDateTimeInput(now),
    }
  }
  if (preset === 'last-7-days') {
    return {
      startDateTime: formatLondonDateTimeInput(new Date(current - 6 * 86_400_000)),
      endDateTime: formatLondonDateTimeInput(now),
    }
  }
  if (preset === 'month-to-date') {
    const monthStart = parseLondonDateTimeInput(
      formatPartsToInput({
        year: todayParts.year,
        month: todayParts.month,
        day: 1,
        hour: 0,
        minute: 0,
      }),
    )
    return {
      startDateTime: formatLondonDateTimeInput(new Date(monthStart)),
      endDateTime: formatLondonDateTimeInput(now),
    }
  }

  const yearStart = parseLondonDateTimeInput(
    formatPartsToInput({
      year: todayParts.year,
      month: 1,
      day: 1,
      hour: 0,
      minute: 0,
    }),
  )

  return {
    startDateTime: formatLondonDateTimeInput(new Date(yearStart)),
    endDateTime: formatLondonDateTimeInput(now),
  }
}

export function shiftClimateRangeByComparisonMode(
  startDate: ClimateDateString,
  endDate: ClimateDateString,
  comparisonMode: CustomGraphComparisonMode,
): { startDate: ClimateDateString; endDate: ClimateDateString } | null {
  if (comparisonMode === 'none') {
    return null
  }

  if (comparisonMode === 'previous-year') {
    return {
      startDate: shiftClimateDateYears(startDate, -1),
      endDate: shiftClimateDateYears(endDate, -1),
    }
  }

  const startParts = parseIsoClimateDate(startDate)
  const duration = enumerateClimateDates(startDate, endDate).length
  const comparisonEnd = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day) - 86_400_000)
  const comparisonStart = new Date(comparisonEnd.valueOf() - (duration - 1) * 86_400_000)
  return {
    startDate: toClimateDateString(
      comparisonStart.getUTCFullYear(),
      comparisonStart.getUTCMonth() + 1,
      comparisonStart.getUTCDate(),
    ),
    endDate: toClimateDateString(
      comparisonEnd.getUTCFullYear(),
      comparisonEnd.getUTCMonth() + 1,
      comparisonEnd.getUTCDate(),
    ),
  }
}
