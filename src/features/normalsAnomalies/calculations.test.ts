import { describe, expect, it } from 'vitest'
import type { ClimateDateString, ClimateDay, DailyNormal, MonthlyNormal, MonthlySummary } from '@/types/weather'
import {
  buildDailyNormalsRows,
  buildMonthlyRainfallRows,
  buildMonthlyTempAnomalies,
  buildRankingRows,
  buildYtdContext,
} from './calculations'
import { DAILY_NORMAL_BASELINE, MONTHLY_NORMAL_BASELINE } from '@/config/weather'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDay(date: ClimateDateString, overrides: Partial<ClimateDay> = {}): ClimateDay {
  return {
    date,
    maxTempC: 20,
    minTempC: 10,
    meanTempC: 15,
    rainfallMm: 5,
    status: 'finalised',
    ...overrides,
  }
}

function makeNormal(month: number, day: number, overrides: Partial<DailyNormal> = {}): DailyNormal {
  return {
    dateKey: `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
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

function makeMonthlyNormal(month: number, overrides: Partial<MonthlyNormal> = {}): MonthlyNormal {
  return {
    month,
    meanMaxTempC: 20,
    meanMinTempC: 10,
    meanTempC: 15,
    rainfallMm: 50,
    ...overrides,
  }
}

function makeCompleteCoverage(year: number, month: number) {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    startDate: `${year}-${String(month).padStart(2, '0')}-01` as ClimateDateString,
    endDate: `${year}-${String(month).padStart(2, '0')}-${String(days).padStart(2, '0')}` as ClimateDateString,
    expectedDays: days,
    provisional: false,
    maxTemperature: { valid: days, missing: 0, unavailable: 0, availableDays: days, complete: true },
    minTemperature: { valid: days, missing: 0, unavailable: 0, availableDays: days, complete: true },
    meanTemperature: { valid: days, missing: 0, unavailable: 0, availableDays: days, complete: true },
    rainfall: { valid: days, missing: 0, unavailable: 0, availableDays: days, complete: true },
  }
}

function makeSummary(year: number, month: number, overrides: Partial<MonthlySummary> = {}): MonthlySummary {
  return {
    year,
    month,
    highestMax: { value: 25, dates: [`${year}-${String(month).padStart(2, '0')}-01` as ClimateDateString] },
    lowestMin: { value: 5, dates: [`${year}-${String(month).padStart(2, '0')}-01` as ClimateDateString] },
    meanMaxTempC: 20,
    meanMinTempC: 10,
    meanTempC: 15,
    meanMaxTempAnomalyC: null,
    meanMinTempAnomalyC: null,
    meanTempAnomalyC: null,
    rainfallTotalMm: 50,
    rainfallPercentageOfNormal: null,
    rainfallDifferenceFromNormalMm: null,
    rainDays: 8,
    wettestDay: { value: 10, dates: [] },
    coverage: makeCompleteCoverage(year, month),
    ...overrides,
  }
}

// ── Baseline label constants ──────────────────────────────────────────────────

describe('baseline labels', () => {
  it('DAILY_NORMAL_BASELINE is 1995–2024', () => {
    expect(DAILY_NORMAL_BASELINE).toBe('1995–2024')
  })

  it('MONTHLY_NORMAL_BASELINE is 1991–2020', () => {
    expect(MONTHLY_NORMAL_BASELINE).toBe('1991–2020')
  })

  it('the two baselines are not the same string', () => {
    expect(DAILY_NORMAL_BASELINE).not.toBe(MONTHLY_NORMAL_BASELINE)
  })
})

// ── buildDailyNormalsRows ─────────────────────────────────────────────────────

describe('buildDailyNormalsRows', () => {
  it('pairs observed values with normals', () => {
    const normals = [makeNormal(6, 15)]
    const records = [makeDay('2024-06-15' as ClimateDateString, { maxTempC: 22, minTempC: 11 })]
    const rows = buildDailyNormalsRows(normals, records, 2024)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.obsMaxC).toBe(22)
    expect(rows[0]!.obsMinC).toBe(11)
    expect(rows[0]!.maxAnomalyC).toBeCloseTo(4) // 22 - 18
    expect(rows[0]!.minAnomalyC).toBeCloseTo(3) // 11 - 8
  })

  it('returns null anomaly when observed value is missing', () => {
    const normals = [makeNormal(3, 10)]
    const records = [makeDay('2024-03-10' as ClimateDateString, { maxTempC: null, minTempC: null })]
    const rows = buildDailyNormalsRows(normals, records, 2024)
    expect(rows[0]!.maxAnomalyC).toBeNull()
    expect(rows[0]!.minAnomalyC).toBeNull()
  })

  it('returns null anomaly when normal value is missing', () => {
    const normals = [makeNormal(3, 10, { normalMaxTempC: null, normalMinTempC: null })]
    const records = [makeDay('2024-03-10' as ClimateDateString, { maxTempC: 15, minTempC: 5 })]
    const rows = buildDailyNormalsRows(normals, records, 2024)
    expect(rows[0]!.maxAnomalyC).toBeNull()
    expect(rows[0]!.minAnomalyC).toBeNull()
  })

  it('returns null obs when no record exists for that date', () => {
    const normals = [makeNormal(6, 15)]
    const rows = buildDailyNormalsRows(normals, [], 2024)
    expect(rows[0]!.obsMaxC).toBeNull()
    expect(rows[0]!.obsMinC).toBeNull()
    expect(rows[0]!.maxAnomalyC).toBeNull()
  })

  it('handles Feb-29 in a leap year', () => {
    const normals = [makeNormal(2, 29)]
    const records = [makeDay('2024-02-29' as ClimateDateString, { maxTempC: 10, minTempC: 2 })]
    const rows = buildDailyNormalsRows(normals, records, 2024)
    expect(rows[0]!.obsMaxC).toBe(10)
  })

  it('returns null obs for Feb-29 in a non-leap year', () => {
    const normals = [makeNormal(2, 29)]
    const records: ClimateDay[] = [] // 2023 has no Feb-29
    const rows = buildDailyNormalsRows(normals, records, 2023)
    expect(rows[0]!.obsMaxC).toBeNull()
    expect(rows[0]!.maxAnomalyC).toBeNull()
  })
})

// ── buildMonthlyTempAnomalies ─────────────────────────────────────────────────

describe('buildMonthlyTempAnomalies', () => {
  it('maps anomalies from summaries', () => {
    const summaries = [
      makeSummary(2024, 6, { meanMaxTempAnomalyC: 1.5, meanMinTempAnomalyC: -0.5, meanTempAnomalyC: 0.5 }),
    ]
    const rows = buildMonthlyTempAnomalies(summaries)
    const june = rows.find((r) => r.month === 6)!
    expect(june.meanMaxAnomalyC).toBe(1.5)
    expect(june.meanMinAnomalyC).toBe(-0.5)
    expect(june.meanTempAnomalyC).toBe(0.5)
  })

  it('returns null anomaly for months with no summary', () => {
    const rows = buildMonthlyTempAnomalies([])
    expect(rows).toHaveLength(12)
    rows.forEach((r) => {
      expect(r.meanMaxAnomalyC).toBeNull()
      expect(r.meanMinAnomalyC).toBeNull()
      expect(r.meanTempAnomalyC).toBeNull()
    })
  })

  it('always returns 12 rows', () => {
    const rows = buildMonthlyTempAnomalies([makeSummary(2024, 3)])
    expect(rows).toHaveLength(12)
  })
})

// ── buildMonthlyRainfallRows ──────────────────────────────────────────────────

describe('buildMonthlyRainfallRows', () => {
  it('returns percentage of normal when both exist', () => {
    const summaries = [makeSummary(2024, 6, { rainfallTotalMm: 75, rainfallPercentageOfNormal: null })]
    const normals = [makeMonthlyNormal(6, { rainfallMm: 50 })]
    const rows = buildMonthlyRainfallRows(2024, summaries, normals)
    const june = rows.find((r) => r.month === 6)!
    expect(june.observedMm).toBe(75)
    expect(june.normalMm).toBe(50)
    expect(june.percentageOfNormal).toBeCloseTo(150)
    expect(june.differenceMm).toBeCloseTo(25)
  })

  it('returns null percentage when normal is zero', () => {
    const summaries = [makeSummary(2024, 6, { rainfallTotalMm: 10 })]
    const normals = [makeMonthlyNormal(6, { rainfallMm: 0 })]
    const rows = buildMonthlyRainfallRows(2024, summaries, normals)
    const june = rows.find((r) => r.month === 6)!
    expect(june.percentageOfNormal).toBeNull()
  })

  it('marks months before rainfall availability as unavailable', () => {
    const summaries = [makeSummary(2020, 4, { rainfallTotalMm: 30 })]
    const normals = [makeMonthlyNormal(4, { rainfallMm: 40 })]
    const rows = buildMonthlyRainfallRows(2020, summaries, normals)
    const april = rows.find((r) => r.month === 4)!
    expect(april.rainfallUnavailable).toBe(true)
    expect(april.observedMm).toBeNull()
    expect(april.percentageOfNormal).toBeNull()
  })

  it('returns null when observed rainfall is missing', () => {
    const summaries = [makeSummary(2024, 6, { rainfallTotalMm: null })]
    const normals = [makeMonthlyNormal(6, { rainfallMm: 50 })]
    const rows = buildMonthlyRainfallRows(2024, summaries, normals)
    const june = rows.find((r) => r.month === 6)!
    expect(june.observedMm).toBeNull()
    expect(june.percentageOfNormal).toBeNull()
  })

  it('returns null when monthly normal is absent', () => {
    const summaries = [makeSummary(2024, 6, { rainfallTotalMm: 50 })]
    const rows = buildMonthlyRainfallRows(2024, summaries, [])
    const june = rows.find((r) => r.month === 6)!
    expect(june.normalMm).toBeNull()
    expect(june.percentageOfNormal).toBeNull()
  })

  it('marks incomplete periods', () => {
    const incompleteCoverage = {
      ...makeCompleteCoverage(2024, 6),
      provisional: false,
      rainfall: { valid: 10, missing: 20, unavailable: 0, availableDays: 10, complete: false },
    }
    const summaries = [
      makeSummary(2024, 6, { rainfallTotalMm: 40, coverage: incompleteCoverage }),
    ]
    const normals = [makeMonthlyNormal(6)]
    const rows = buildMonthlyRainfallRows(2024, summaries, normals)
    const june = rows.find((r) => r.month === 6)!
    expect(june.incomplete).toBe(true)
    expect(june.validDays).toBe(10)
  })

  it('partial-month: does not manufacture a full-month total', () => {
    // If only 10 days of June are observed, we still show those 10 days' total
    const partialCoverage = {
      ...makeCompleteCoverage(2024, 6),
      provisional: false,
      rainfall: { valid: 10, missing: 20, unavailable: 0, availableDays: 10, complete: false },
    }
    const summaries = [
      makeSummary(2024, 6, { rainfallTotalMm: 20, coverage: partialCoverage }),
    ]
    const normals = [makeMonthlyNormal(6, { rainfallMm: 50 })]
    const rows = buildMonthlyRainfallRows(2024, summaries, normals)
    const june = rows.find((r) => r.month === 6)!
    // 20/50 = 40% — but this is partial; incomplete flag is set
    expect(june.incomplete).toBe(true)
    expect(june.validDays).toBe(10)
    expect(june.expectedDays).toBe(30)
  })
})

// ── buildYtdContext ────────────────────────────────────────────────────────────

describe('buildYtdContext', () => {
  it('computes temperature anomaly for completed months', () => {
    const summaries = [
      makeSummary(2022, 1, { meanMaxTempC: 8, meanMinTempC: 2, meanTempC: 5, meanMaxTempAnomalyC: -2, meanMinTempAnomalyC: -1, meanTempAnomalyC: -1.5 }),
      makeSummary(2022, 2, { meanMaxTempC: 10, meanMinTempC: 4, meanTempC: 7, meanMaxTempAnomalyC: 1, meanMinTempAnomalyC: 0.5, meanTempAnomalyC: 0.75 }),
    ]
    const normals = [makeMonthlyNormal(1, { meanMaxTempC: 10, meanMinTempC: 3, meanTempC: 6.5 }), makeMonthlyNormal(2, { meanMaxTempC: 9, meanMinTempC: 3.5, meanTempC: 6.25 })]
    const ctx = buildYtdContext(2022, summaries, normals, '2022-12-31' as ClimateDateString)
    expect(ctx.temperature.obsYtdMeanMaxC).toBeCloseTo(9) // avg(8,10)
    expect(ctx.temperature.normalYtdMeanMaxC).toBeCloseTo(9.5) // avg(10,9)
    expect(ctx.temperature.ytdMeanMaxAnomalyC).toBeCloseTo(-0.5)
  })

  it('returns null values when no summaries exist', () => {
    const ctx = buildYtdContext(2022, [], [], '2022-06-01' as ClimateDateString)
    expect(ctx.temperature.obsYtdMeanMaxC).toBeNull()
    expect(ctx.rainfall.observedMm).toBeNull()
    expect(ctx.rainfall.expectedMm).toBeNull()
    expect(ctx.lastCompletedMonth).toBeNull()
  })

  it('marks expected rainfall as prorated', () => {
    const ctx = buildYtdContext(2022, [], [], null)
    expect(ctx.rainfall.expectedIsProrated).toBe(true)
  })
})

// ── buildRankingRows ──────────────────────────────────────────────────────────

describe('buildRankingRows', () => {
  const summaries: MonthlySummary[] = [
    makeSummary(2020, 6, { meanMaxTempAnomalyC: 2.0, meanMinTempAnomalyC: 1.0, meanTempAnomalyC: 1.5 }),
    makeSummary(2021, 6, { meanMaxTempAnomalyC: -1.0, meanMinTempAnomalyC: -0.5, meanTempAnomalyC: -0.75 }),
    makeSummary(2022, 6, { meanMaxTempAnomalyC: 0.5, meanMinTempAnomalyC: 0.2, meanTempAnomalyC: 0.35 }),
    makeSummary(2020, 7, { meanMaxTempAnomalyC: 1.0, meanMinTempAnomalyC: 0.5, meanTempAnomalyC: 0.75 }),
  ]

  it('returns warmest first for meanMaxAnomaly (month filter)', () => {
    const rows = buildRankingRows(summaries, 'meanMaxAnomaly', 6, 'warmest')
    expect(rows[0]!.year).toBe(2020)
    expect(rows[0]!.value).toBe(2.0)
    expect(rows[1]!.year).toBe(2022)
    expect(rows[2]!.year).toBe(2021)
  })

  it('returns coldest first for meanMaxAnomaly (month filter)', () => {
    const rows = buildRankingRows(summaries, 'meanMaxAnomaly', 6, 'coldest')
    expect(rows[0]!.year).toBe(2021)
    expect(rows[0]!.value).toBe(-1.0)
  })

  it('excludes months with null anomaly', () => {
    const withNull = [
      ...summaries,
      makeSummary(2023, 6, { meanMaxTempAnomalyC: null }),
    ]
    const rows = buildRankingRows(withNull, 'meanMaxAnomaly', 6, 'warmest')
    expect(rows.find((r) => r.year === 2023)).toBeUndefined()
  })

  it('annual period averages months across the year', () => {
    const rows = buildRankingRows(summaries, 'meanMaxAnomaly', 'annual', 'warmest')
    // 2020 has June +2.0 and July +1.0 → avg 1.5; 2021 has June -1.0; 2022 has June +0.5
    expect(rows[0]!.year).toBe(2020)
    expect(rows[0]!.value).toBeCloseTo(1.5)
  })

  it('handles rainfall percentage and excludes zero-normal months', () => {
    const rainfallSummaries = [
      makeSummary(2021, 6, { rainfallPercentageOfNormal: 150 }),
      makeSummary(2022, 6, { rainfallPercentageOfNormal: 80 }),
      makeSummary(2023, 6, { rainfallPercentageOfNormal: null }),
    ]
    const rows = buildRankingRows(rainfallSummaries, 'rainfallPercentage', 6, 'wettest')
    expect(rows).toHaveLength(2)
    expect(rows[0]!.value).toBe(150)
  })

  it('driest returns ascending rainfall', () => {
    const rainfallSummaries = [
      makeSummary(2021, 6, { rainfallPercentageOfNormal: 150 }),
      makeSummary(2022, 6, { rainfallPercentageOfNormal: 30 }),
    ]
    const rows = buildRankingRows(rainfallSummaries, 'rainfallPercentage', 6, 'driest')
    expect(rows[0]!.value).toBe(30)
  })
})
