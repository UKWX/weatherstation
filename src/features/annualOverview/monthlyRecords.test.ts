import { describe, expect, it } from 'vitest'
import { buildAnnualOverviewMonthlyRecordsCardModel } from '@/features/annualOverview/monthlyRecords'
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
    complete: year < 2026,
    through: `${year}-12-31` as ClimateDateString,
    observationCount: records.length,
    units: { temperature: '°C', rainfall: 'mm', pressure: null, wind: null },
    records,
  }
}

describe('buildAnnualOverviewMonthlyRecordsCardModel', () => {
  it('builds shared monthly-record summaries, highlights, and daily-record links', () => {
    const model = buildAnnualOverviewMonthlyRecordsCardModel({
      year: 2026,
      selectedYearRecords: [
        makeRecord('2026-01-03', { maxTempC: 13 }),
        makeRecord('2026-01-12', { maxTempC: 15 }),
        makeRecord('2026-02-14', { minTempC: -4 }),
      ],
      historicalPayloads: [
        makePayload(1995, [makeRecord('1995-01-05', { maxTempC: 11 }), makeRecord('1995-02-11', { minTempC: -4 })]),
        makePayload(2013, [makeRecord('2013-01-08', { maxTempC: 15 })]),
        makePayload(2025, [makeRecord('2025-01-11', { maxTempC: 14 }), makeRecord('2025-02-03', { minTempC: -3 })]),
        makePayload(2026, [
          makeRecord('2026-01-03', { maxTempC: 13 }),
          makeRecord('2026-01-12', { maxTempC: 15 }),
          makeRecord('2026-02-14', { minTempC: -4 }),
        ]),
      ],
    })

    expect(model.subtitle).toBe('All-time monthly extremes for Wakefield · 0 broken in 2026 · 2 equalled')
    expect(model.footnote).toBe(
      'Outlined cells are monthly records set or equalled in 2026. Records based on data since 1995.',
    )

    const januaryHighestMax = model.rows[0]?.cells[0]
    expect(januaryHighestMax?.status).toBe('equalled')
    expect(januaryHighestMax?.valueLabel).toBe('15.0')
    expect(januaryHighestMax?.yearLabel).toBe('2013')
    expect(januaryHighestMax?.tooltipEqualled).toBe('Equalled on 12 Jan 2026')

    const februaryLowestMin = model.rows[3]?.cells[1]
    expect(februaryLowestMin?.status).toBe('equalled')
    expect(februaryLowestMin?.tooltipValue).toBe('-4.0°C')
    expect(model.highlights).toHaveLength(2)
    expect(model.highlights[0]?.lineLabel).toContain('Equalled')
    expect(model.linkedDailyRecordMonthsByDate.size).toBe(0)
  })

  it('tracks new monthly records with the most extreme selected-year value', () => {
    const model = buildAnnualOverviewMonthlyRecordsCardModel({
      year: 2026,
      selectedYearRecords: [
        makeRecord('2026-03-02', { maxTempC: 15 }),
        makeRecord('2026-03-20', { maxTempC: 18 }),
      ],
      historicalPayloads: [
        makePayload(2024, [makeRecord('2024-03-10', { maxTempC: 14 })]),
        makePayload(2025, [makeRecord('2025-03-11', { maxTempC: 16 })]),
        makePayload(2026, [
          makeRecord('2026-03-02', { maxTempC: 15 }),
          makeRecord('2026-03-20', { maxTempC: 18 }),
        ]),
      ],
    })

    const marchHighestMax = model.rows[0]?.cells[2]
    expect(marchHighestMax?.status).toBe('broken')
    expect(marchHighestMax?.valueLabel).toBe('18.0')
    expect(marchHighestMax?.yearLabel).toBe('2026')
    expect(marchHighestMax?.tooltipPrevious).toBe('Previous record 16.0°C (2025)')
    expect(model.highlights[0]?.description).toContain('Set 20 Mar')
    expect(model.linkedDailyRecordMonthsByDate.get('2026-03-20')).toBe('March')
  })
})
