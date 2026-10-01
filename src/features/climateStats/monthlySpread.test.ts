import { describe, expect, it } from 'vitest'
import type { ClimateDay } from '@/types/weather'
import { summarizeMonthlySpread } from './monthlySpread'

const day = (date: ClimateDay['date'], maxTempC: number | null, minTempC: number | null): ClimateDay =>
  ({ date, maxTempC, minTempC, meanTempC: null, rainfallMm: null, status: 'finalised' })

describe('monthly temperature spread', () => {
  const records = [
    day('1994-01-01', 999, 999), day('1995-01-01', 0, -10),
    day('2024-01-01', 10, 0), day('2024-01-02', 20, 10),
    day('2024-02-01', 500, 500), day('2024-01-03', null, null),
  ]

  it('computes interpolated percentiles over valid daily maxima', () => {
    expect(summarizeMonthlySpread(records, 1)).toEqual({
      min: 0, p05: 1, p25: 5, median: 10, p75: 15, p95: 19, max: 20,
    })
  })

  it('selects minima and returns null without observations', () => {
    expect(summarizeMonthlySpread(records, 1, true)).toMatchObject({ min: -10, median: 0, max: 10 })
    expect(summarizeMonthlySpread(records, 3)).toBeNull()
    expect(summarizeMonthlySpread(records, 1, false, 2025)).toBeNull()
    expect(summarizeMonthlySpread(records, 13)).toBeNull()
  })
})
