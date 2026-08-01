import { describe, expect, it } from 'vitest'
import type { ClimateDateString } from '@/types/weather'
import {
  MINUTE_ARCHIVE_MAX_DAYS,
  buildArchiveDayPath,
  buildRequestPlan,
  createPresetRange,
  estimateMinuteArchiveFileCount,
  validateMinuteArchiveLimit,
} from '@/features/customGraphs/time'

describe('custom graph archive planning', () => {
  it('builds archive day URLs with zero-padded segments', () => {
    expect(buildArchiveDayPath('2026-08-01')).toBe('/archive/2026/08/01.jsonl')
    expect(buildArchiveDayPath('2024-01-09')).toBe('/archive/2024/01/09.jsonl')
  })

  it('estimates required archive files and comparison files without fetching unrelated years', () => {
    const plan = buildRequestPlan(
      {
        startDateTime: '2024-05-30T00:00',
        endDateTime: '2024-06-02T23:00',
      },
      'hourly',
      'previous-year',
    )

    expect(plan.minuteArchiveDates).toEqual([
      '2024-05-30',
      '2024-05-31',
      '2024-06-01',
      '2024-06-02',
    ])
    expect(plan.comparisonMinuteArchiveDates).toEqual([
      '2023-05-30',
      '2023-05-31',
      '2023-06-01',
      '2023-06-02',
    ])
    expect(plan.minuteFileCountEstimate).toBe(8)
  })

  it('limits minute archive requests to the documented day count', () => {
    expect(
      validateMinuteArchiveLimit(
        Array.from(
          { length: MINUTE_ARCHIVE_MAX_DAYS },
          (_, index) => `2024-06-0${index + 1}` as ClimateDateString,
        ),
      ),
    ).toBe(true)
    expect(
      validateMinuteArchiveLimit(
        Array.from(
          { length: MINUTE_ARCHIVE_MAX_DAYS + 1 },
          (_, index) => `2024-06-${String(index + 1).padStart(2, '0')}` as ClimateDateString,
        ),
      ),
    ).toBe(false)
  })

  it('only requests annual climate files for selected and comparison years', () => {
    const plan = buildRequestPlan(
      {
        startDateTime: '2024-12-20T00:00',
        endDateTime: '2025-01-10T23:00',
      },
      'daily',
      'previous-year',
    )

    expect(plan.annualYears).toEqual([2024, 2025])
    expect(plan.comparisonAnnualYears).toEqual([2023, 2024])
    expect(plan.minuteArchiveDates).toEqual([])
  })

  it('creates Europe/London preset ranges in start-before-end order', () => {
    const preset = createPresetRange('today', new Date('2026-08-01T12:00:00Z'))
    expect(estimateMinuteArchiveFileCount(preset)).toBeGreaterThanOrEqual(1)
    expect(preset.startDateTime < preset.endDateTime).toBe(true)
  })
})
