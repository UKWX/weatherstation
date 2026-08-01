import { PUBLIC_STATION_DATA_BASE_URL } from '@/config/weather'
import { buildArchiveDayPath } from '@/features/customGraphs/time'
import {
  MinuteArchiveParserCancelledError,
  parseMinuteArchiveJsonl,
} from '@/features/customGraphs/parser'
import type {
  ClimateDateString,
} from '@/types/weather'
import type {
  MinuteArchiveObservation,
  ParsedMinuteArchiveChunk,
  ParsedMinuteArchiveResult,
} from '@/features/customGraphs/types'

interface WorkerPartialMessage {
  readonly type: 'partial'
  readonly chunk: ParsedMinuteArchiveChunk
}

interface WorkerCompleteMessage {
  readonly type: 'complete'
  readonly result: ParsedMinuteArchiveResult
}

interface WorkerErrorMessage {
  readonly type: 'error'
  readonly message: string
}

interface WorkerCancelledMessage {
  readonly type: 'cancelled'
}

type WorkerMessage =
  | WorkerPartialMessage
  | WorkerCompleteMessage
  | WorkerErrorMessage
  | WorkerCancelledMessage

export async function fetchMinuteArchiveFile(
  date: ClimateDateString,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(`${PUBLIC_STATION_DATA_BASE_URL}${buildArchiveDayPath(date)}`, {
    signal,
  })

  if (!response.ok) {
    throw new Error(`Unable to load ${buildArchiveDayPath(date)} (${response.status})`)
  }

  return response.text()
}

export async function parseMinuteArchiveWithWorker(
  text: string,
  options: {
    readonly signal?: AbortSignal
    readonly onChunk?: (chunk: ParsedMinuteArchiveChunk) => void
  } = {},
): Promise<ParsedMinuteArchiveResult> {
  if (typeof Worker === 'undefined') {
    return parseMinuteArchiveJsonl(text, {
      signal: options.signal,
      onChunk: options.onChunk,
      yieldToEventLoop: true,
    })
  }

  const worker = new Worker(
    new URL('@/workers/customGraphsJsonlWorker.ts', import.meta.url),
    { type: 'module' },
  )

  return new Promise<ParsedMinuteArchiveResult>((resolve, reject) => {
    const handleAbort = () => {
      worker.postMessage({ type: 'cancel' })
      worker.terminate()
      reject(new MinuteArchiveParserCancelledError())
    }

    options.signal?.addEventListener('abort', handleAbort, { once: true })
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data
      if (message.type === 'partial') {
        options.onChunk?.(message.chunk)
        return
      }
      options.signal?.removeEventListener('abort', handleAbort)
      worker.terminate()
      if (message.type === 'complete') {
        resolve(message.result)
        return
      }
      if (message.type === 'cancelled') {
        reject(new MinuteArchiveParserCancelledError())
        return
      }
      reject(new Error(message.message))
    }

    worker.onerror = (event) => {
      options.signal?.removeEventListener('abort', handleAbort)
      worker.terminate()
      reject(event.error instanceof Error ? event.error : new Error('Worker parsing failed'))
    }

    worker.postMessage({ type: 'parse', text })
  })
}

export interface LoadedMinuteArchiveRange {
  readonly observations: readonly MinuteArchiveObservation[]
  readonly malformedLineCount: number
  readonly warningMessages: readonly string[]
}

export async function loadMinuteArchiveRange(
  dates: readonly ClimateDateString[],
  options: {
    readonly signal?: AbortSignal
    readonly onChunk?: (chunk: ParsedMinuteArchiveChunk) => void
    readonly onFileLoaded?: (date: ClimateDateString) => void
  } = {},
): Promise<LoadedMinuteArchiveRange> {
  const observations: MinuteArchiveObservation[] = []
  let malformedLineCount = 0
  const warningMessages: string[] = []

  for (const date of dates) {
    if (options.signal?.aborted) {
      throw new MinuteArchiveParserCancelledError()
    }

    const text = await fetchMinuteArchiveFile(date, options.signal)
    const parsed = await parseMinuteArchiveWithWorker(text, {
      signal: options.signal,
      onChunk: options.onChunk,
    })
    observations.push(...parsed.observations)
    malformedLineCount += parsed.malformedLineCount
    warningMessages.push(...parsed.warningMessages.map((message) => `${date}: ${message}`))
    options.onFileLoaded?.(date)
  }

  observations.sort((left, right) => left.timestampMs - right.timestampMs)
  return { observations, malformedLineCount, warningMessages }
}
