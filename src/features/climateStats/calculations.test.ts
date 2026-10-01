import { describe, expect, it } from 'vitest'
import {
  buildDailyRainfallStats,
  buildDailyTemperatureStats,
  buildMonthlyRainfallStats,
  buildMonthlyTemperatureStats,
  buildMonthlyThresholdStats,
  buildTemperatureRangeStats,
  expectedDaysForMonth,
} from './calculations'
import type { ClimateDay, DailyNormal, MonthlyNormal, MonthlySummary } from '@/types/weather'

const normal: MonthlyNormal = {
  month: 1,
  meanMaxTempC: 8,
  meanMinTempC: 2,
  meanTempC: 5,
  rainfallMm: 50,
}

const summary = (month: number, rainfallTotalMm: number | null): MonthlySummary => ({
  year: 2024,
  month,
  highestMax: { value: null, dates: [] },
  lowestMin: { value: null, dates: [] },
  meanMaxTempC: 10,
  meanMinTempC: 4,
  meanTempC: 7,
  meanMaxTempAnomalyC: 2,
  meanMinTempAnomalyC: 2,
  meanTempAnomalyC: 2,
  rainfallTotalMm,
  rainfallPercentageOfNormal: rainfallTotalMm == null ? null : rainfallTotalMm * 2,
  rainfallDifferenceFromNormalMm: rainfallTotalMm == null ? null : rainfallTotalMm - 50,
  rainDays: rainfallTotalMm == null ? 0 : 2,
  wettestDay: { value: rainfallTotalMm, dates: [] },
  coverage: {
    startDate: '2024-01-01',
    endDate: '2024-01-31',
    expectedDays: 31,
    provisional: false,
    maxTemperature: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
    minTemperature: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
    meanTemperature: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
    rainfall: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
  },
})

const record = (date: ClimateDay['date'], values: Partial<ClimateDay> = {}): ClimateDay => ({
  date,
  maxTempC: 20,
  minTempC: 10,
  meanTempC: 15,
  rainfallMm: 1,
  status: 'finalised',
  ...values,
})

describe('climate stats calculations', () => {
  it('aligns monthly observations and normals without inventing observations', () => {
    const rows = buildMonthlyTemperatureStats([summary(1, null)], [normal])
    expect(rows[0]).toMatchObject({
      observedMaxC: 10,
      normalMaxC: 8,
      maxAnomalyC: 2,
    })
    expect(rows[1]?.observedMaxC).toBeNull()
    expect(rows[1]?.normalMaxC).toBeNull()
  })

  it('sorts daily temperature rows and keeps gaps as null', () => {
    const normals: DailyNormal[] = [{
      dateKey: '01-02',
      month: 1,
      day: 2,
      normalMaxTempC: 8,
      normalMinTempC: 2,
      normalMeanTempC: 5,
      maxSampleCount: 30,
      minSampleCount: 30,
    }]
    const rows = buildDailyTemperatureStats([
      record('2024-01-03', { maxTempC: null }),
      record('2024-01-02'),
    ], normals)
    expect(rows.map((row) => row.date)).toEqual(['2024-01-02', '2024-01-03'])
    expect(rows[0]?.maxAnomalyC).toBe(12)
    expect(rows[1]?.maxC).toBeNull()
    expect(rows[1]?.maxAnomalyC).toBeNull()
  })

  it('marks pre-May 2020 rainfall as unavailable rather than zero', () => {
    const rows = buildMonthlyRainfallStats(2020, [summary(1, 0), summary(5, 42)], [normal])
    expect(rows[0]).toMatchObject({ observedMm: null, unavailable: true })
    expect(rows[4]).toMatchObject({ observedMm: 42, unavailable: false })
  })

  it('computes cumulative and complete-window rolling rainfall', () => {
    const rows = buildDailyRainfallStats([
      record('2024-01-01', { rainfallMm: 1 }),
      record('2024-01-02', { rainfallMm: 2 }),
      record('2024-01-03', { rainfallMm: null }),
    ], 2)
    expect(rows[1]?.cumulativeMm).toBe(3)
    expect(rows[0]?.rollingMm).toBeNull()
    expect(rows[1]?.rollingMm).toBe(3)
    expect(rows[2]?.rollingMm).toBeNull()
  })

  it('calculates temperature ranges and threshold counts using strict rules', () => {
    const rows = buildTemperatureRangeStats([record('2024-01-01', { maxTempC: 25, minTempC: 2 })])
    expect(rows[0]?.rangeC).toBe(23)
    const thresholds = buildMonthlyThresholdStats([
      record('2024-01-01', { maxTempC: 25, minTempC: -1, rainfallMm: 0.1 }),
      record('2024-01-02', { maxTempC: 30, minTempC: 1, rainfallMm: 10 }),
    ])
    expect(thresholds[0]).toMatchObject({ warm20Days: 2, warm25Days: 2, warm30Days: 1, frostDays: 1, rainDays: 1, heavyRainDays: 1 })
  })

  it('uses leap-year month lengths for coverage labels', () => {
    expect(expectedDaysForMonth(2024, 2)).toBe(29)
    expect(expectedDaysForMonth(2023, 2)).toBe(28)
  })
})
