import { describe, expect, it } from 'vitest'
import type { ClimateDateString, ClimateDay, MonthlyNormal } from '@/types/weather'
import {
  buildAnnualSummary,
  buildMonthlySummary,
  isRainfallAvailableForMonth,
  isRainfallAvailableForYear,
} from '@/features/climateArchive/calculations'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDay(
  date: ClimateDateString,
  overrides: Partial<ClimateDay> = {},
): ClimateDay {
  return {
    date,
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
  overrides: (date: ClimateDateString) => Partial<ClimateDay> = () => ({}),
): ClimateDay[] {
  const days: ClimateDay[] = []
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}` as ClimateDateString
    days.push(makeDay(date, overrides(date)))
  }
  return days
}

const JUNE_NORMAL: MonthlyNormal = {
  month: 6,
  meanMaxTempC: 20,
  meanMinTempC: 12,
  meanTempC: 16,
  rainfallMm: 50,
}

// ── isRainfallAvailableForMonth ───────────────────────────────────────────────

describe('isRainfallAvailableForMonth', () => {
  it('returns false before May 2020', () => {
    expect(isRainfallAvailableForMonth(2019, 12)).toBe(false)
    expect(isRainfallAvailableForMonth(2020, 4)).toBe(false)
    expect(isRainfallAvailableForMonth(1995, 1)).toBe(false)
  })

  it('returns true from May 2020 onwards', () => {
    expect(isRainfallAvailableForMonth(2020, 5)).toBe(true)
    expect(isRainfallAvailableForMonth(2020, 12)).toBe(true)
    expect(isRainfallAvailableForMonth(2021, 1)).toBe(true)
    expect(isRainfallAvailableForMonth(2026, 7)).toBe(true)
  })
})

describe('isRainfallAvailableForYear', () => {
  it('returns false for 2020 and earlier', () => {
    expect(isRainfallAvailableForYear(2020)).toBe(false)
    expect(isRainfallAvailableForYear(2019)).toBe(false)
  })

  it('returns true for 2021 and later', () => {
    expect(isRainfallAvailableForYear(2021)).toBe(true)
    expect(isRainfallAvailableForYear(2026)).toBe(true)
  })
})

// ── buildMonthlySummary ───────────────────────────────────────────────────────

describe('buildMonthlySummary', () => {
  it('calculates basic statistics from complete month records', () => {
    const records = daysForMonth(2024, 6, () => ({
      maxTempC: 22,
      minTempC: 14,
      meanTempC: 18,
      rainfallMm: 0,
    }))

    const summary = buildMonthlySummary(2024, 6, records, JUNE_NORMAL)

    expect(summary.year).toBe(2024)
    expect(summary.month).toBe(6)
    expect(summary.meanMaxTempC).toBeCloseTo(22)
    expect(summary.meanMinTempC).toBeCloseTo(14)
    expect(summary.meanTempC).toBeCloseTo(18)
    expect(summary.rainDays).toBe(0)
    expect(summary.rainfallTotalMm).toBeCloseTo(0)
  })

  it('correctly identifies highest max with all tied dates', () => {
    const records = daysForMonth(2024, 6, (date) => ({
      maxTempC: date === '2024-06-10' || date === '2024-06-20' ? 30 : 22,
    }))

    const summary = buildMonthlySummary(2024, 6, records, null)

    expect(summary.highestMax.value).toBe(30)
    expect(summary.highestMax.dates).toHaveLength(2)
    expect(summary.highestMax.dates).toContain('2024-06-10' as ClimateDateString)
    expect(summary.highestMax.dates).toContain('2024-06-20' as ClimateDateString)
  })

  it('correctly identifies lowest min with tied dates', () => {
    const records = daysForMonth(2024, 1, (date) => ({
      minTempC: date === '2024-01-05' || date === '2024-01-15' ? -5 : 2,
    }))

    const summary = buildMonthlySummary(2024, 1, records, null)

    expect(summary.lowestMin.value).toBe(-5)
    expect(summary.lowestMin.dates).toHaveLength(2)
  })

  it('returns null statistics when month has no records', () => {
    const summary = buildMonthlySummary(2024, 6, [], null)

    expect(summary.meanMaxTempC).toBeNull()
    expect(summary.meanMinTempC).toBeNull()
    expect(summary.meanTempC).toBeNull()
    expect(summary.rainfallTotalMm).toBeNull()
    expect(summary.rainDays).toBe(0)
    expect(summary.highestMax.value).toBeNull()
    expect(summary.highestMax.dates).toHaveLength(0)
  })

  it('counts rain days only above 0.1 mm threshold', () => {
    const records: ClimateDay[] = [
      makeDay('2024-06-01' as ClimateDateString, { rainfallMm: 0.0 }),
      makeDay('2024-06-02' as ClimateDateString, { rainfallMm: 0.1 }),
      makeDay('2024-06-03' as ClimateDateString, { rainfallMm: 0.2 }),
      makeDay('2024-06-04' as ClimateDateString, { rainfallMm: 5.4 }),
    ]

    const summary = buildMonthlySummary(2024, 6, records, null)

    // 0.0 and 0.1 are NOT rain days; 0.2 and 5.4 ARE
    expect(summary.rainDays).toBe(2)
  })

  it('identifies wettest day with ties', () => {
    const records: ClimateDay[] = [
      makeDay('2024-06-01' as ClimateDateString, { rainfallMm: 12.5 }),
      makeDay('2024-06-10' as ClimateDateString, { rainfallMm: 12.5 }),
      makeDay('2024-06-20' as ClimateDateString, { rainfallMm: 8.0 }),
    ]

    const summary = buildMonthlySummary(2024, 6, records, null)

    expect(summary.wettestDay.value).toBe(12.5)
    expect(summary.wettestDay.dates).toHaveLength(2)
  })

  it('excludes missing temperature days from mean calculations', () => {
    const records: ClimateDay[] = [
      makeDay('2024-06-01' as ClimateDateString, { maxTempC: 20, minTempC: 10, meanTempC: 15 }),
      makeDay('2024-06-02' as ClimateDateString, { maxTempC: null, minTempC: null, meanTempC: null }),
      makeDay('2024-06-03' as ClimateDateString, { maxTempC: 24, minTempC: 14, meanTempC: 19 }),
    ]

    const summary = buildMonthlySummary(2024, 6, records, null)

    expect(summary.meanMaxTempC).toBeCloseTo(22)
    expect(summary.meanMinTempC).toBeCloseTo(12)
    expect(summary.meanTempC).toBeCloseTo(17)
  })

  it('handles null rainfall correctly - does not treat null as zero', () => {
    const records: ClimateDay[] = [
      makeDay('2024-06-01' as ClimateDateString, { rainfallMm: 5.0 }),
      makeDay('2024-06-02' as ClimateDateString, { rainfallMm: null }),
      makeDay('2024-06-03' as ClimateDateString, { rainfallMm: 3.0 }),
    ]

    const summary = buildMonthlySummary(2024, 6, records, null)

    // Only sums the 2 valid values
    expect(summary.rainfallTotalMm).toBeCloseTo(8.0)
  })

  it('returns null rainfall total when ALL rainfall values are null', () => {
    const records: ClimateDay[] = [
      makeDay('2020-01-01' as ClimateDateString, { rainfallMm: null }),
      makeDay('2020-01-02' as ClimateDateString, { rainfallMm: null }),
    ]

    const summary = buildMonthlySummary(2020, 1, records, null)

    expect(summary.rainfallTotalMm).toBeNull()
  })

  it('calculates anomalies correctly against normal', () => {
    const records = daysForMonth(2024, 6, () => ({
      maxTempC: 24,
      minTempC: 16,
      meanTempC: 20,
      rainfallMm: 2.5,
    }))

    const summary = buildMonthlySummary(2024, 6, records, JUNE_NORMAL)

    // Mean max = 24, normal = 20 → anomaly = +4
    expect(summary.meanMaxTempAnomalyC).toBeCloseTo(4)
    // Mean min = 16, normal = 12 → anomaly = +4
    expect(summary.meanMinTempAnomalyC).toBeCloseTo(4)
    // Mean = 20, normal = 16 → anomaly = +4
    expect(summary.meanTempAnomalyC).toBeCloseTo(4)
    // Rainfall total = 30 days × 2.5 = 75, fixed June normal = 64.8
    expect(summary.rainfallPercentageOfNormal).toBeCloseTo((75 / 64.8) * 100)
  })

  it('marks current month as provisional', () => {
    // referenceDate = 2024-06-15 means June 2024 is still in progress
    const records = daysForMonth(2024, 6, () => ({ maxTempC: 20, minTempC: 10 }))
    const summary = buildMonthlySummary(2024, 6, records, null, {
      referenceDate: '2024-06-15' as ClimateDateString,
    })

    expect(summary.coverage.provisional).toBe(true)
  })

  it('marks completed past month as not provisional', () => {
    const records = daysForMonth(2024, 5, () => ({ maxTempC: 18, minTempC: 8 }))
    const summary = buildMonthlySummary(2024, 5, records, null, {
      referenceDate: '2024-06-01' as ClimateDateString,
    })

    expect(summary.coverage.provisional).toBe(false)
  })
})

// ── buildAnnualSummary ────────────────────────────────────────────────────────

describe('buildAnnualSummary', () => {
  it('builds monthly summaries for all 12 months', () => {
    const records: ClimateDay[] = []
    for (let m = 1; m <= 12; m++) {
      records.push(...daysForMonth(2023, m))
    }

    const normals: MonthlyNormal[] = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      meanMaxTempC: 15,
      meanMinTempC: 5,
      meanTempC: 10,
      rainfallMm: 50,
    }))

    const summary = buildAnnualSummary(2023, records, normals)

    expect(summary.monthlySummaries).toHaveLength(12)
    expect(summary.monthlySummaries.every((m) => m.year === 2023)).toBe(true)
  })

  it('does not treat 2020 as having a complete rainfall year', () => {
    // 2020: rainfall only from May, so annual rainfall total is partial
    const records: ClimateDay[] = []
    for (let m = 1; m <= 12; m++) {
      const rainfallMm = m >= 5 ? 2.0 : null
      records.push(...daysForMonth(2020, m, () => ({ rainfallMm })))
    }

    const summary = buildAnnualSummary(2020, records, [])

    // The coverage.rainfall should not be complete (unavailable days in Jan-Apr)
    expect(summary.coverage.rainfall.complete).toBe(false)
    expect(summary.coverage.rainfall.unavailable).toBeGreaterThan(0)
  })

  it('identifies annual highest max across all months with ties', () => {
    const records: ClimateDay[] = [
      makeDay('2024-07-15' as ClimateDateString, { maxTempC: 35.2 }),
      makeDay('2024-08-03' as ClimateDateString, { maxTempC: 35.2 }),
      makeDay('2024-06-10' as ClimateDateString, { maxTempC: 30.0 }),
    ]

    const summary = buildAnnualSummary(2024, records, [])

    expect(summary.highestMax.value).toBe(35.2)
    expect(summary.highestMax.dates).toHaveLength(2)
  })

  it('handles partial year (current provisional year)', () => {
    // Only January through March records exist for 2026
    const records: ClimateDay[] = []
    for (let m = 1; m <= 3; m++) {
      records.push(...daysForMonth(2026, m))
    }

    const summary = buildAnnualSummary(2026, records, [], {
      referenceDate: '2026-03-31' as ClimateDateString,
    })

    expect(summary.coverage.provisional).toBe(true)
    expect(summary.monthlySummaries[0]?.year).toBe(2026)
    expect(summary.meanTempAnomalyC).toBeNull()
  })

  it('returns null for empty records', () => {
    const summary = buildAnnualSummary(2024, [], [])

    expect(summary.meanMaxTempC).toBeNull()
    expect(summary.rainfallTotalMm).toBeNull()
    expect(summary.highestMax.value).toBeNull()
  })

  it('preserves genuine zero rainfall days', () => {
    const records: ClimateDay[] = [
      makeDay('2024-06-01' as ClimateDateString, { rainfallMm: 0.0 }),
      makeDay('2024-06-02' as ClimateDateString, { rainfallMm: 0.0 }),
    ]

    const summary = buildAnnualSummary(2024, records, [])

    expect(summary.rainfallTotalMm).toBeCloseTo(0.0)
    expect(summary.rainDays).toBe(0)
  })

  it('does not silently remove missing days from coverage count', () => {
    // 29 of 30 June days present; one missing
    const records = daysForMonth(2024, 6)
    const withMissing = records.filter((r) => r.date !== ('2024-06-15' as ClimateDateString))

    const summary = buildAnnualSummary(2024, withMissing, [], {
      referenceDate: '2024-07-01' as ClimateDateString,
    })

    const juneSummary = summary.monthlySummaries.find((m) => m.month === 6)
    expect(juneSummary?.coverage.maxTemperature.missing).toBe(1)
    expect(juneSummary?.coverage.maxTemperature.valid).toBe(29)
  })

  it('does not calculate annual rainfall percentage of normal for incomplete rainfall years', () => {
    const records: ClimateDay[] = []
    for (let month = 1; month <= 12; month++) {
      records.push(
        ...daysForMonth(2020, month, () => ({
          rainfallMm: month >= 5 ? 2 : null,
        })),
      )
    }

    const summary = buildAnnualSummary(2020, records, Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      meanMaxTempC: 15,
      meanMinTempC: 5,
      meanTempC: 10,
      rainfallMm: 50,
    })))

    expect(summary.rainfallPercentageOfNormal).toBeNull()
    expect(summary.rainfallDifferenceFromNormalMm).toBeNull()
  })
})
