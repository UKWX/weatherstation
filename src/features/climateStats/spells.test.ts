import { describe, expect, it } from 'vitest'
import type { ClimateDay } from '@/types/weather'
import { longestFrostSpell, longestWarmSpell } from './spells'

const day = (date: ClimateDay['date'], maxTempC: number | null, minTempC: number | null): ClimateDay =>
  ({ date, maxTempC, minTempC, meanTempC: null, rainfallMm: null, status: 'finalised' })

describe('temperature spells', () => {
  it('counts inclusive thresholds across leap day and year boundaries, independent of input order', () => {
    const rows = [
      day('2024-03-01', 25, 1), day('2024-02-28', 25, -1),
      day('2024-02-29', 26, -2), day('2024-03-02', 24, -3),
    ]
    expect(longestWarmSpell(rows)).toEqual({
      length: 3, startDate: '2024-02-28', endDate: '2024-03-01', ongoing: false,
    })
    expect(longestFrostSpell(rows)).toEqual({
      length: 2, startDate: '2024-02-28', endDate: '2024-02-29', ongoing: false,
    })
  })

  it('ends a run at missing dates or null readings and marks a final run ongoing', () => {
    const rows = [
      day('2024-12-31', 25, -1), day('2025-01-01', 25, -1),
      day('2025-01-03', 25, null), day('2025-01-04', 25, -1),
    ]
    expect(longestWarmSpell(rows)).toEqual({
      length: 2, startDate: '2024-12-31', endDate: '2025-01-01', ongoing: false,
    })
    expect(longestFrostSpell(rows)).toEqual({
      length: 2, startDate: '2024-12-31', endDate: '2025-01-01', ongoing: false,
    })
    expect(longestWarmSpell([day('2024-01-01', 25, 0)])?.ongoing).toBe(true)
    expect(longestWarmSpell([day('2024-01-01', null, 0)])).toBeNull()
  })

  it('counts each calendar date once and does not mistake duplicate records for extra days', () => {
    const rows = [
      day('2024-01-01', 25, -1), day('2024-01-01', 25, -1),
      day('2024-01-02', 25, -1),
    ]
    expect(longestWarmSpell(rows)?.length).toBe(2)
    expect(longestFrostSpell(rows)?.length).toBe(2)
  })
})
