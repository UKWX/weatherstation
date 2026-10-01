import { describe, expect, it } from 'vitest'
import { monthNormal } from '@/features/normals/rainfallNormals'
import type { ClimateDay } from '@/types/weather'
import { buildRainfallGrid } from './rainfallGrid'

const day = (date: ClimateDay['date'], rainfallMm: number | null): ClimateDay =>
  ({ date, rainfallMm, maxTempC: null, minTempC: null, meanTempC: null, status: 'finalised' })

describe('monthly rainfall grid', () => {
  it('includes twelve months per year, retaining unavailable and absent months as null', () => {
    const cells = buildRainfallGrid([], 2020, 2021)
    expect(cells).toHaveLength(24)
    expect(cells[0]).toEqual({ year: 2020, month: 1, totalMm: null, percent: null, rainDays: 0 })
    expect(cells[23]).toMatchObject({ year: 2021, month: 12, totalMm: null })
  })

  it('sums rainfall including zero, uses the strict rain-day threshold and monthly normal', () => {
    const cells = buildRainfallGrid([
      day('2020-04-30', 100), day('2020-05-01', 0),
      day('2020-05-02', 0.1), day('2020-05-03', 0.2),
      day('2020-05-04', null), day('2020-06-01', null),
    ], 2020, 2020)
    expect(cells[3]).toMatchObject({ totalMm: null, percent: null, rainDays: 0 })
    expect(cells[4]).toMatchObject({ totalMm: 0.30000000000000004, rainDays: 1 })
    expect(cells[4]?.percent).toBeCloseTo(0.3 / monthNormal(4) * 100)
    expect(cells[5]).toMatchObject({ totalMm: null, percent: null, rainDays: 0 })
  })
})
