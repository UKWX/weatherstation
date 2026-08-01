import { describe, expect, it } from 'vitest'
import type {
  AnnualClimatePayload,
  ClimateDateString,
  ClimateDay,
  DailyNormal,
  MonthlyNormal,
} from '@/types/weather'
import {
  buildAnnualTemperatureRows,
  buildAnnualTrendData,
  buildCalendarDateExtremeSummaries,
} from '@/features/annualCharts/calculations'

function makeRecord(
  date: ClimateDateString,
  overrides: Partial<ClimateDay> = {},
): ClimateDay {
  return {
    date,
    maxTempC: 20,
    minTempC: 10,
    meanTempC: 15,
    rainfallMm: 1,
    status: 'finalised',
    ...overrides,
  }
}

function makeNormal(
  dateKey: string,
  month: number,
  day: number,
  overrides: Partial<DailyNormal> = {},
): DailyNormal {
  return {
    dateKey,
    month,
    day,
    normalMaxTempC: 18,
    normalMinTempC: 8,
    normalMeanTempC: 13,
    maxSampleCount: 30,
    minSampleCount: 30,
    ...overrides,
  }
}

function makePayload(
  year: number,
  records: readonly ClimateDay[],
): AnnualClimatePayload {
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

const MONTHLY_NORMALS: readonly MonthlyNormal[] = Array.from({ length: 12 }, (_, index) => ({
  month: index + 1,
  meanMaxTempC: 15,
  meanMinTempC: 5,
  meanTempC: 10,
  rainfallMm: 50,
}))

describe('buildAnnualTemperatureRows', () => {
  it('uses actual selected-year dates for a non-leap year', () => {
    const rows = buildAnnualTemperatureRows(
      [
        makeNormal('02-28', 2, 28),
        makeNormal('03-01', 3, 1),
      ],
      [
        makeRecord('2023-02-28', { maxTempC: 12 }),
        makeRecord('2023-03-01', { maxTempC: 13 }),
      ],
    )

    expect(rows.map((row) => row.date)).toEqual(['2023-02-28', '2023-03-01'])
    expect(rows.some((row) => row.dateKey === '02-29')).toBe(false)
  })

  it('keeps leap-day rows when the selected year is a leap year', () => {
    const rows = buildAnnualTemperatureRows(
      [
        makeNormal('02-28', 2, 28),
        makeNormal('02-29', 2, 29),
        makeNormal('03-01', 3, 1),
      ],
      [
        makeRecord('2024-02-28'),
        makeRecord('2024-02-29'),
        makeRecord('2024-03-01'),
      ],
    )

    expect(rows.map((row) => row.date)).toEqual([
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ])
  })

  it('does not shift 1 March after 28 February in a non-leap year', () => {
    const rows = buildAnnualTemperatureRows(
      [makeNormal('02-28', 2, 28), makeNormal('03-01', 3, 1)],
      [makeRecord('2025-02-28'), makeRecord('2025-03-01')],
    )

    expect(rows[0]?.dateKey).toBe('02-28')
    expect(rows[1]?.dateKey).toBe('03-01')
  })

  it('preserves missing archive dates as gaps by omitting fabricated rows', () => {
    const rows = buildAnnualTemperatureRows(
      [
        makeNormal('02-27', 2, 27),
        makeNormal('02-28', 2, 28),
        makeNormal('03-01', 3, 1),
      ],
      [makeRecord('2023-02-27'), makeRecord('2023-03-01')],
    )

    expect(rows.map((row) => row.date)).toEqual(['2023-02-27', '2023-03-01'])
    expect(rows.find((row) => row.date === '2023-02-28')).toBeUndefined()
  })
})

describe('buildCalendarDateExtremeSummaries', () => {
  it('retains tied record years for each calendar date extreme', () => {
    const summaries = buildCalendarDateExtremeSummaries([
      makePayload(2023, [
        makeRecord('2023-06-10', { maxTempC: 27, minTempC: 14 }),
      ]),
      makePayload(2024, [
        makeRecord('2024-06-10', { maxTempC: 27, minTempC: 12 }),
      ]),
    ])

    const juneTenth = summaries.get('06-10')
    expect(juneTenth?.highestMax.value).toBe(27)
    expect(juneTenth?.highestMax.years).toEqual([2023, 2024])
    expect(juneTenth?.lowestMin.value).toBe(12)
    expect(juneTenth?.lowestMin.years).toEqual([2024])
  })
})

describe('buildAnnualTrendData', () => {
  it('uses only complete rainfall years in rainfall reference averages', () => {
    const data = buildAnnualTrendData(
      [
        makePayload(2020, [
          makeRecord('2020-05-01', { rainfallMm: 10 }),
          makeRecord('2020-05-02', { rainfallMm: 5 }),
        ]),
        makePayload(2021, [
          makeRecord('2021-01-01', { rainfallMm: 10 }),
          makeRecord('2021-01-02', { rainfallMm: 5 }),
        ]),
      ],
      MONTHLY_NORMALS,
    )

    expect(data.points.find((point) => point.year === 2020)?.rainfallComplete).toBe(false)
    expect(data.points.find((point) => point.year === 2021)?.rainfallComplete).toBe(false)
    expect(data.references.rainfallTotalMm).toBeNull()
  })
})
