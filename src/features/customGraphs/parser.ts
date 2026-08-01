import type {
  MinuteArchiveObservation,
  ParsedMinuteArchiveChunk,
  ParsedMinuteArchiveResult,
} from '@/features/customGraphs/types'

export class MinuteArchiveParserCancelledError extends Error {
  constructor() {
    super('Minute archive parsing cancelled')
    this.name = 'MinuteArchiveParserCancelledError'
  }
}

interface ParseMinuteArchiveOptions {
  readonly batchSize?: number
  readonly signal?: AbortSignal
  readonly shouldCancel?: () => boolean
  readonly onChunk?: (chunk: ParsedMinuteArchiveChunk) => void | Promise<void>
  readonly yieldToEventLoop?: boolean
}

function isFiniteNullableNumber(value: unknown): value is number | null {
  return value == null || (typeof value === 'number' && Number.isFinite(value))
}

function parseTimestamp(value: unknown): { iso: string; timestampMs: number } {
  if (typeof value !== 'string') {
    throw new TypeError('Expected observation_time_utc string')
  }

  const timestampMs = new Date(value).valueOf()
  if (Number.isNaN(timestampMs)) {
    throw new TypeError('Expected valid observation_time_utc string')
  }

  return { iso: value, timestampMs }
}

function adaptMinuteArchiveRecord(value: unknown): MinuteArchiveObservation {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Expected object line')
  }

  const record = value as Record<string, unknown>
  const timestamp = parseTimestamp(record.observation_time_utc)
  const numericKeys = [
    'temperature_c',
    'humidity_percent',
    'pressure_hpa',
    'wind_speed_mph',
    'wind_gust_mph',
    'rain_rate_mm_per_hour',
    'rain_today_mm',
  ] as const

  for (const key of numericKeys) {
    if (!isFiniteNullableNumber(record[key])) {
      throw new TypeError(`Expected ${key} to be a finite number or null`)
    }
  }

  return {
    observationTimeUtc: timestamp.iso,
    timestampMs: timestamp.timestampMs,
    temperatureC: (record.temperature_c as number | null | undefined) ?? null,
    humidityPercent: (record.humidity_percent as number | null | undefined) ?? null,
    pressureHpa: (record.pressure_hpa as number | null | undefined) ?? null,
    windSpeedMph: (record.wind_speed_mph as number | null | undefined) ?? null,
    windGustMph: (record.wind_gust_mph as number | null | undefined) ?? null,
    rainRateMmPerHour: (record.rain_rate_mm_per_hour as number | null | undefined) ?? null,
    rainTodayMm: (record.rain_today_mm as number | null | undefined) ?? null,
  }
}

function ensureNotCancelled(options: ParseMinuteArchiveOptions): void {
  if (options.signal?.aborted || options.shouldCancel?.() === true) {
    throw new MinuteArchiveParserCancelledError()
  }
}

function buildWarningMessages(malformedLineCount: number): string[] {
  if (malformedLineCount === 0) {
    return []
  }

  return [
    `${malformedLineCount} malformed JSONL line${malformedLineCount === 1 ? '' : 's'} were ignored while valid rows were kept.`,
  ]
}

async function yieldToEventLoop(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

export async function parseMinuteArchiveJsonl(
  text: string,
  options: ParseMinuteArchiveOptions = {},
): Promise<ParsedMinuteArchiveResult> {
  const observations: MinuteArchiveObservation[] = []
  const batch: MinuteArchiveObservation[] = []
  const batchSize = Math.max(1, options.batchSize ?? 250)
  let malformedLineCount = 0
  let processedLineCount = 0
  let lineStart = 0

  for (let index = 0; index <= text.length; index += 1) {
    if (index < text.length && text[index] !== '\n') {
      continue
    }

    ensureNotCancelled(options)
    const rawLine = text.slice(lineStart, index).replace(/\r$/, '')
    lineStart = index + 1
    const line = rawLine.trim()

    if (line.length === 0) {
      continue
    }

    processedLineCount += 1
    try {
      const parsed = JSON.parse(line) as unknown
      const observation = adaptMinuteArchiveRecord(parsed)
      observations.push(observation)
      batch.push(observation)
    } catch {
      malformedLineCount += 1
    }

    if (processedLineCount % batchSize === 0) {
      if (batch.length > 0) {
        await options.onChunk?.({
          observations: [...batch],
          malformedLineCount,
          processedLineCount,
        })
        batch.length = 0
      }
      if (options.yieldToEventLoop) {
        await yieldToEventLoop()
      }
    }
  }

  ensureNotCancelled(options)

  if (batch.length > 0) {
    await options.onChunk?.({
      observations: [...batch],
      malformedLineCount,
      processedLineCount,
    })
  }

  observations.sort((left, right) => left.timestampMs - right.timestampMs)

  return {
    observations,
    malformedLineCount,
    processedLineCount,
    warningMessages: buildWarningMessages(malformedLineCount),
  }
}
