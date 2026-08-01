import { describe, expect, it } from 'vitest'
import {
  MinuteArchiveParserCancelledError,
  parseMinuteArchiveJsonl,
} from '@/features/customGraphs/parser'

const VALID_LINE = JSON.stringify({
  observation_time_utc: '2026-08-01T10:00:00Z',
  temperature_c: 18.4,
  humidity_percent: 70,
  pressure_hpa: 1008.5,
  wind_speed_mph: 8.2,
  wind_gust_mph: 12.4,
  rain_rate_mm_per_hour: 0,
  rain_today_mm: 0.4,
})

describe('minute archive parser', () => {
  it('parses valid rows, ignores blanks and counts malformed lines', async () => {
    const result = await parseMinuteArchiveJsonl(`\n${VALID_LINE}\nnot-json\n\n${VALID_LINE}\n`)

    expect(result.observations).toHaveLength(2)
    expect(result.malformedLineCount).toBe(1)
    expect(result.warningMessages[0]).toMatch(/1 malformed JSONL line/)
  })

  it('reports partial chunks before completion', async () => {
    const chunks: number[] = []
    const result = await parseMinuteArchiveJsonl(`${VALID_LINE}\n${VALID_LINE}\n`, {
      batchSize: 1,
      onChunk: (chunk) => {
        chunks.push(chunk.observations.length)
      },
    })

    expect(chunks).toEqual([1, 1])
    expect(result.processedLineCount).toBe(2)
  })

  it('supports cancellation during incremental parsing', async () => {
    const controller = new AbortController()
    const promise = parseMinuteArchiveJsonl(`${VALID_LINE}\n${VALID_LINE}\n${VALID_LINE}\n`, {
      batchSize: 1,
      signal: controller.signal,
      onChunk: () => {
        controller.abort()
      },
      yieldToEventLoop: true,
    })

    await expect(promise).rejects.toBeInstanceOf(MinuteArchiveParserCancelledError)
  })
})
