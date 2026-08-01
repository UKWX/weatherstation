import { describe, expect, it } from 'vitest'
import type { ClimateDateString, ClimateDay, MonthlyNormal } from '@/types/weather'
import {
  buildComparisonPeriodResult,
  buildComparisonResult,
  buildSamePeriodResults,
  deriveOutcomeLabel,
  extractRecordsForPeriod,
} from './calculations'
import {
  getSeasonDateRange,
  periodDurationDays,
  resolveSamePeriodForYear,
  selectorToUrlParams,
  urlParamsToSelector,
  validateSelector,
  yearsInRange,
} from './selectionLogic'
import type {
  CustomPeriodSelector,
  DateVsDateSelector,
  MonthVsMonthSelector,
  SamePeriodSelector,
  SeasonVsSeasonSelector,
  YearVsYearSelector,
} from './types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function day(
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

function monthlyNormal(
  month: number,
  overrides: Partial<MonthlyNormal> = {},
): MonthlyNormal {
  return {
    month,
    meanMaxTempC: 12,
    meanMinTempC: 4,
    meanTempC: 8,
    rainfallMm: 60,
    ...overrides,
  }
}

function makeMap(
  ...entries: [number, ClimateDay[]][]
): ReadonlyMap<number, readonly ClimateDay[]> {
  return new Map(entries)
}

// ── 1. Selection validation ───────────────────────────────────────────────────

describe('validateSelector – date-vs-date', () => {
  it('returns valid when both dates are supplied', () => {
    const sel: DateVsDateSelector = {
      mode: 'date-vs-date',
      leftDate: '2024-07-15' as ClimateDateString,
      rightDate: '2023-07-15' as ClimateDateString,
    }
    const result = validateSelector(sel)
    expect(result.valid).toBe(true)
    if (result.valid) {
      const s = result.selection
      if (s.mode !== 'same-period') {
        expect(s.left.startDate).toBe('2024-07-15')
        expect(s.right.startDate).toBe('2023-07-15')
      }
    }
  })

  it('fails when a date is missing', () => {
    const sel: DateVsDateSelector = {
      mode: 'date-vs-date',
      leftDate: '',
      rightDate: '2023-07-15' as ClimateDateString,
    }
    const result = validateSelector(sel)
    expect(result.valid).toBe(false)
  })
})

describe('validateSelector – month-vs-month', () => {
  it('resolves correct date ranges', () => {
    const sel: MonthVsMonthSelector = {
      mode: 'month-vs-month',
      leftYear: 2024,
      leftMonth: 2,
      rightYear: 2023,
      rightMonth: 2,
    }
    const result = validateSelector(sel)
    expect(result.valid).toBe(true)
    if (result.valid && result.selection.mode !== 'same-period') {
      // 2024 is a leap year – Feb has 29 days
      expect(result.selection.left.endDate).toBe('2024-02-29')
      // 2023 is not a leap year – Feb has 28 days
      expect(result.selection.right.endDate).toBe('2023-02-28')
    }
  })
})

describe('validateSelector – year-vs-year', () => {
  it('fails when a year is missing', () => {
    const sel: YearVsYearSelector = {
      mode: 'year-vs-year',
      leftYear: 2024,
      rightYear: null,
    }
    expect(validateSelector(sel).valid).toBe(false)
  })
})

// ── 2. Winter across calendar years ──────────────────────────────────────────

describe('getSeasonDateRange – winter', () => {
  it('winter 2024 spans Dec 2023 – Feb 2024', () => {
    const { startDate, endDate } = getSeasonDateRange('winter', 2024)
    expect(startDate).toBe('2023-12-01')
    expect(endDate).toBe('2024-02-29') // 2024 is a leap year
  })

  it('winter 2025 spans Dec 2024 – Feb 2025', () => {
    const { startDate, endDate } = getSeasonDateRange('winter', 2025)
    expect(startDate).toBe('2024-12-01')
    expect(endDate).toBe('2025-02-28') // 2025 is not a leap year
  })

  it('winter season-vs-season validation produces Dec–Feb date ranges', () => {
    const sel: SeasonVsSeasonSelector = {
      mode: 'season-vs-season',
      leftSeason: 'winter',
      leftSeasonYear: 2024,
      rightSeason: 'winter',
      rightSeasonYear: 2023,
    }
    const result = validateSelector(sel)
    expect(result.valid).toBe(true)
    if (result.valid && result.selection.mode !== 'same-period') {
      expect(result.selection.left.startDate).toBe('2023-12-01')
      expect(result.selection.left.endDate).toBe('2024-02-29')
      expect(result.selection.right.startDate).toBe('2022-12-01')
      expect(result.selection.right.endDate).toBe('2023-02-28')
    }
  })
})

describe('yearsInRange', () => {
  it('returns both boundary years for winter (crosses calendar years)', () => {
    const { startDate, endDate } = getSeasonDateRange('winter', 2024)
    expect(yearsInRange(startDate, endDate)).toEqual([2023, 2024])
  })
})

// ── 3. Leap-day periods ───────────────────────────────────────────────────────

describe('resolveSamePeriodForYear – leap day handling', () => {
  it('clamps Feb 29 to Feb 28 in non-leap years', () => {
    const entry = resolveSamePeriodForYear('02-01', '02-29', 2023)
    // 2023 is not a leap year – clamp to 28
    expect(entry.endDate).toBe('2023-02-28')
  })

  it('keeps Feb 29 intact for leap years', () => {
    const entry = resolveSamePeriodForYear('02-01', '02-29', 2024)
    expect(entry.endDate).toBe('2024-02-29')
  })
})

describe('period duration with leap day', () => {
  it('counts 29 days for Feb in a leap year', () => {
    expect(periodDurationDays('2024-02-01', '2024-02-29')).toBe(29)
  })

  it('counts 28 days for Feb in a non-leap year', () => {
    expect(periodDurationDays('2023-02-01', '2023-02-28')).toBe(28)
  })
})

// ── 4. Equal-duration enforcement ────────────────────────────────────────────

describe('validateSelector – custom equal duration', () => {
  it('rejects periods of different durations', () => {
    const sel: CustomPeriodSelector = {
      mode: 'custom',
      leftStart: '2024-01-01' as ClimateDateString,
      leftEnd: '2024-01-31' as ClimateDateString,   // 31 days
      rightStart: '2024-03-01' as ClimateDateString,
      rightEnd: '2024-03-30' as ClimateDateString,  // 30 days
    }
    const result = validateSelector(sel)
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.message).toMatch(/equal duration/i)
    }
  })

  it('accepts periods of the same duration', () => {
    const sel: CustomPeriodSelector = {
      mode: 'custom',
      leftStart: '2024-06-01' as ClimateDateString,
      leftEnd: '2024-08-31' as ClimateDateString,   // 92 days
      rightStart: '2023-06-01' as ClimateDateString,
      rightEnd: '2023-08-31' as ClimateDateString,  // 92 days
    }
    const result = validateSelector(sel)
    expect(result.valid).toBe(true)
  })

  it('rejects reversed periods', () => {
    const sel: CustomPeriodSelector = {
      mode: 'custom',
      leftStart: '2024-08-31' as ClimateDateString,
      leftEnd: '2024-06-01' as ClimateDateString,
      rightStart: '2023-06-01' as ClimateDateString,
      rightEnd: '2023-08-31' as ClimateDateString,
    }
    const result = validateSelector(sel)
    expect(result.valid).toBe(false)
  })
})

// ── 5. Incomplete rainfall ────────────────────────────────────────────────────

describe('buildComparisonPeriodResult – incomplete rainfall', () => {
  it('does not compute rainfall percentage when no rainfall days are available', () => {
    // Period starts before rainfall start date (2020-05-01)
    const records = [
      day('2019-06-01', { rainfallMm: null }),
      day('2019-06-02', { rainfallMm: null }),
    ]
    const normals = [monthlyNormal(6, { rainfallMm: 50 })]
    const period = {
      label: 'Jun 2019',
      startDate: '2019-06-01' as ClimateDateString,
      endDate: '2019-06-02' as ClimateDateString,
      season: null,
    }
    const result = buildComparisonPeriodResult(
      period,
      makeMap([2019, records]),
      normals,
    )
    // Rainfall unavailable before 2020-05-01 – percentage should be null
    expect(result.rainfallPercentageOfNormal).toBeNull()
  })
})

// ── 6. Zero-reference percentages ─────────────────────────────────────────────

describe('buildComparisonResult – zero-reference rainfall', () => {
  it('returns null percentage difference when right rainfall is zero', () => {
    const base = {
      highestMax: { value: 20, dates: ['2024-07-01' as ClimateDateString] },
      lowestMin: { value: 5, dates: ['2024-07-01' as ClimateDateString] },
      wettestDay: { value: 0, dates: [] as ClimateDateString[] },
      thresholds: { atOrAbove20C: 0, atOrAbove25C: 0, atOrAbove30C: 0, frostDays: 0, rainDays: 0, heavyRainDays: 0 },
      coverage: {
        startDate: '2024-07-01' as ClimateDateString,
        endDate: '2024-07-31' as ClimateDateString,
        expectedDays: 31,
        provisional: false,
        maxTemperature: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
        minTemperature: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
        meanTemperature: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
        rainfall: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
      },
    }
    const left = {
      ...base,
      selection: { label: 'A', startDate: '2024-07-01' as ClimateDateString, endDate: '2024-07-31' as ClimateDateString, season: null },
      meanMaxTempC: 22,
      meanMinTempC: 12,
      meanTempC: 17,
      rainfallTotalMm: 30,
      rainfallPercentageOfNormal: 60,
      rainfallDifferenceFromNormalMm: -20,
      rainDays: 8,
      temperatureAnomalyC: 2,
    }
    const right = {
      ...base,
      selection: { label: 'B', startDate: '2024-07-01' as ClimateDateString, endDate: '2024-07-31' as ClimateDateString, season: null },
      meanMaxTempC: 20,
      meanMinTempC: 10,
      meanTempC: 15,
      // Reference rainfall is zero – percentage comparison must be avoided
      rainfallTotalMm: 0,
      rainfallPercentageOfNormal: 0,
      rainfallDifferenceFromNormalMm: -60,
      rainDays: 0,
      temperatureAnomalyC: 0,
    }
    const cmp = buildComparisonResult(left, right)
    expect(cmp.rainfallPercentageDifference).toBeNull()
  })
})

// ── 7. URL restoration ────────────────────────────────────────────────────────

describe('URL parameter round-trip', () => {
  it('restores a date-vs-date selector from URL params', () => {
    const sel: DateVsDateSelector = {
      mode: 'date-vs-date',
      leftDate: '2024-07-15' as ClimateDateString,
      rightDate: '2023-07-15' as ClimateDateString,
    }
    const params = new URLSearchParams(selectorToUrlParams(sel))
    const restored = urlParamsToSelector(params)
    expect(restored).toEqual(sel)
  })

  it('restores a season-vs-season selector from URL params', () => {
    const sel: SeasonVsSeasonSelector = {
      mode: 'season-vs-season',
      leftSeason: 'summer',
      leftSeasonYear: 2024,
      rightSeason: 'summer',
      rightSeasonYear: 2023,
    }
    const params = new URLSearchParams(selectorToUrlParams(sel))
    const restored = urlParamsToSelector(params)
    expect(restored).toEqual(sel)
  })

  it('restores a same-period selector with multiple years', () => {
    const sel: SamePeriodSelector = {
      mode: 'same-period',
      startMD: '06-01',
      endMD: '08-31',
      years: [2020, 2021, 2022, 2023, 2024],
    }
    const params = new URLSearchParams(selectorToUrlParams(sel))
    const restored = urlParamsToSelector(params)
    expect(restored).toEqual(sel)
  })

  it('restores a custom period selector from URL params', () => {
    const sel: CustomPeriodSelector = {
      mode: 'custom',
      leftStart: '2024-06-01' as ClimateDateString,
      leftEnd: '2024-08-31' as ClimateDateString,
      rightStart: '2023-06-01' as ClimateDateString,
      rightEnd: '2023-08-31' as ClimateDateString,
    }
    const params = new URLSearchParams(selectorToUrlParams(sel))
    const restored = urlParamsToSelector(params)
    expect(restored).toEqual(sel)
  })

  it('returns null for unknown mode', () => {
    const params = new URLSearchParams({ cm: 'unknown-mode' })
    expect(urlParamsToSelector(params)).toBeNull()
  })
})

// ── 8. Multi-year same-period comparison ─────────────────────────────────────

describe('buildSamePeriodResults', () => {
  it('builds per-year statistics for same period across multiple years', () => {
    const normals = [monthlyNormal(7, { rainfallMm: 50, meanTempC: 18 })]

    const recordsByYear = makeMap(
      [2022, [
        day('2022-07-01', { maxTempC: 25, minTempC: 15, meanTempC: 20, rainfallMm: 5 }),
        day('2022-07-02', { maxTempC: 26, minTempC: 16, meanTempC: 21, rainfallMm: 0 }),
      ]],
      [2023, [
        day('2023-07-01', { maxTempC: 22, minTempC: 12, meanTempC: 17, rainfallMm: 10 }),
        day('2023-07-02', { maxTempC: 23, minTempC: 13, meanTempC: 18, rainfallMm: 2 }),
      ]],
    )

    const entries = [
      { year: 2022, label: '1–2 Jul 2022', startDate: '2022-07-01' as ClimateDateString, endDate: '2022-07-02' as ClimateDateString },
      { year: 2023, label: '1–2 Jul 2023', startDate: '2023-07-01' as ClimateDateString, endDate: '2023-07-02' as ClimateDateString },
    ]

    const results = buildSamePeriodResults(entries, recordsByYear, normals)

    expect(results).toHaveLength(2)
    expect(results[0]?.year).toBe(2022)
    expect(results[0]?.result.meanTempC).toBeCloseTo(20.5, 1)
    expect(results[1]?.year).toBe(2023)
    expect(results[1]?.result.meanTempC).toBeCloseTo(17.5, 1)
  })

  it('preserves null for missing values and does not interpolate', () => {
    const normals = [monthlyNormal(8)]
    const recordsByYear = makeMap(
      [2022, [
        day('2022-08-01', { maxTempC: null, minTempC: null, meanTempC: null }),
      ]],
    )
    const entries = [
      {
        year: 2022,
        label: '1 Aug 2022',
        startDate: '2022-08-01' as ClimateDateString,
        endDate: '2022-08-01' as ClimateDateString,
      },
    ]
    const [result] = buildSamePeriodResults(entries, recordsByYear, normals)
    expect(result?.result.meanTempC).toBeNull()
    expect(result?.result.meanMaxTempC).toBeNull()
  })
})

// ── 9. Outcome labels ─────────────────────────────────────────────────────────

describe('deriveOutcomeLabel', () => {
  it('labels warmer when left mean is higher', () => {
    const baseCoverage = {
      startDate: '2024-07-01' as ClimateDateString,
      endDate: '2024-07-31' as ClimateDateString,
      expectedDays: 31,
      provisional: false,
      maxTemperature: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
      minTemperature: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
      meanTemperature: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
      rainfall: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
    }
    const base = {
      selection: { label: 'A', startDate: '2024-07-01' as ClimateDateString, endDate: '2024-07-31' as ClimateDateString, season: null },
      meanMaxTempC: 22, meanMinTempC: 12,
      highestMax: { value: 28, dates: [] as ClimateDateString[] },
      lowestMin: { value: 8, dates: [] as ClimateDateString[] },
      wettestDay: { value: 10, dates: [] as ClimateDateString[] },
      rainfallTotalMm: 30, rainfallPercentageOfNormal: 60,
      rainfallDifferenceFromNormalMm: -20, rainDays: 5,
      temperatureAnomalyC: 2,
      thresholds: { atOrAbove20C: 0, atOrAbove25C: 0, atOrAbove30C: 0, frostDays: 0, rainDays: 0, heavyRainDays: 0 },
      coverage: baseCoverage,
    }
    const left = { ...base, meanTempC: 18 }
    const right = { ...base, meanTempC: 15 }
    const outcome = deriveOutcomeLabel(left, right)
    expect(outcome.temperature).toBe('warmer')
  })

  it('returns null temperature when either mean is null', () => {
    const baseCoverage = {
      startDate: '2024-07-01' as ClimateDateString,
      endDate: '2024-07-31' as ClimateDateString,
      expectedDays: 31,
      provisional: false,
      maxTemperature: { valid: 0, missing: 31, unavailable: 0, availableDays: 31, complete: false },
      minTemperature: { valid: 0, missing: 31, unavailable: 0, availableDays: 31, complete: false },
      meanTemperature: { valid: 0, missing: 31, unavailable: 0, availableDays: 31, complete: false },
      rainfall: { valid: 0, missing: 0, unavailable: 31, availableDays: 0, complete: false },
    }
    const base = {
      selection: { label: 'A', startDate: '2024-07-01' as ClimateDateString, endDate: '2024-07-31' as ClimateDateString, season: null },
      meanMaxTempC: null, meanMinTempC: null, meanTempC: null,
      highestMax: { value: null, dates: [] as ClimateDateString[] },
      lowestMin: { value: null, dates: [] as ClimateDateString[] },
      wettestDay: { value: null, dates: [] as ClimateDateString[] },
      rainfallTotalMm: null, rainfallPercentageOfNormal: null,
      rainfallDifferenceFromNormalMm: null, rainDays: 0,
      temperatureAnomalyC: null,
      thresholds: { atOrAbove20C: 0, atOrAbove25C: 0, atOrAbove30C: 0, frostDays: 0, rainDays: 0, heavyRainDays: 0 },
      coverage: baseCoverage,
    }
    const outcome = deriveOutcomeLabel(base, base)
    expect(outcome.temperature).toBeNull()
    expect(outcome.rainfall).toBeNull()
  })
})

// ── 10. extractRecordsForPeriod ───────────────────────────────────────────────

describe('extractRecordsForPeriod', () => {
  it('returns only records within the inclusive date range', () => {
    const records = makeMap([2024, [
      day('2024-06-30'),
      day('2024-07-01'),
      day('2024-07-15'),
      day('2024-07-31'),
      day('2024-08-01'),
    ]])
    const extracted = extractRecordsForPeriod(
      records,
      '2024-07-01' as ClimateDateString,
      '2024-07-31' as ClimateDateString,
    )
    expect(extracted.map((r) => r.date)).toEqual([
      '2024-07-01',
      '2024-07-15',
      '2024-07-31',
    ])
  })

  it('handles winter periods that span two calendar years', () => {
    const records = makeMap(
      [2023, [day('2023-12-15'), day('2023-12-31')]],
      [2024, [day('2024-01-01'), day('2024-02-28')]],
    )
    const extracted = extractRecordsForPeriod(
      records,
      '2023-12-01' as ClimateDateString,
      '2024-02-29' as ClimateDateString,
    )
    expect(extracted).toHaveLength(4)
  })
})

// ── 11. Tied extremes are preserved ──────────────────────────────────────────

describe('buildComparisonPeriodResult – ties', () => {
  it('preserves all tied highest max dates', () => {
    const records = [
      day('2024-07-01', { maxTempC: 30 }),
      day('2024-07-05', { maxTempC: 30 }),
      day('2024-07-10', { maxTempC: 28 }),
    ]
    const normals = [monthlyNormal(7)]
    const period = {
      label: 'Jul 2024',
      startDate: '2024-07-01' as ClimateDateString,
      endDate: '2024-07-10' as ClimateDateString,
      season: null,
    }
    const result = buildComparisonPeriodResult(
      period,
      makeMap([2024, records]),
      normals,
    )
    expect(result.highestMax.value).toBe(30)
    expect(result.highestMax.dates).toEqual(['2024-07-01', '2024-07-05'])
  })
})
