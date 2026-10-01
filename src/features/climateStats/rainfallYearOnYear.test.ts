import { describe, expect, it } from 'vitest'
import type { ClimateDay } from '@/types/weather'
import { buildCumulativeRainfall } from './rainfallYearOnYear'

const day = (date: ClimateDay['date'], rainfallMm: number | null): ClimateDay =>
  ({ date, rainfallMm, maxTempC: null, minTempC: null, meanTempC: null, status: 'finalised' })

describe('year-on-year cumulative rainfall', () => {
  it('sorts days without mutating input, accumulates zero and valid totals, and skips missing days', () => {
    const records = [
      day('2024-01-04', 3), day('2024-01-02', null), day('2023-01-01', 100),
      day('2024-01-03', 0), day('2024-01-01', 2),
    ]
    expect(buildCumulativeRainfall(records, 2024)).toEqual([
      { year: 2024, date: '2024-01-01', totalMm: 2 },
      { year: 2024, date: '2024-01-03', totalMm: 2 },
      { year: 2024, date: '2024-01-04', totalMm: 5 },
    ])
    expect(records[0]?.date).toBe('2024-01-04')
  })

  it('does not interpret pre-observation rainfall as zero or create totals before May 2020', () => {
    expect(buildCumulativeRainfall([
      day('2020-04-30', 99), day('2020-05-01', 0), day('2020-05-02', null),
      day('2020-05-03', 1),
    ], 2020)).toEqual([
      { year: 2020, date: '2020-05-01', totalMm: 0 },
      { year: 2020, date: '2020-05-03', totalMm: 1 },
    ])
  })

  it('counts each date only once and carries accumulated rainfall across a year boundary only within the same year', () => {
    expect(buildCumulativeRainfall([
      day('2023-12-31', 9), day('2024-01-01', 1), day('2024-01-01', 2),
      day('2024-01-02', 3),
    ], 2024)).toEqual([
      { year: 2024, date: '2024-01-01', totalMm: 2 },
      { year: 2024, date: '2024-01-02', totalMm: 5 },
    ])
  })
})
