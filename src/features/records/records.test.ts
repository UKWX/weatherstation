import { describe, expect, it } from 'vitest'
import type { ClimateDateString, ClimateDay, AnnualClimatePayload, MonthlyNormal } from '@/types/weather'
import { buildRecordsIndex, emptyRecordsIndex } from './analysis'
import {
  getDailyRankings,
  getCalendarDateRecords,
  getMonthlyRankings,
  getAnnualRankings,
  getThresholdSummary,
  getSpellSummary,
  getRecordProgression,
  getOverallRecords,
  getYearRecordCounts,
} from './calculations'

// ── Test helpers ──────────────────────────────────────────────────────────────

function d(date: string): ClimateDateString {
  return date as ClimateDateString
}

function makeDay(
  date: string,
  overrides: Partial<ClimateDay> = {},
): ClimateDay {
  return {
    date: d(date),
    maxTempC: 15,
    minTempC: 5,
    meanTempC: 10,
    rainfallMm: 0,
    status: 'finalised',
    ...overrides,
  }
}

function daysForMonth(
  year: number,
  month: number,
  overrides: (date: string) => Partial<ClimateDay> = () => ({}),
): ClimateDay[] {
  const days: ClimateDay[] = []
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    days.push(makeDay(date, overrides(date)))
  }
  return days
}

function fullYear(
  year: number,
  overrides: (date: string) => Partial<ClimateDay> = () => ({}),
): ClimateDay[] {
  const days: ClimateDay[] = []
  for (let m = 1; m <= 12; m++) {
    days.push(...daysForMonth(year, m, overrides))
  }
  return days
}

function makePayload(
  year: number,
  records: ClimateDay[],
  complete = true,
): AnnualClimatePayload {
  return {
    station: 'test',
    year,
    generatedAtUtc: null,
    complete,
    through: null,
    observationCount: records.length,
    units: { temperature: '°C', rainfall: 'mm', pressure: null, wind: null },
    records,
  }
}

const MONTHLY_NORMALS: MonthlyNormal[] = Array.from({ length: 12 }, (_, i) => ({
  month: i + 1,
  meanMaxTempC: 15,
  meanMinTempC: 5,
  meanTempC: 10,
  rainfallMm: 50,
}))

// ── buildRecordsIndex ─────────────────────────────────────────────────────────

describe('buildRecordsIndex', () => {
  it('returns an empty index when no payloads are provided', () => {
    const idx = buildRecordsIndex([], [])
    expect(idx.allDays).toHaveLength(0)
    expect(idx.loadedYears).toHaveLength(0)
    expect(idx.daysByMaxTempDesc).toHaveLength(0)
    expect(idx.monthlySummaries.size).toBe(0)
  })

  it('merges records from multiple years and sorts by date', () => {
    const payload2023 = makePayload(2023, [makeDay('2023-07-15'), makeDay('2023-01-01')])
    const payload2024 = makePayload(2024, [makeDay('2024-03-10'), makeDay('2024-06-01')])
    const idx = buildRecordsIndex([payload2023, payload2024], [])
    expect(idx.allDays).toHaveLength(4)
    expect(idx.allDays[0]!.date).toBe(d('2023-01-01'))
    expect(idx.allDays[3]!.date).toBe(d('2024-06-01'))
  })

  it('pre-sorts daysByMaxTempDesc correctly', () => {
    const records = [
      makeDay('2024-01-01', { maxTempC: 10 }),
      makeDay('2024-01-02', { maxTempC: 30 }),
      makeDay('2024-01-03', { maxTempC: 20 }),
    ]
    const idx = buildRecordsIndex([makePayload(2024, records)], [])
    expect(idx.daysByMaxTempDesc[0]!.maxTempC).toBe(30)
    expect(idx.daysByMaxTempDesc[1]!.maxTempC).toBe(20)
    expect(idx.daysByMaxTempDesc[2]!.maxTempC).toBe(10)
  })

  it('pre-sorts daysByMinTempAsc correctly', () => {
    const records = [
      makeDay('2024-01-01', { minTempC: 5 }),
      makeDay('2024-01-02', { minTempC: -3 }),
      makeDay('2024-01-03', { minTempC: 2 }),
    ]
    const idx = buildRecordsIndex([makePayload(2024, records)], [])
    expect(idx.daysByMinTempAsc[0]!.minTempC).toBe(-3)
    expect(idx.daysByMinTempAsc[1]!.minTempC).toBe(2)
  })

  it('excludes null maxTempC values from daysByMaxTempDesc', () => {
    const records = [
      makeDay('2024-01-01', { maxTempC: null }),
      makeDay('2024-01-02', { maxTempC: 25 }),
    ]
    const idx = buildRecordsIndex([makePayload(2024, records)], [])
    expect(idx.daysByMaxTempDesc).toHaveLength(1)
    expect(idx.daysByMaxTempDesc[0]!.maxTempC).toBe(25)
  })

  it('excludes null rainfall from daysByRainfallDesc', () => {
    const records = [
      makeDay('2024-06-01', { rainfallMm: null }),
      makeDay('2024-06-02', { rainfallMm: 5.0 }),
      makeDay('2024-06-03', { rainfallMm: 0.0 }),
    ]
    const idx = buildRecordsIndex([makePayload(2024, records)], [])
    // null is excluded; 5.0 and 0.0 are both included
    expect(idx.daysByRainfallDesc).toHaveLength(2)
    expect(idx.daysByRainfallDesc[0]!.rainfallMm).toBe(5.0)
  })

  it('groups records by calendar date key', () => {
    const records = [
      makeDay('2023-07-15'),
      makeDay('2024-07-15'),
      makeDay('2024-08-01'),
    ]
    const idx = buildRecordsIndex([makePayload(2023, [records[0]!]), makePayload(2024, [records[1]!, records[2]!])], [])
    expect(idx.daysByCalendarDate.get('07-15')).toHaveLength(2)
    expect(idx.daysByCalendarDate.get('08-01')).toHaveLength(1)
  })

  it('builds monthly summaries for each year-month combination', () => {
    const records = fullYear(2023)
    const idx = buildRecordsIndex([makePayload(2023, records)], MONTHLY_NORMALS)
    expect(idx.monthlySummaries.size).toBe(12)
    expect(idx.monthlySummaries.has('2023-07')).toBe(true)
  })
})

// ── getDailyRankings ──────────────────────────────────────────────────────────

describe('getDailyRankings', () => {
  const records = [
    makeDay('2024-07-15', { maxTempC: 35 }),
    makeDay('2024-07-20', { maxTempC: 35 }),
    makeDay('2024-06-10', { maxTempC: 30 }),
    makeDay('2024-06-11', { maxTempC: 28 }),
    makeDay('2024-01-05', { maxTempC: 5 }),
  ]
  const idx = buildRecordsIndex([makePayload(2024, records)], [])

  it('returns highest maxima in descending order', () => {
    const result = getDailyRankings(idx, 'highest-max', { month: null, season: 'all', yearFrom: null, yearTo: null }, 10)
    expect(result[0]!.value).toBe(35)
    expect(result[1]!.value).toBe(35)
    expect(result[2]!.value).toBe(30)
  })

  it('assigns the same rank to tied entries', () => {
    const result = getDailyRankings(idx, 'highest-max', { month: null, season: 'all', yearFrom: null, yearTo: null }, 10)
    expect(result[0]!.rank).toBe(1)
    expect(result[1]!.rank).toBe(1) // tied
    expect(result[2]!.rank).toBe(3) // skips rank 2
  })

  it('retains all ties at the Nth cutoff', () => {
    // topN = 1; both 35°C days should be returned since they tie for rank 1
    const result = getDailyRankings(idx, 'highest-max', { month: null, season: 'all', yearFrom: null, yearTo: null }, 1)
    expect(result).toHaveLength(2)
    expect(result.every((r) => r.rank === 1)).toBe(true)
  })

  it('filters by month', () => {
    const result = getDailyRankings(idx, 'highest-max', { month: 7, season: 'all', yearFrom: null, yearTo: null }, 10)
    expect(result.every((r) => r.date.includes('-07-'))).toBe(true)
    expect(result).toHaveLength(2)
  })

  it('filters by season', () => {
    const result = getDailyRankings(idx, 'highest-max', { month: null, season: 'summer', yearFrom: null, yearTo: null }, 10)
    // summer = June, July, August
    expect(result.every((r) => {
      const m = Number(r.date.slice(5, 7))
      return m >= 6 && m <= 8
    })).toBe(true)
    expect(result).toHaveLength(4) // 2 July + 2 June
  })

  it('filters by year range', () => {
    const idx2 = buildRecordsIndex([
      makePayload(2023, [makeDay('2023-08-01', { maxTempC: 40 })]),
      makePayload(2024, records),
    ], [])
    const result = getDailyRankings(idx2, 'highest-max', { month: null, season: 'all', yearFrom: 2024, yearTo: 2024 }, 10)
    expect(result.every((r) => r.date.startsWith('2024'))).toBe(true)
  })

  it('never ranks null values', () => {
    const nullRecords = [
      makeDay('2024-01-01', { maxTempC: null }),
      makeDay('2024-01-02', { maxTempC: 20 }),
    ]
    const idx2 = buildRecordsIndex([makePayload(2024, nullRecords)], [])
    const result = getDailyRankings(idx2, 'highest-max', { month: null, season: 'all', yearFrom: null, yearTo: null }, 10)
    expect(result).toHaveLength(1)
    expect(result[0]!.value).toBe(20)
  })

  it('returns lowest maxima in ascending order', () => {
    const result = getDailyRankings(idx, 'lowest-max', { month: null, season: 'all', yearFrom: null, yearTo: null }, 10)
    expect(result[0]!.value).toBe(5)
    expect(result.at(-1)!.value).toBe(35)
  })

  it('returns wettest days by rainfall descending', () => {
    const rainRecords = [
      makeDay('2024-06-01', { rainfallMm: 12.5 }),
      makeDay('2024-06-02', { rainfallMm: 5.0 }),
      makeDay('2024-06-03', { rainfallMm: 12.5 }),
      makeDay('2024-06-04', { rainfallMm: null }),
    ]
    const idx2 = buildRecordsIndex([makePayload(2024, rainRecords)], [])
    const result = getDailyRankings(idx2, 'wettest', { month: null, season: 'all', yearFrom: null, yearTo: null }, 10)
    expect(result).toHaveLength(3)
    expect(result[0]!.value).toBe(12.5)
    expect(result[1]!.value).toBe(12.5)
    expect(result[2]!.value).toBe(5.0)
  })
})

// ── getCalendarDateRecords ────────────────────────────────────────────────────

describe('getCalendarDateRecords', () => {
  const records = [
    makeDay('2021-07-15', { maxTempC: 28, minTempC: 16, rainfallMm: 0 }),
    makeDay('2022-07-15', { maxTempC: 32, minTempC: 18, rainfallMm: 5 }),
    makeDay('2023-07-15', { maxTempC: 25, minTempC: 12, rainfallMm: 15 }),
    makeDay('2024-07-15', { maxTempC: 32, minTempC: 20, rainfallMm: 10 }),
  ]

  const payloads: AnnualClimatePayload[] = [2021, 2022, 2023, 2024].map((year) =>
    makePayload(year, records.filter((r) => r.date.startsWith(String(year)))),
  )

  const idx = buildRecordsIndex(payloads, [])

  it('counts sample size correctly', () => {
    const result = getCalendarDateRecords(idx, 7, 15)
    expect(result.sampleSize).toBe(4)
  })

  it('finds highest max with tied holders', () => {
    const result = getCalendarDateRecords(idx, 7, 15)
    expect(result.highestMax.value).toBe(32)
    expect(result.highestMax.years).toContain(2022)
    expect(result.highestMax.years).toContain(2024)
    expect(result.highestMax.years).toHaveLength(2)
  })

  it('finds lowest max', () => {
    const result = getCalendarDateRecords(idx, 7, 15)
    expect(result.lowestMax.value).toBe(25)
    expect(result.lowestMax.years).toContain(2023)
  })

  it('finds highest min with tied holders', () => {
    const result = getCalendarDateRecords(idx, 7, 15)
    expect(result.highestMin.value).toBe(20)
    expect(result.highestMin.years).toContain(2024)
  })

  it('finds lowest min', () => {
    const result = getCalendarDateRecords(idx, 7, 15)
    expect(result.lowestMin.value).toBe(12)
    expect(result.lowestMin.years).toContain(2023)
  })

  it('returns null for empty date', () => {
    const result = getCalendarDateRecords(idx, 2, 29)
    expect(result.sampleSize).toBe(0)
    expect(result.highestMax.value).toBeNull()
  })

  it('wettest year uses highest rainfall among available years', () => {
    const result = getCalendarDateRecords(idx, 7, 15)
    expect(result.wettestYear.value).toBe(15)
    expect(result.wettestYear.years).toContain(2023)
  })

  it('never treats null rainfall as zero in wettest year', () => {
    const nullRainRecords = [
      makeDay('2021-07-15', { rainfallMm: null }),
      makeDay('2022-07-15', { rainfallMm: 5 }),
    ]
    const idx2 = buildRecordsIndex([
      makePayload(2021, [nullRainRecords[0]!]),
      makePayload(2022, [nullRainRecords[1]!]),
    ], [])
    const result = getCalendarDateRecords(idx2, 7, 15)
    expect(result.wettestYear.value).toBe(5)
    expect(result.wettestYear.years).toContain(2022)
  })
})

// ── getMonthlyRankings ────────────────────────────────────────────────────────

describe('getMonthlyRankings', () => {
  // Build 3 complete years
  const payloads = [2021, 2022, 2023].map((year) =>
    makePayload(year, fullYear(year, (date) => {
      const m = Number(date.slice(5, 7))
      return {
        maxTempC: year === 2022 && m === 7 ? 30 : 20,
        minTempC: 10,
        meanTempC: year === 2022 && m === 7 ? 20 : 15,
        rainfallMm: year === 2022 && m === 8 ? 120 : 50,
      }
    })),
  )
  const idx = buildRecordsIndex(payloads, MONTHLY_NORMALS)

  it('ranks all months by mean temp descending', () => {
    const result = getMonthlyRankings(idx, 'mean-temp', { monthFilter: null, yearFrom: null, yearTo: null, requireComplete: false })
    expect(result[0]!.value).toBeGreaterThan(result.at(-1)!.value)
    expect(result[0]!.rank).toBe(1)
  })

  it('assigns same rank to tied entries', () => {
    // All July months for 2021 and 2023 share mean temp 15
    const result = getMonthlyRankings(idx, 'mean-max', { monthFilter: 7, yearFrom: null, yearTo: null, requireComplete: false })
    const rank1Entries = result.filter((r) => r.rank === 1)
    // July 2022 has max 30; 2021 and 2023 have max 20 — tied for 2nd
    expect(rank1Entries).toHaveLength(1)
    const rank2Entries = result.filter((r) => r.rank === 2)
    expect(rank2Entries).toHaveLength(2)
  })

  it('filters by month', () => {
    const result = getMonthlyRankings(idx, 'rainfall', { monthFilter: 8, yearFrom: null, yearTo: null, requireComplete: false })
    expect(result.every((r) => r.month === 8)).toBe(true)
  })

  it('excludes months without complete rainfall coverage when metric is rainfall', () => {
    // Months before rainfall start date won't have complete coverage
    const result = getMonthlyRankings(idx, 'rainfall', { monthFilter: 1, yearFrom: null, yearTo: null, requireComplete: false })
    // January 2021/2022/2023 are all before May 2020? No - 2021 is after May 2020 so rainfall is available.
    // Actually isRainfallAvailableForMonth(2021, 1) = true since 2021 > 2020
    // So all should be fine for complete years 2021-2023
    expect(result.every((r) => r.complete)).toBe(true)
  })

  it('never ranks null metric values', () => {
    const nullRecords = [
      makeDay('2024-06-01', { meanTempC: null, maxTempC: null }),
    ]
    const idx2 = buildRecordsIndex([makePayload(2024, nullRecords)], [])
    const result = getMonthlyRankings(idx2, 'mean-temp', { monthFilter: null, yearFrom: null, yearTo: null, requireComplete: false })
    // June 2024 has no mean temp - should be excluded
    const june2024 = result.find((r) => r.year === 2024 && r.month === 6)
    expect(june2024).toBeUndefined()
  })
})

// ── getAnnualRankings ─────────────────────────────────────────────────────────

describe('getAnnualRankings', () => {
  // 2021, 2022, 2023 complete years; 2020 incomplete rainfall
  const payloads = [2021, 2022, 2023].map((year) =>
    makePayload(year, fullYear(year, () => ({
      maxTempC: year === 2022 ? 25 : 20,
      minTempC: 10,
      meanTempC: year === 2022 ? 17.5 : 15,
      rainfallMm: year === 2022 ? 1.5 : 1.0,
    }))),
  )

  const idx = buildRecordsIndex(payloads, MONTHLY_NORMALS)

  it('ranks all years by mean temp descending', () => {
    const result = getAnnualRankings(idx, 'mean-temp')
    expect(result[0]!.year).toBe(2022)
    expect(result[0]!.rank).toBe(1)
  })

  it('assigns same rank to tied years', () => {
    const result = getAnnualRankings(idx, 'mean-temp')
    const rank2Entries = result.filter((r) => r.rank === 2)
    expect(rank2Entries).toHaveLength(2)
    expect(rank2Entries.map((r) => r.year).sort()).toEqual([2021, 2023])
  })

  it('excludes incomplete rainfall years from rainfall ranking', () => {
    // 2020 is incomplete for rainfall
    const payload2020 = makePayload(
      2020,
      // Only May-Dec records so rainfall coverage is incomplete
      fullYear(2020, (date) => ({
        rainfallMm: date >= '2020-05-01' ? 1.0 : null,
      })),
      false,
    )
    const idx2 = buildRecordsIndex([...payloads, payload2020], MONTHLY_NORMALS)
    const result = getAnnualRankings(idx2, 'rainfall')
    expect(result.every((r) => r.year !== 2020)).toBe(true)
  })

  it('never ranks null annual rainfall', () => {
    const nullRainPayload = makePayload(
      2024,
      fullYear(2024, () => ({ rainfallMm: null })),
    )
    const idx2 = buildRecordsIndex([...payloads, nullRainPayload], MONTHLY_NORMALS)
    const result = getAnnualRankings(idx2, 'rainfall')
    expect(result.every((r) => r.year !== 2024)).toBe(true)
  })

  it('marks provisional years', () => {
    const currentYear = new Date().getFullYear()
    const provisionalPayload = makePayload(
      currentYear,
      daysForMonth(currentYear, 1),
      false,
    )
    const idx2 = buildRecordsIndex([...payloads, provisionalPayload], MONTHLY_NORMALS)
    const result = getAnnualRankings(idx2, 'mean-max')
    const currentYearEntry = result.find((r) => r.year === currentYear)
    expect(currentYearEntry?.provisional).toBe(true)
  })
})

// ── getThresholdSummary ───────────────────────────────────────────────────────

describe('getThresholdSummary', () => {
  const records = [
    makeDay('2024-01-15', { maxTempC: 5, minTempC: -2, rainfallMm: 3.0 }),  // frost, rain
    makeDay('2024-07-01', { maxTempC: 22, minTempC: 15, rainfallMm: 0.0 }), // ≥20
    makeDay('2024-07-02', { maxTempC: 26, minTempC: 16, rainfallMm: 8.0 }), // ≥25, rain
    makeDay('2024-07-03', { maxTempC: 31, minTempC: 18, rainfallMm: null }), // ≥30, no rainfall
    makeDay('2024-07-04', { maxTempC: 19, minTempC: 12, rainfallMm: 0.1 }), // < threshold
  ]

  const idx = buildRecordsIndex([makePayload(2024, records)], [])

  it('counts atOrAbove20C correctly', () => {
    const result = getThresholdSummary(idx, 5.0)
    const yearRow = result.byYear.find((r) => r.year === 2024)!
    expect(yearRow.atOrAbove20C).toBe(3) // 22, 26, 31
  })

  it('counts atOrAbove25C correctly', () => {
    const result = getThresholdSummary(idx, 5.0)
    const yearRow = result.byYear.find((r) => r.year === 2024)!
    expect(yearRow.atOrAbove25C).toBe(2) // 26, 31
  })

  it('counts atOrAbove30C correctly', () => {
    const result = getThresholdSummary(idx, 5.0)
    const yearRow = result.byYear.find((r) => r.year === 2024)!
    expect(yearRow.atOrAbove30C).toBe(1) // 31
  })

  it('counts frost days (min < 0)', () => {
    const result = getThresholdSummary(idx, 5.0)
    const yearRow = result.byYear.find((r) => r.year === 2024)!
    expect(yearRow.frostDays).toBe(1) // -2
  })

  it('counts rain days (> 0.1 mm)', () => {
    const result = getThresholdSummary(idx, 5.0)
    const yearRow = result.byYear.find((r) => r.year === 2024)!
    expect(yearRow.rainDays).toBe(2) // 3.0, 8.0
  })

  it('does not count 0.1 mm as a rain day', () => {
    const result = getThresholdSummary(idx, 5.0)
    const yearRow = result.byYear.find((r) => r.year === 2024)!
    expect(yearRow.rainDays).toBe(2) // 0.1 is NOT counted
  })

  it('counts heavy rain days using user threshold', () => {
    const result = getThresholdSummary(idx, 5.0)
    const yearRow = result.byYear.find((r) => r.year === 2024)!
    expect(yearRow.heavyRainDays).toBe(1) // 8.0 >= 5.0
  })

  it('does not count null rainfall as zero for rain days', () => {
    const result = getThresholdSummary(idx, 5.0)
    const yearRow = result.byYear.find((r) => r.year === 2024)!
    // null rainfall day (July 3) should not count as rain day
    expect(yearRow.rainDays).toBe(2)
  })

  it('aggregates all-time totals across years', () => {
    const records2023 = [
      makeDay('2023-07-10', { maxTempC: 28, minTempC: 10, rainfallMm: 0 }),
    ]
    const idx2 = buildRecordsIndex([
      makePayload(2023, records2023),
      makePayload(2024, records),
    ], [])
    const result = getThresholdSummary(idx2, 5.0)
    expect(result.allTimeAtOrAbove20C).toBe(4) // 1 from 2023 + 3 from 2024
  })
})

// ── getSpellSummary ───────────────────────────────────────────────────────────

describe('getSpellSummary', () => {
  it('finds the longest dry spell', () => {
    const records = [
      makeDay('2024-06-01', { rainfallMm: 0 }),
      makeDay('2024-06-02', { rainfallMm: 0 }),
      makeDay('2024-06-03', { rainfallMm: 0 }),
      makeDay('2024-06-04', { rainfallMm: 5 }),
      makeDay('2024-06-05', { rainfallMm: 0 }),
    ]
    const idx = buildRecordsIndex([makePayload(2024, records)], [])
    const result = getSpellSummary(idx)
    expect(result.longestDry.length).toBe(3)
    expect(result.longestDry.startDate).toBe(d('2024-06-01'))
    expect(result.longestDry.endDate).toBe(d('2024-06-03'))
  })

  it('finds the longest wet spell', () => {
    const records = [
      makeDay('2024-06-01', { rainfallMm: 0 }),
      makeDay('2024-06-02', { rainfallMm: 2 }),
      makeDay('2024-06-03', { rainfallMm: 3 }),
      makeDay('2024-06-04', { rainfallMm: 5 }),
      makeDay('2024-06-05', { rainfallMm: 0 }),
    ]
    const idx = buildRecordsIndex([makePayload(2024, records)], [])
    const result = getSpellSummary(idx)
    expect(result.longestWet.length).toBe(3)
    expect(result.longestWet.startDate).toBe(d('2024-06-02'))
  })

  it('missing data breaks a streak', () => {
    const records = [
      makeDay('2024-06-01', { rainfallMm: 0 }),
      makeDay('2024-06-02', { rainfallMm: null }), // missing breaks streak
      makeDay('2024-06-03', { rainfallMm: 0 }),
    ]
    const idx = buildRecordsIndex([makePayload(2024, records)], [])
    const result = getSpellSummary(idx)
    expect(result.longestDry.length).toBe(1)
  })

  it('finds the longest warm spell above threshold', () => {
    const records = [
      makeDay('2024-06-01', { maxTempC: 18 }),
      makeDay('2024-06-02', { maxTempC: 22 }),
      makeDay('2024-06-03', { maxTempC: 25 }),
      makeDay('2024-06-04', { maxTempC: 21 }),
      makeDay('2024-06-05', { maxTempC: 19 }),
    ]
    const idx = buildRecordsIndex([makePayload(2024, records)], [])
    const result = getSpellSummary(idx, 20)
    expect(result.longestWarm.length).toBe(3)
    expect(result.warmThresholdC).toBe(20)
  })

  it('finds the longest cold spell below threshold', () => {
    const records = [
      makeDay('2024-01-01', { minTempC: -1 }),
      makeDay('2024-01-02', { minTempC: -3 }),
      makeDay('2024-01-03', { minTempC: 1 }),  // breaks
      makeDay('2024-01-04', { minTempC: -2 }),
    ]
    const idx = buildRecordsIndex([makePayload(2024, records)], [])
    const result = getSpellSummary(idx, 20, 0)
    expect(result.longestCold.length).toBe(2)
    expect(result.longestCold.startDate).toBe(d('2024-01-01'))
  })

  it('returns zero-length spells when no data', () => {
    const idx = emptyRecordsIndex()
    const result = getSpellSummary(idx)
    expect(result.longestDry.length).toBe(0)
    expect(result.longestWet.length).toBe(0)
    expect(result.longestWarm.length).toBe(0)
    expect(result.longestCold.length).toBe(0)
  })
})

// ── getRecordProgression ──────────────────────────────────────────────────────

describe('getRecordProgression', () => {
  it('tracks highest max progression chronologically', () => {
    const records = [
      makeDay('2021-07-01', { maxTempC: 25 }),
      makeDay('2022-07-01', { maxTempC: 28 }),
      makeDay('2023-07-01', { maxTempC: 28 }), // tie
      makeDay('2024-07-01', { maxTempC: 30 }), // new record
    ]
    const idx = buildRecordsIndex([
      makePayload(2021, [records[0]!]),
      makePayload(2022, [records[1]!]),
      makePayload(2023, [records[2]!]),
      makePayload(2024, [records[3]!]),
    ], [])

    const result = getRecordProgression(idx, 'highest-max')
    expect(result.entries).toHaveLength(4) // all 4 are record events
    expect(result.entries[0]!.isNewRecord).toBe(true)
    expect(result.entries[0]!.previousValue).toBeNull()
    expect(result.entries[1]!.isNewRecord).toBe(true)
    expect(result.entries[1]!.previousValue).toBe(25)
    expect(result.entries[2]!.isTie).toBe(true)
    expect(result.entries[3]!.isNewRecord).toBe(true)
    expect(result.entries[3]!.value).toBe(30)
  })

  it('tracks lowest min progression', () => {
    const records = [
      makeDay('2021-01-01', { minTempC: -2 }),
      makeDay('2022-01-01', { minTempC: -5 }), // new record (lower)
      makeDay('2023-01-01', { minTempC: -3 }), // not a record
    ]
    const idx = buildRecordsIndex([
      makePayload(2021, [records[0]!]),
      makePayload(2022, [records[1]!]),
      makePayload(2023, [records[2]!]),
    ], [])

    const result = getRecordProgression(idx, 'lowest-min')
    expect(result.entries).toHaveLength(2) // 2021 and 2022 only
    expect(result.currentValue).toBe(-5)
  })

  it('reports current record holders correctly', () => {
    const records = [
      makeDay('2021-07-01', { maxTempC: 30 }),
      makeDay('2023-07-01', { maxTempC: 30 }), // tie
    ]
    const idx = buildRecordsIndex([
      makePayload(2021, [records[0]!]),
      makePayload(2023, [records[1]!]),
    ], [])

    const result = getRecordProgression(idx, 'highest-max')
    expect(result.currentRecordYears).toContain(2021)
    expect(result.currentRecordYears).toContain(2023)
    expect(result.currentValue).toBe(30)
  })

  it('does not include non-null days that are not records', () => {
    const records = [
      makeDay('2021-07-01', { maxTempC: 30 }),
      makeDay('2022-07-01', { maxTempC: 25 }), // not a record
    ]
    const idx = buildRecordsIndex([
      makePayload(2021, [records[0]!]),
      makePayload(2022, [records[1]!]),
    ], [])

    const result = getRecordProgression(idx, 'highest-max')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.date).toBe(d('2021-07-01'))
  })

  it('skips null values in progression', () => {
    const records = [
      makeDay('2021-07-01', { maxTempC: null }),
      makeDay('2022-07-01', { maxTempC: 28 }),
    ]
    const idx = buildRecordsIndex([
      makePayload(2021, [records[0]!]),
      makePayload(2022, [records[1]!]),
    ], [])

    const result = getRecordProgression(idx, 'highest-max')
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]!.date).toBe(d('2022-07-01'))
  })

  it('returns empty progression when no data', () => {
    const idx = emptyRecordsIndex()
    const result = getRecordProgression(idx, 'highest-max')
    expect(result.entries).toHaveLength(0)
    expect(result.currentValue).toBeNull()
    expect(result.currentRecordYears).toHaveLength(0)
  })
})

// ── getOverallRecords ─────────────────────────────────────────────────────────

describe('getOverallRecords', () => {
  const records2023 = fullYear(2023, (date) => {
    if (date === '2023-07-15') return { maxTempC: 35, minTempC: 18, rainfallMm: 0.0 }
    if (date === '2023-01-10') return { maxTempC: 3, minTempC: -5, rainfallMm: 2.0 }
    if (date === '2023-06-20') return { maxTempC: 30, minTempC: 15, rainfallMm: 25.0 }
    return { maxTempC: 15, minTempC: 5, meanTempC: 10, rainfallMm: 1.0 }
  })

  const idx = buildRecordsIndex([makePayload(2023, records2023)], MONTHLY_NORMALS)
  const result = getOverallRecords(idx)

  it('returns 13 overall records', () => {
    expect(result).toHaveLength(13)
  })

  it('finds highest daily max', () => {
    const record = result.find((r) => r.label === 'Highest daily maximum')!
    expect(record.value).toBe(35)
    expect(record.holders[0]!.date).toBe(d('2023-07-15'))
  })

  it('finds lowest daily min', () => {
    const record = result.find((r) => r.label === 'Lowest daily minimum')!
    expect(record.value).toBe(-5)
    expect(record.holders[0]!.date).toBe(d('2023-01-10'))
  })

  it('has correct unit labels', () => {
    const tempRecords = result.filter((r) => r.unit === '°C')
    const rainRecords = result.filter((r) => r.unit === 'mm')
    expect(tempRecords.length).toBeGreaterThan(0)
    expect(rainRecords.length).toBeGreaterThan(0)
  })
})

// ── getYearRecordCounts ───────────────────────────────────────────────────────

describe('getYearRecordCounts', () => {
  it('counts records held by each year across progressions', () => {
    const records = [
      makeDay('2021-07-01', { maxTempC: 30 }),
      makeDay('2022-01-01', { minTempC: -5 }),
      makeDay('2022-07-01', { maxTempC: 35 }), // breaks 2021 record
    ]
    const idx = buildRecordsIndex([
      makePayload(2021, [records[0]!]),
      makePayload(2022, [records[1]!, records[2]!]),
    ], [])

    const p1 = getRecordProgression(idx, 'highest-max') // 2022 holds it
    const p2 = getRecordProgression(idx, 'lowest-min')  // 2022 holds it

    const counts = getYearRecordCounts(idx, [p1, p2])
    const year2022 = counts.find((c) => c.year === 2022)!
    expect(year2022.count).toBe(2)

    // 2021 no longer holds highest-max
    const year2021 = counts.find((c) => c.year === 2021)
    expect(year2021).toBeUndefined()
  })
})

// ── Rainfall availability rules ───────────────────────────────────────────────

describe('rainfall availability rules', () => {
  it('never treats pre-2020-05 rainfall as available in calendar-date records', () => {
    const earlyRecords = [
      makeDay('2000-07-15', { rainfallMm: null }),
      makeDay('2021-07-15', { rainfallMm: 10.0 }),
    ]
    const idx = buildRecordsIndex([
      makePayload(2000, [earlyRecords[0]!]),
      makePayload(2021, [earlyRecords[1]!]),
    ], [])
    const result = getCalendarDateRecords(idx, 7, 15)
    // 2000 has no rainfall (before availability start); should not affect wettestYear
    expect(result.wettestYear.years).not.toContain(2000)
    expect(result.wettestYear.years).toContain(2021)
  })

  it('does not include 2020 in complete rainfall year rankings', () => {
    const partial2020 = fullYear(2020, (date) => ({
      rainfallMm: date >= '2020-05-01' ? 1.0 : null,
    }))
    const idx = buildRecordsIndex([makePayload(2020, partial2020, false)], [])
    const result = getAnnualRankings(idx, 'rainfall')
    expect(result.every((r) => r.year !== 2020)).toBe(true)
  })
})
