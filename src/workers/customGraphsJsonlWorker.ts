/// <reference lib="webworker" />

import {
  MinuteArchiveParserCancelledError,
  parseMinuteArchiveJsonl,
} from '@/features/customGraphs/parser'

type CustomGraphWorkerMessage = { type: 'parse'; text: string } | { type: 'cancel' }

const workerScope = self as typeof self & {
  postMessage: (message: unknown) => void
  onmessage: ((event: MessageEvent<CustomGraphWorkerMessage>) => void) | null
}
let cancelled = false

workerScope.onmessage = async (event: MessageEvent<CustomGraphWorkerMessage>) => {
  if (event.data.type === 'cancel') {
    cancelled = true
    return
  }

  cancelled = false

  try {
    const result = await parseMinuteArchiveJsonl(event.data.text, {
      shouldCancel: () => cancelled,
      onChunk: (chunk) => {
        workerScope.postMessage({ type: 'partial', chunk })
      },
    })
    if (cancelled) {
      workerScope.postMessage({ type: 'cancelled' })
      return
    }
    workerScope.postMessage({ type: 'complete', result })
  } catch (error) {
    if (error instanceof MinuteArchiveParserCancelledError) {
      workerScope.postMessage({ type: 'cancelled' })
      return
    }
    workerScope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Worker parsing failed',
    })
  }
}

export {}
