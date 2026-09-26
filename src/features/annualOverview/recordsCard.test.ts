import { describe, expect, it } from 'vitest'
import {
  ANNUAL_OVERVIEW_RECORD_CARD_TYPE_ORDER,
  buildAnnualOverviewRecordsCardModel,
  getAnnualOverviewRecordFillOpacity,
} from '@/features/annualOverview/recordsCard'
import type { AnnualOverviewRecordEvent } from '@/features/annualOverview/model'

const rows: readonly AnnualOverviewRecordEvent[] = [
  {
    date: '2026-01-03',
    type: 'record-low-min',
    currentValueC: -8.1,
    previousRecordC: -5.6,
    previousRecordYears: [1996],
    marginC: 2.5,
  },
  {
    date: '2026-01-03',
    type: 'record-high-max',
    currentValueC: 34.6,
    previousRecordC: 27.9,
    previousRecordYears: [2011],
    marginC: 6.7,
  },
  {
    date: '2026-03-02',
    type: 'record-low-max',
    currentValueC: -1.2,
    previousRecordC: 0.2,
    previousRecordYears: [2001],
    marginC: 1.4,
  },
  {
    date: '2026-06-11',
    type: 'record-high-min',
    currentValueC: 15.8,
    previousRecordC: 15,
    previousRecordYears: [2020],
    marginC: 0.8,
  },
]

describe('annual overview records card helper', () => {
  it('builds shared grouped records, summary tiles, and top margins', () => {
    const model = buildAnnualOverviewRecordsCardModel({
      year: 2026,
      rows,
      latestObservedDate: '2026-08-31',
    })

    expect(model.summaryText).toBe('4 new all-time daily records for Wakefield through 31 Aug 2026')
    expect(model.tiles.map((tile) => tile.label)).toEqual([
      'New records',
      ...ANNUAL_OVERVIEW_RECORD_CARD_TYPE_ORDER.map((type) => {
        switch (type) {
          case 'record-high-max':
            return 'Record high maximum'
          case 'record-high-min':
            return 'Record high minimum'
          case 'record-low-max':
            return 'Record low maximum'
          case 'record-low-min':
            return 'Record low minimum'
        }
      }),
      'Largest margin',
    ])
    expect(model.groupedRecords.get('01-03')?.visualRecords.map((row) => row.type)).toEqual([
      'record-high-max',
      'record-low-min',
    ])
    expect(model.groupedRecords.get('01-03')?.ariaLabel).toContain('Record high max: 34.6°C')
    expect(model.topRecords.map((row) => row.marginC)).toEqual([6.7, 2.5, 1.4, 0.8])
  })

  it('caps the fill opacity scale at the 4°C threshold', () => {
    expect(getAnnualOverviewRecordFillOpacity(0)).toBeCloseTo(0.45)
    expect(getAnnualOverviewRecordFillOpacity(2)).toBeCloseTo(0.725)
    expect(getAnnualOverviewRecordFillOpacity(7)).toBeCloseTo(1)
  })
})
