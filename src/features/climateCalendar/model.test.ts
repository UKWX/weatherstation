import { describe, expect, it } from 'vitest'
import {
  buildAnnualCalendarViews,
  buildOnThisDayData,
  getMetricLegend,
  getMonthDayKey,
  getMonthDayKeyFromDate,
} from '@/features/climateCalendar/model'
import type { AnnualClimatePayload, ClimateDateString, ClimateDay, DailyNormal } from '@/types/weather'

function makeRecord(date: ClimateDateString, overrides: Partial<ClimateDay> = {}): ClimateDay {
  return {
    date,
    maxTempC: 15,
    minTempC: 5,
    meanTempC: 10,
    rainfallMm: 1,
    status: 'finalised',
    ...overrides,
  }
}

function makeAnnual(year: number, records: ClimateDay[]): AnnualClimatePayload {
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

describe('climate calendar model', () => {
  it('maps climate dates to month-day keys and builds leap-year February correctly', () => {
    expect(getMonthDayKey(2, 29)).toBe('02-29')
    expect(getMonthDayKeyFromDate('2024-02-29')).toBe('02-29')

    const records = [
      makeRecord('2024-02-28'),
      makeRecord('2024-02-29', { maxTempC: 16 }),
    ]
    const normals: DailyNormal[] = [
      {
        dateKey: '02-29',
        month: 2,
        day: 29,
        normalMaxTempC: 8,
        normalMinTempC: 2,
        normalMeanTempC: 5,
        maxSampleCount: 8,
        minSampleCount: 8,
      },
    ]

    const february = buildAnnualCalendarViews(2024, records, normals, 'max')[1]
    expect(february?.days).toHaveLength(29)
    expect(february?.days.at(-1)?.date).toBe('2024-02-29')
  })

  it('uses distinct legends for temperature and rainfall metrics', () => {
    const records = [
      makeRecord('2024-01-01', { maxTempC: -2, rainfallMm: 0 }),
      makeRecord('2024-01-02', { maxTempC: 22, rainfallMm: 15 }),
    ]

    const temperatureLegend = getMetricLegend('max', records)
    const rainfallLegend = getMetricLegend('rainfall', records)

    expect(temperatureLegend.scaleDescription).toMatch(/temperature scale/i)
    expect(rainfallLegend.scaleDescription).toMatch(/dedicated depth bands/i)
    expect(rainfallLegend.buckets[0]?.shortLabel).toBe('Dry')
  })

  it('builds on-this-day ties and leap-day sample counts', () => {
    const normals: DailyNormal[] = []
    const data = buildOnThisDayData(
      2,
      29,
      [
        makeAnnual(2020, [makeRecord('2020-02-29', { maxTempC: 12, meanTempC: 8, rainfallMm: 0 })]),
        makeAnnual(2024, [makeRecord('2024-02-29', { maxTempC: 12, meanTempC: 10, rainfallMm: 4 })]),
      ],
      normals,
    )

    expect(data.leapDay).toBe(true)
    expect(data.sampleSize).toBe(2)
    expect(data.highestMax?.years).toEqual([2020, 2024])
  })
})
