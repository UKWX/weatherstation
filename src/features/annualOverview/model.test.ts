import { describe, expect, it } from 'vitest'
import {
  buildAnnualOverviewDataset,
  buildSelectableYears,
  selectNormalBaselineYears,
} from '@/features/annualOverview/model'
import type { AnnualClimatePayload, ClimateDateString, ClimateDay } from '@/types/weather'

function makeRecord(
  date: ClimateDateString,
  overrides: Partial<ClimateDay> = {},
): ClimateDay {
  return {
    date,
    maxTempC: 10,
    minTempC: 2,
    meanTempC: 6,
    rainfallMm: null,
    status: 'finalised',
    ...overrides,
  }
}

function makePayload(year: number, records: readonly ClimateDay[]): AnnualClimatePayload {
  return {
    station: 'Wakefield',
    year,
    generatedAtUtc: null,
    complete: true,
    through: `${year}-12-31` as ClimateDateString,
    observationCount: records.length,
    units: { temperature: '°C', rainfall: 'mm', pressure: null, wind: null },
    records,
  }
}

describe('buildSelectableYears', () => {
  it('creates a full inclusive year range', () => {
    const years = buildSelectableYears(1995, 1998)
    expect(years).toEqual([1995, 1996, 1997, 1998])
  })
})

describe('selectNormalBaselineYears', () => {
  it('uses the trailing 30 previous years when available', () => {
    const years = Array.from({ length: 31 }, (_, index) => 1995 + index)
    expect(selectNormalBaselineYears(2026, years)).toEqual(
      Array.from({ length: 30 }, (_, index) => 1996 + index),
    )
  })
})

describe('buildAnnualOverviewDataset', () => {
  it('keeps leap day for leap years and leaves future dates empty', () => {
    const dataset = buildAnnualOverviewDataset({
      year: 2000,
      selectedYearRecords: [
        makeRecord('2000-02-28'),
        makeRecord('2000-02-29', { maxTempC: 11, minTempC: 3, meanTempC: 7 }),
        makeRecord('2000-03-01'),
      ],
      historicalPayloads: [makePayload(1999, [makeRecord('1999-02-28'), makeRecord('1999-03-01')])],
    })

    expect(dataset.days.find((day) => day.date === '2000-02-29')).toBeDefined()
    expect(dataset.days.at(-1)?.date).toBe('2000-12-31')
    expect(dataset.days.find((day) => day.date === '2000-12-31')?.actualMaxC).toBeNull()
  })

  it('detects new daily records against earlier years only', () => {
    const dataset = buildAnnualOverviewDataset({
      year: 2026,
      selectedYearRecords: [makeRecord('2026-03-02', { maxTempC: 18, minTempC: 9, meanTempC: 13.5 })],
      historicalPayloads: [
        makePayload(2024, [makeRecord('2024-03-02', { maxTempC: 14, minTempC: 5 })]),
        makePayload(2025, [makeRecord('2025-03-02', { maxTempC: 15, minTempC: 6 })]),
        makePayload(2026, [makeRecord('2026-03-02', { maxTempC: 18, minTempC: 9 })]),
      ],
    })

    const day = dataset.days.find((entry) => entry.date === '2026-03-02')
    expect(day?.recordFlags).toEqual(['record-high-max', 'record-high-min'])
    expect(dataset.recordEvents).toHaveLength(2)
    expect(dataset.recordEvents[0]?.previousRecordYears).toEqual([2025])
    expect(dataset.normalPeriodLabel).toBe('2024–2025')
  })
})
