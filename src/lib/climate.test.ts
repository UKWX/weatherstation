import { describe, expect, it } from 'vitest'
import type { ClimateDateString, ClimateDay } from '@/types/weather'
import {
  calculateAnnualCompleteness,
  calculateColdStreak,
  calculateDailyMeanTemperature,
  calculateDryStreak,
  calculateMonthlyCompleteness,
  calculateRainfallDifferenceFromNormal,
  calculateRainfallPercentageOfNormal,
  calculateSafeAverage,
  calculateSafeTotal,
  calculateTemperatureAnomaly,
  calculateThresholdCounts,
  calculateWarmStreak,
  calculateWetStreak,
  collectTiedValues,
  countValidAndMissingObservations,
  expectedDaysInPeriod,
  formatEuropeLondonDisplay,
  formatNullableMeasurement,
  getMeteorologicalSeason,
  getMeteorologicalSeasonYear,
  isProvisionalPeriod,
  parseIsoClimateDate,
} from '@/lib/climate'

function createClimateDay(
  date: ClimateDateString,
  overrides: Partial<ClimateDay> = {},
): ClimateDay {
  return {
    date,
    maxTempC: 10,
    minTempC: 2,
    meanTempC: 6,
    rainfallMm: 0,
    status: 'finalised',
    ...overrides,
  }
}

function createDailyRange(
  startDate: ClimateDateString,
  endDate: ClimateDateString,
  overrides: (date: ClimateDateString) => Partial<ClimateDay> = () => ({}),
): ClimateDay[] {
  const results: ClimateDay[] = []
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)

  for (let cursor = start; cursor <= end; cursor = new Date(cursor.valueOf() + 86400000)) {
    const date = cursor.toISOString().slice(0, 10) as ClimateDateString
    results.push(createClimateDay(date, overrides(date)))
  }

  return results
}

describe('climate utilities', () => {
  it('parses ISO climate dates and rejects impossible dates', () => {
    expect(parseIsoClimateDate('2024-02-29')).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    })

    expect(() => parseIsoClimateDate('2023-02-29')).toThrow(/Invalid climate date/)
  })

  it('formats climate dates and UTC timestamps in Europe/London', () => {
    expect(
      formatEuropeLondonDisplay('2024-02-29', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
    ).toBe('29 Feb 2024')

    expect(
      formatEuropeLondonDisplay('2024-06-01T12:00:00Z', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }),
    ).toBe('13:00')
  })

  it('formats nullable measurements without losing genuine zeroes', () => {
    expect(formatNullableMeasurement(null, { unit: 'mm' })).toBe('—')
    expect(formatNullableMeasurement(0, { unit: 'mm' })).toBe('0.0 mm')
  })

  it('calculates daily means only when both temperatures exist', () => {
    expect(calculateDailyMeanTemperature(20, 10)).toBe(15)
    expect(calculateDailyMeanTemperature(20, null)).toBeNull()
  })

  it('calculates safe averages and totals from valid values only', () => {
    expect(calculateSafeAverage([10, null, 20, undefined])).toBe(15)
    expect(calculateSafeAverage([null, undefined])).toBeNull()
    expect(calculateSafeTotal([0, null, 1.2])).toBeCloseTo(1.2)
    expect(calculateSafeTotal([null, undefined])).toBeNull()
  })

  it('collects all tied values for record holders', () => {
    const result = collectTiedValues(
      [
        createClimateDay('2024-07-01', { maxTempC: 25 }),
        createClimateDay('2024-07-02', { maxTempC: 27 }),
        createClimateDay('2024-07-03', { maxTempC: 27 }),
      ],
      (day) => day.maxTempC,
    )

    expect(result).toEqual({
      value: 27,
      items: [
        createClimateDay('2024-07-02', { maxTempC: 27 }),
        createClimateDay('2024-07-03', { maxTempC: 27 }),
      ],
    })
  })

  it('calculates anomalies and handles zero rainfall normals safely', () => {
    expect(calculateTemperatureAnomaly(12, 10)).toBe(2)
    expect(calculateRainfallDifferenceFromNormal(45, 30)).toBe(15)
    expect(calculateRainfallPercentageOfNormal(45, 30)).toBe(150)
    expect(calculateRainfallPercentageOfNormal(45, 0)).toBeNull()
  })

  it('derives meteorological seasons and winter season years', () => {
    expect(getMeteorologicalSeason('2024-12-01')).toBe('winter')
    expect(getMeteorologicalSeason('2024-03-01')).toBe('spring')
    expect(getMeteorologicalSeasonYear('2024-12-15')).toBe(2025)
    expect(getMeteorologicalSeasonYear('2025-01-15')).toBe(2025)
  })

  it('counts expected days across leap years and incomplete current periods', () => {
    expect(expectedDaysInPeriod('2024-02-01', '2024-02-29')).toBe(29)
    expect(
      expectedDaysInPeriod('2024-02-01', '2024-02-29', {
        referenceDate: '2024-02-15',
      }),
    ).toBe(15)
  })

  it('flags current periods as provisional until they finish', () => {
    expect(
      isProvisionalPeriod('2024-02-01', '2024-02-29', {
        referenceDate: '2024-02-15',
      }),
    ).toBe(true)

    expect(
      isProvisionalPeriod('2024-02-01', '2024-02-29', {
        referenceDate: '2024-03-01',
      }),
    ).toBe(false)
  })

  it('calculates monthly completeness for leap-day months and incomplete current months', () => {
    const fullLeapMonth = createDailyRange('2024-02-01', '2024-02-29')
    const completeCoverage = calculateMonthlyCompleteness(2024, 2, fullLeapMonth, {
      referenceDate: '2024-03-01',
    })

    expect(completeCoverage.expectedDays).toBe(29)
    expect(completeCoverage.maxTemperature.complete).toBe(true)
    expect(completeCoverage.rainfall.complete).toBe(true)

    const incompleteCurrentMonth = calculateMonthlyCompleteness(
      2024,
      2,
      fullLeapMonth.filter((day) => day.date !== '2024-02-10'),
      { referenceDate: '2024-02-15' },
    )

    expect(incompleteCurrentMonth.provisional).toBe(true)
    expect(incompleteCurrentMonth.expectedDays).toBe(15)
    expect(incompleteCurrentMonth.maxTemperature.missing).toBe(1)
    expect(incompleteCurrentMonth.maxTemperature.complete).toBe(false)
  })

  it('treats rainfall before May 2020 as unavailable and never complete for 2020 annual rainfall', () => {
    const rainfallYear = createDailyRange('2020-01-01', '2020-12-31')
    const coverage = calculateAnnualCompleteness(2020, rainfallYear, {
      referenceDate: '2021-01-01',
    })

    expect(coverage.rainfall.unavailable).toBe(121)
    expect(coverage.rainfall.valid).toBe(245)
    expect(coverage.rainfall.complete).toBe(false)
    expect(coverage.maxTemperature.complete).toBe(true)
  })

  it('counts thresholds with strict rain-day handling', () => {
    const counts = calculateThresholdCounts(
      [
        createClimateDay('2024-01-01', {
          maxTempC: 20,
          minTempC: -1,
          rainfallMm: 0.1,
        }),
        createClimateDay('2024-01-02', {
          maxTempC: 26,
          minTempC: 4,
          rainfallMm: 10,
        }),
        createClimateDay('2024-01-03', {
          maxTempC: 31,
          minTempC: 5,
          rainfallMm: 20,
        }),
      ],
      10,
    )

    expect(counts).toEqual({
      atOrAbove20C: 3,
      atOrAbove25C: 2,
      atOrAbove30C: 1,
      frostDays: 1,
      rainDays: 2,
      heavyRainDays: 2,
    })
  })

  it('breaks streaks on missing values and preserves zero-rain dry spells', () => {
    const streakDays = [
      createClimateDay('2024-07-01', { rainfallMm: 0 }),
      createClimateDay('2024-07-02', { rainfallMm: 0.1 }),
      createClimateDay('2024-07-03', { rainfallMm: 0.2 }),
      createClimateDay('2024-07-04', { rainfallMm: null }),
      createClimateDay('2024-07-05', { rainfallMm: 0.3 }),
      createClimateDay('2024-07-06', { rainfallMm: 0.4 }),
      createClimateDay('2024-07-07', { rainfallMm: 0 }),
      createClimateDay('2024-07-08', {
        maxTempC: 21,
        minTempC: -1,
        rainfallMm: null,
      }),
      createClimateDay('2024-07-09', {
        maxTempC: 22,
        minTempC: -2,
        rainfallMm: null,
      }),
      createClimateDay('2024-07-10', {
        maxTempC: null,
        minTempC: null,
        rainfallMm: null,
      }),
      createClimateDay('2024-07-11', {
        maxTempC: 23,
        minTempC: -3,
        rainfallMm: null,
      }),
    ]

    expect(calculateDryStreak(streakDays)).toMatchObject({
      length: 2,
      startDate: '2024-07-01',
      endDate: '2024-07-02',
    })
    expect(calculateWetStreak(streakDays)).toMatchObject({
      length: 2,
      startDate: '2024-07-05',
      endDate: '2024-07-06',
    })
    expect(calculateWarmStreak(streakDays)).toMatchObject({
      length: 2,
      startDate: '2024-07-08',
      endDate: '2024-07-09',
    })
    expect(calculateColdStreak(streakDays)).toMatchObject({
      length: 2,
      startDate: '2024-07-10',
      endDate: '2024-07-11',
    })
  })

  it('counts valid, missing and unavailable observations explicitly', () => {
    const records = createDailyRange('2020-04-29', '2020-05-03', (date) => {
      if (date === '2020-05-02') {
        return { rainfallMm: null }
      }

      return {}
    })

    expect(
      countValidAndMissingObservations(records, (record) => record.rainfallMm, {
        startDate: '2020-04-29',
        endDate: '2020-05-03',
        availabilityStartDate: '2020-05-01',
        referenceDate: '2020-05-03',
      }),
    ).toEqual({
      valid: 2,
      missing: 1,
      unavailable: 2,
      availableDays: 3,
      expectedDays: 5,
    })
  })
})
