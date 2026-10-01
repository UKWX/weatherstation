import { describe, expect, it } from 'vitest'
import type { ClimateDay } from '@/types/weather'
import { buildOnThisDayRows } from './onThisDay'

const day = (date: ClimateDay['date'], maxTempC: number | null, minTempC: number | null): ClimateDay =>
  ({ date, maxTempC, minTempC, meanTempC: null, rainfallMm: null, status: 'finalised' })

describe('on this day', () => {
  it('filters exact calendar dates and first year, sorts ascending, and preserves missing readings', () => {
    const rows = buildOnThisDayRows([
      day('2024-02-29', null, -2), day('1994-02-29', 8, 1),
      day('2020-02-28', 30, 1), day('2020-02-29', 4, null),
      day('2024-03-29', 3, 2),
    ], 2, 29)
    expect(rows).toEqual([
      { year: 2020, maxC: 4, minC: null },
      { year: 2024, maxC: null, minC: -2 },
    ])
  })

  it('does not fabricate observations for an invalid or unrecorded date', () => {
    expect(buildOnThisDayRows([], 2, 29)).toEqual([])
    expect(buildOnThisDayRows([day('2024-02-29', 5, 1)], 13, 29)).toEqual([])
  })
})
