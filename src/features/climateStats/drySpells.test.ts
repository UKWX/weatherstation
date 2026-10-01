import { describe, expect, it } from 'vitest'
import type { ClimateDay } from '@/types/weather'
import { buildDrySpells } from './drySpells'

const day = (date: ClimateDay['date'], rainfallMm: number | null): ClimateDay =>
  ({ date, rainfallMm, maxTempC: null, minTempC: null, meanTempC: null, status: 'finalised' })

describe('dry spells', () => {
  it('uses the inclusive dry-day threshold and counts consecutive dates across months', () => {
    const rows = [
      day('2024-03-01', 0.1), day('2024-02-29', 0),
      day('2024-03-02', 0.1), day('2024-02-28', 0),
      day('2024-03-03', 0),
    ]
    expect(buildDrySpells(rows)).toEqual([
      { length: 5, startDate: '2024-02-28', endDate: '2024-03-03' },
    ])
  })

  it('breaks on rain, null, missing dates, and unavailable rainfall before May 2020', () => {
    const rows = [
      day('2020-04-30', 0), day('2020-05-01', 0),
      day('2020-05-02', 0.2), day('2020-05-03', 0),
      day('2020-05-05', 0), day('2020-05-06', null),
      day('2020-05-07', 0), day('2020-05-08', 0),
    ]
    expect(buildDrySpells(rows, 2)).toEqual([
      { length: 2, startDate: '2020-05-07', endDate: '2020-05-08' },
    ])
    expect(buildDrySpells(rows)).toEqual([])
    expect(buildDrySpells([])).toEqual([])
  })

  it('does not double-count repeated dates', () => {
    expect(buildDrySpells([
      day('2024-01-01', 0), day('2024-01-01', 0), day('2024-01-02', 0.1),
    ], 2)).toEqual([{ length: 2, startDate: '2024-01-01', endDate: '2024-01-02' }])
  })
})
