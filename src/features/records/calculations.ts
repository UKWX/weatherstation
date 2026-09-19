/**
 * Pure calculation functions for the Records Centre.
 *
 * All functions accept a RecordsIndex and filter parameters; none fetches
 * data or has side effects.
 */
import {
  calculateColdStreak,
  calculateDryStreak,
  calculateThresholdCounts,
  calculateWarmStreak,
  calculateWetStreak,
  getMeteorologicalSeason,
  parseIsoClimateDate,
} from '@/lib/climate'
import { RAINFALL_START_DATE, WEATHER_UNITS } from '@/config/weather'
import { isRainfallAvailableForYear } from '@/features/climateArchive/calculations'
import type { ClimateDateString, ClimateDay, MonthlySummary, AnnualSummary } from '@/types/weather'
import type {
  AnnualRankEntry,
  CalendarDateRecord,
  DailyFilters,
  DailyMetric,
  DailyRankEntry,
  MonthlyFilters,
  MonthlyMetric,
  MonthlyRankEntry,
  AnnualMetric,
  OverallRecord,
  ProgressionMetric,
  RecordProgressionEntry,
  RecordProgressionSummary,
  RecordsIndex,
  SeasonFilter,
  SpellRecord,
  SpellSummary,
  ThresholdSummary,
  ThresholdYearRow,
  YearRecordCount,
} from './types'

// ── Internal helpers ──────────────────────────────────────────────────────────

function isFiniteNum(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v)
}

function yearOf(date: ClimateDateString): number {
  return parseIsoClimateDate(date).year
}

function monthOf(date: ClimateDateString): number {
  return parseIsoClimateDate(date).month
}

function isProvisional(date: ClimateDateString): boolean {
  // A day is provisional if it is in the current calendar year based on today
  const { year } = parseIsoClimateDate(date)
  return year >= new Date().getFullYear()
}

function matchesSeason(date: ClimateDateString, season: SeasonFilter): boolean {
  if (season === 'all') return true
  return getMeteorologicalSeason(date) === season
}

function matchesMonthFilter(date: ClimateDateString, month: number | null): boolean {
  if (month == null) return true
  return monthOf(date) === month
}

function matchesYearRange(
  date: ClimateDateString,
  yearFrom: number | null,
  yearTo: number | null,
): boolean {
  const year = yearOf(date)
  if (yearFrom != null && year < yearFrom) return false
  if (yearTo != null && year > yearTo) return false
  return true
}

function diurnalRange(day: ClimateDay): number | null {
  if (!isFiniteNum(day.maxTempC) || !isFiniteNum(day.minTempC)) return null
  return day.maxTempC - day.minTempC
}

/**
 * Assign dense ranks to a pre-sorted array.
 * All items with the same value get the same rank.
 */
// ── 1. Overall station records ────────────────────────────────────────────────

export function getOverallRecords(index: RecordsIndex): OverallRecord[] {
  const { allDays, daysByMaxTempDesc, daysByMaxTempAsc, daysByMinTempDesc, daysByMinTempAsc, daysByRainfallDesc, monthlySummaries, annualSummaries } = index

  // Highest daily max
  const highestMaxDay = daysByMaxTempDesc[0]
  const highestMaxVal = highestMaxDay?.maxTempC ?? null
  const highestMaxHolders = isFiniteNum(highestMaxVal)
    ? daysByMaxTempDesc
        .filter((d) => d.maxTempC === highestMaxVal)
        .map((d) => ({ date: d.date, label: d.date }))
    : []

  // Lowest daily min
  const lowestMinDay = daysByMinTempAsc[0]
  const lowestMinVal = lowestMinDay?.minTempC ?? null
  const lowestMinHolders = isFiniteNum(lowestMinVal)
    ? daysByMinTempAsc
        .filter((d) => d.minTempC === lowestMinVal)
        .map((d) => ({ date: d.date, label: d.date }))
    : []

  // Highest daily min
  const highestMinDay = daysByMinTempDesc[0]
  const highestMinVal = highestMinDay?.minTempC ?? null
  const highestMinHolders = isFiniteNum(highestMinVal)
    ? daysByMinTempDesc
        .filter((d) => d.minTempC === highestMinVal)
        .map((d) => ({ date: d.date, label: d.date }))
    : []

  // Lowest daily max
  const lowestMaxDay = daysByMaxTempAsc[0]
  const lowestMaxVal = lowestMaxDay?.maxTempC ?? null
  const lowestMaxHolders = isFiniteNum(lowestMaxVal)
    ? daysByMaxTempAsc
        .filter((d) => d.maxTempC === lowestMaxVal)
        .map((d) => ({ date: d.date, label: d.date }))
    : []

  // Wettest day (rainfall non-null only)
  const wettestDay = daysByRainfallDesc[0]
  const wettestDayVal = wettestDay?.rainfallMm ?? null
  const wettestDayHolders = isFiniteNum(wettestDayVal)
    ? daysByRainfallDesc
        .filter((d) => d.rainfallMm === wettestDayVal)
        .map((d) => ({ date: d.date, label: d.date }))
    : []

  const diurnalDays = allDays
    .map((day) => ({ day, value: diurnalRange(day) }))
    .filter((entry): entry is { day: ClimateDay; value: number } => isFiniteNum(entry.value))
  const diurnalDaysDesc = diurnalDays.toSorted((a, b) => b.value - a.value)
  const diurnalDaysAsc = diurnalDays.toSorted((a, b) => a.value - b.value)

  const highestDiurnalRange = diurnalDaysDesc[0]?.value ?? null
  const highestDiurnalRangeHolders = isFiniteNum(highestDiurnalRange)
    ? diurnalDaysDesc
        .filter((entry) => entry.value === highestDiurnalRange)
        .map((entry) => ({ date: entry.day.date, label: entry.day.date }))
    : []

  const lowestDiurnalRange = diurnalDaysAsc[0]?.value ?? null
  const lowestDiurnalRangeHolders = isFiniteNum(lowestDiurnalRange)
    ? diurnalDaysAsc
        .filter((entry) => entry.value === lowestDiurnalRange)
        .map((entry) => ({ date: entry.day.date, label: entry.day.date }))
    : []

  // Monthly records: warmest/coldest complete months, wettest/driest complete rainfall months
  const completeMonthlySummaries: MonthlySummary[] = []
  for (const summary of monthlySummaries.values()) {
    if (summary.coverage.maxTemperature.complete) {
      completeMonthlySummaries.push(summary)
    }
  }

  const completeRainfallMonthlySummaries = completeMonthlySummaries.filter(
    (s) => s.coverage.rainfall.complete && isFiniteNum(s.rainfallTotalMm),
  )

  let warmestMonth: MonthlySummary | null = null
  let coldestMonth: MonthlySummary | null = null
  for (const s of completeMonthlySummaries) {
    if (!isFiniteNum(s.meanTempC)) continue
    if (warmestMonth == null || s.meanTempC > warmestMonth.meanTempC!) warmestMonth = s
    if (coldestMonth == null || s.meanTempC < coldestMonth.meanTempC!) coldestMonth = s
  }

  let wettestMonth: MonthlySummary | null = null
  let driestMonth: MonthlySummary | null = null
  for (const s of completeRainfallMonthlySummaries) {
    if (!isFiniteNum(s.rainfallTotalMm)) continue
    if (wettestMonth == null || s.rainfallTotalMm! > wettestMonth.rainfallTotalMm!) wettestMonth = s
    if (driestMonth == null || s.rainfallTotalMm! < driestMonth.rainfallTotalMm!) driestMonth = s
  }

  function monthLabel(s: MonthlySummary): string {
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${MONTHS[(s.month - 1)] ?? ''} ${s.year}`
  }

  // Annual records: warmest/coldest complete years, wettest/driest complete rainfall years
  const completeAnnualSummaries: AnnualSummary[] = []
  for (const summary of annualSummaries.values()) {
    if (summary.coverage.maxTemperature.complete) {
      completeAnnualSummaries.push(summary)
    }
  }

  const completeRainfallAnnualSummaries = completeAnnualSummaries.filter(
    (s) =>
      isRainfallAvailableForYear(s.year) &&
      s.coverage.rainfall.complete &&
      isFiniteNum(s.rainfallTotalMm),
  )

  let warmestYear: AnnualSummary | null = null
  let coldestYear: AnnualSummary | null = null
  for (const s of completeAnnualSummaries) {
    if (!isFiniteNum(s.meanTempC)) continue
    if (warmestYear == null || s.meanTempC > warmestYear.meanTempC!) warmestYear = s
    if (coldestYear == null || s.meanTempC < coldestYear.meanTempC!) coldestYear = s
  }

  let wettestYear: AnnualSummary | null = null
  let driestYear: AnnualSummary | null = null
  for (const s of completeRainfallAnnualSummaries) {
    if (!isFiniteNum(s.rainfallTotalMm)) continue
    if (wettestYear == null || s.rainfallTotalMm! > wettestYear.rainfallTotalMm!) wettestYear = s
    if (driestYear == null || s.rainfallTotalMm! < driestYear.rainfallTotalMm!) driestYear = s
  }

  const tempUnit = WEATHER_UNITS.temperature
  const rainUnit = WEATHER_UNITS.rainfall

  return [
    {
      label: 'Highest daily maximum',
      value: highestMaxVal,
      unit: tempUnit,
      holders: highestMaxHolders,
    },
    {
      label: 'Lowest daily minimum',
      value: lowestMinVal,
      unit: tempUnit,
      holders: lowestMinHolders,
    },
    {
      label: 'Highest daily minimum',
      value: highestMinVal,
      unit: tempUnit,
      holders: highestMinHolders,
    },
    {
      label: 'Lowest daily maximum',
      value: lowestMaxVal,
      unit: tempUnit,
      holders: lowestMaxHolders,
    },
    {
      label: 'Wettest day (available period)',
      value: wettestDayVal,
      unit: rainUnit,
      holders: wettestDayHolders,
      note: 'Rainfall records begin May 2020',
    },
    {
      label: 'Highest daily diurnal range',
      value: highestDiurnalRange,
      unit: tempUnit,
      holders: highestDiurnalRangeHolders,
    },
    {
      label: 'Lowest daily diurnal range',
      value: lowestDiurnalRange,
      unit: tempUnit,
      holders: lowestDiurnalRangeHolders,
    },
    {
      label: 'Warmest complete month',
      value: warmestMonth?.meanTempC ?? null,
      unit: tempUnit,
      holders:
        warmestMonth != null
          ? [{ date: `${warmestMonth.year}-${String(warmestMonth.month).padStart(2, '0')}-01` as ClimateDateString, label: monthLabel(warmestMonth) }]
          : [],
    },
    {
      label: 'Coldest complete month',
      value: coldestMonth?.meanTempC ?? null,
      unit: tempUnit,
      holders:
        coldestMonth != null
          ? [{ date: `${coldestMonth.year}-${String(coldestMonth.month).padStart(2, '0')}-01` as ClimateDateString, label: monthLabel(coldestMonth) }]
          : [],
    },
    {
      label: 'Wettest complete rainfall month',
      value: wettestMonth?.rainfallTotalMm ?? null,
      unit: rainUnit,
      holders:
        wettestMonth != null
          ? [{ date: `${wettestMonth.year}-${String(wettestMonth.month).padStart(2, '0')}-01` as ClimateDateString, label: monthLabel(wettestMonth) }]
          : [],
    },
    {
      label: 'Driest complete rainfall month',
      value: driestMonth?.rainfallTotalMm ?? null,
      unit: rainUnit,
      holders:
        driestMonth != null
          ? [{ date: `${driestMonth.year}-${String(driestMonth.month).padStart(2, '0')}-01` as ClimateDateString, label: monthLabel(driestMonth) }]
          : [],
    },
    {
      label: 'Warmest complete year',
      value: warmestYear?.meanTempC ?? null,
      unit: tempUnit,
      holders:
        warmestYear != null
          ? [{ date: `${warmestYear.year}-01-01` as ClimateDateString, label: String(warmestYear.year) }]
          : [],
    },
    {
      label: 'Coldest complete year',
      value: coldestYear?.meanTempC ?? null,
      unit: tempUnit,
      holders:
        coldestYear != null
          ? [{ date: `${coldestYear.year}-01-01` as ClimateDateString, label: String(coldestYear.year) }]
          : [],
    },
    {
      label: 'Wettest complete rainfall year',
      value: wettestYear?.rainfallTotalMm ?? null,
      unit: rainUnit,
      holders:
        wettestYear != null
          ? [{ date: `${wettestYear.year}-01-01` as ClimateDateString, label: String(wettestYear.year) }]
          : [],
    },
    {
      label: 'Driest complete rainfall year',
      value: driestYear?.rainfallTotalMm ?? null,
      unit: rainUnit,
      holders:
        driestYear != null
          ? [{ date: `${driestYear.year}-01-01` as ClimateDateString, label: String(driestYear.year) }]
          : [],
    },
  ]
}

// ── 2. Daily rankings ─────────────────────────────────────────────────────────

function dailySortedArray(index: RecordsIndex, metric: DailyMetric): ClimateDay[] {
  switch (metric) {
    case 'highest-max': return index.daysByMaxTempDesc
    case 'lowest-max':  return index.daysByMaxTempAsc
    case 'highest-min': return index.daysByMinTempDesc
    case 'lowest-min':  return index.daysByMinTempAsc
    case 'highest-range':
    case 'lowest-range':
      return index.allDays
        .map((day) => ({ day, value: diurnalRange(day) }))
        .filter((entry): entry is { day: ClimateDay; value: number } => isFiniteNum(entry.value))
        .toSorted((a, b) => metric === 'highest-range' ? b.value - a.value : a.value - b.value)
        .map((entry) => entry.day)
    case 'wettest':     return index.daysByRainfallDesc
  }
}

function dailyValue(day: ClimateDay, metric: DailyMetric): number | null {
  switch (metric) {
    case 'highest-max':
    case 'lowest-max':  return day.maxTempC
    case 'highest-min':
    case 'lowest-min':  return day.minTempC
    case 'highest-range':
    case 'lowest-range':
      return diurnalRange(day)
    case 'wettest':     return day.rainfallMm
  }
}

/**
 * Returns top-N daily ranking entries with all ties at the Nth position retained.
 * Never ranks null values.
 */
export function getDailyRankings(
  index: RecordsIndex,
  metric: DailyMetric,
  filters: DailyFilters,
  topN: number,
): DailyRankEntry[] {
  const sorted = dailySortedArray(index, metric)

  // Apply filters
  const filtered = sorted.filter((d) => {
    if (!isFiniteNum(dailyValue(d, metric))) return false
    if (!matchesMonthFilter(d.date, filters.month)) return false
    if (!matchesSeason(d.date, filters.season)) return false
    if (!matchesYearRange(d.date, filters.yearFrom, filters.yearTo)) return false
    return true
  })

  if (filtered.length === 0) return []

  // Apply dense ranking and retain all ties at the Nth cutoff
  let rank = 1
  let prevValue: number | null = null
  const entries: DailyRankEntry[] = []
  let index_ = 0

  for (const day of filtered) {
    const value = dailyValue(day, metric) as number
    if (prevValue == null || value !== prevValue) {
      rank = index_ + 1
    }
    if (rank > topN) break
    entries.push({
      rank,
      date: day.date,
      value,
      provisional: isProvisional(day.date),
    })
    prevValue = value
    index_++
  }

  return entries
}

// ── 3. Calendar-date records ──────────────────────────────────────────────────

export function getCalendarDateRecords(
  index: RecordsIndex,
  month: number,
  day: number,
): CalendarDateRecord {
  const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const days = index.daysByCalendarDate.get(key) ?? []

  const sampleSize = days.length

  function bestValue(
    selector: (d: ClimateDay) => number | null | undefined,
    mode: 'max' | 'min',
  ): { value: number | null; years: number[] } {
    let best: number | null = null
    let bestYears: number[] = []
    for (const d of days) {
      const v = selector(d)
      if (!isFiniteNum(v)) continue
      if (best == null) {
        best = v
        bestYears = [yearOf(d.date)]
        continue
      }
      if (v === best) {
        bestYears.push(yearOf(d.date))
      } else if ((mode === 'max' && v > best) || (mode === 'min' && v < best)) {
        best = v
        bestYears = [yearOf(d.date)]
      }
    }
    return { value: best, years: bestYears }
  }

  // Wettest year: only consider days where rainfall is available
  const rainfallDays = days.filter((d) => d.date >= RAINFALL_START_DATE)
  const wettestYear = (function () {
    let best: number | null = null
    let bestYears: number[] = []
    for (const d of rainfallDays) {
      const v = d.rainfallMm
      if (!isFiniteNum(v)) continue
      if (best == null) {
        best = v
        bestYears = [yearOf(d.date)]
        continue
      }
      if (v === best) {
        bestYears.push(yearOf(d.date))
      } else if (v > best) {
        best = v
        bestYears = [yearOf(d.date)]
      }
    }
    return { value: best, years: bestYears }
  })()

  return {
    month,
    day,
    sampleSize,
    highestMax: bestValue((d) => d.maxTempC, 'max'),
    lowestMax: bestValue((d) => d.maxTempC, 'min'),
    highestMin: bestValue((d) => d.minTempC, 'max'),
    lowestMin: bestValue((d) => d.minTempC, 'min'),
    wettestYear,
  }
}

// ── 4. Monthly rankings ───────────────────────────────────────────────────────

function monthlyMetricValue(summary: MonthlySummary, metric: MonthlyMetric): number | null {
  switch (metric) {
    case 'mean-max':   return summary.meanMaxTempC
    case 'mean-min':   return summary.meanMinTempC
    case 'mean-temp':  return summary.meanTempC
    case 'mean-diurnal-range':
      return isFiniteNum(summary.meanMaxTempC) && isFiniteNum(summary.meanMinTempC)
        ? summary.meanMaxTempC - summary.meanMinTempC
        : null
    case 'rainfall':   return summary.rainfallTotalMm
  }
}

export function getMonthlyRankings(
  index: RecordsIndex,
  metric: MonthlyMetric,
  filters: MonthlyFilters,
): MonthlyRankEntry[] {
  const summaries: MonthlySummary[] = []
  for (const s of index.monthlySummaries.values()) {
    summaries.push(s)
  }

  // Filter
  const filtered = summaries.filter((s) => {
    const value = monthlyMetricValue(s, metric)
    if (!isFiniteNum(value)) return false
    if (filters.monthFilter != null && s.month !== filters.monthFilter) return false
    if (filters.yearFrom != null && s.year < filters.yearFrom) return false
    if (filters.yearTo != null && s.year > filters.yearTo) return false
    if (filters.requireComplete && !s.coverage.maxTemperature.complete) return false
    if (metric === 'rainfall') {
      // For rainfall: only include months with complete rainfall coverage
      if (!s.coverage.rainfall.complete) return false
    }
    return true
  })

  // Sort: highest first for all monthly metrics
  filtered.sort((a, b) => {
    const av = monthlyMetricValue(a, metric) as number
    const bv = monthlyMetricValue(b, metric) as number
    return bv - av
  })

  // Dense rank
  let rank = 1
  const result: MonthlyRankEntry[] = []
  for (let i = 0; i < filtered.length; i++) {
    const s = filtered[i]!
    const value = monthlyMetricValue(s, metric) as number
    if (i > 0) {
      const prev = filtered[i - 1]!
      if (monthlyMetricValue(prev, metric) !== value) {
        rank = i + 1
      }
    }
    result.push({
      rank,
      year: s.year,
      month: s.month,
      value,
      provisional: s.coverage.provisional,
      complete: s.coverage.maxTemperature.complete,
    })
  }

  return result
}

// ── 5. Annual rankings ────────────────────────────────────────────────────────

function annualMetricValue(summary: AnnualSummary, metric: AnnualMetric): number | null {
  switch (metric) {
    case 'mean-max':   return summary.meanMaxTempC
    case 'mean-min':   return summary.meanMinTempC
    case 'mean-temp':  return summary.meanTempC
    case 'mean-diurnal-range':
      return isFiniteNum(summary.meanMaxTempC) && isFiniteNum(summary.meanMinTempC)
        ? summary.meanMaxTempC - summary.meanMinTempC
        : null
    case 'rainfall':   return summary.rainfallTotalMm
  }
}

export function getAnnualRankings(
  index: RecordsIndex,
  metric: AnnualMetric,
): AnnualRankEntry[] {
  const summaries: AnnualSummary[] = []
  for (const s of index.annualSummaries.values()) {
    summaries.push(s)
  }

  // Filter
  const filtered = summaries.filter((s) => {
    const value = annualMetricValue(s, metric)
    if (!isFiniteNum(value)) return false
    if (metric === 'rainfall') {
      // Only complete rainfall years
      if (!isRainfallAvailableForYear(s.year)) return false
      if (!s.coverage.rainfall.complete) return false
    }
    return true
  })

  // Sort: highest first for all annual metrics
  filtered.sort((a, b) => {
    const av = annualMetricValue(a, metric) as number
    const bv = annualMetricValue(b, metric) as number
    return bv - av
  })

  // Dense rank
  let rank = 1
  const result: AnnualRankEntry[] = []
  for (let i = 0; i < filtered.length; i++) {
    const s = filtered[i]!
    const value = annualMetricValue(s, metric) as number
    if (i > 0) {
      const prev = filtered[i - 1]!
      if (annualMetricValue(prev, metric) !== value) {
        rank = i + 1
      }
    }
    const provisional = s.coverage.provisional
    const complete = metric === 'rainfall'
      ? s.coverage.rainfall.complete
      : metric === 'mean-diurnal-range'
        ? s.coverage.maxTemperature.complete && s.coverage.minTemperature.complete
        : s.coverage.maxTemperature.complete

    const validDays = metric === 'mean-diurnal-range'
      ? Math.min(s.coverage.maxTemperature.valid, s.coverage.minTemperature.valid)
      : s.coverage.maxTemperature.valid
    const expectedDays = s.coverage.expectedDays
    const pct = expectedDays > 0 ? Math.round((validDays / expectedDays) * 100) : 0
    const coverageNote = complete
      ? 'Complete'
      : provisional
        ? 'Provisional'
        : `${pct}%`

    result.push({ rank, year: s.year, value, provisional, complete, coverageNote })
  }

  return result
}

// ── 6. Thresholds ─────────────────────────────────────────────────────────────

export function getThresholdSummary(
  index: RecordsIndex,
  heavyRainThresholdMm: number,
): ThresholdSummary {
  let allTimeAtOrAbove20C = 0
  let allTimeAtOrAbove25C = 0
  let allTimeAtOrAbove30C = 0
  let allTimeFrostDays = 0
  let allTimeRainDays = 0
  let allTimeHeavyRainDays = 0

  const byYear: ThresholdYearRow[] = []

  for (const year of index.loadedYears) {
    const summary = index.annualSummaries.get(year)
    if (summary == null) continue

    // Get days for this year
    const days = index.allDays.filter((d) => yearOf(d.date) === year)
    const counts = calculateThresholdCounts(days, heavyRainThresholdMm)

    allTimeAtOrAbove20C += counts.atOrAbove20C
    allTimeAtOrAbove25C += counts.atOrAbove25C
    allTimeAtOrAbove30C += counts.atOrAbove30C
    allTimeFrostDays += counts.frostDays
    allTimeRainDays += counts.rainDays
    allTimeHeavyRainDays += counts.heavyRainDays

    byYear.push({
      year,
      provisional: summary.coverage.provisional,
      atOrAbove20C: counts.atOrAbove20C,
      atOrAbove25C: counts.atOrAbove25C,
      atOrAbove30C: counts.atOrAbove30C,
      frostDays: counts.frostDays,
      rainDays: counts.rainDays,
      heavyRainDays: counts.heavyRainDays,
    })
  }

  // Sort by year descending
  byYear.sort((a, b) => b.year - a.year)

  return {
    heavyRainThresholdMm,
    allTimeAtOrAbove20C,
    allTimeAtOrAbove25C,
    allTimeAtOrAbove30C,
    allTimeFrostDays,
    allTimeRainDays,
    allTimeHeavyRainDays,
    byYear,
  }
}

// ── 7. Spells ─────────────────────────────────────────────────────────────────

export function getSpellSummary(
  index: RecordsIndex,
  warmThresholdC = 20,
  coldThresholdC = 0,
): SpellSummary {
  const { allDays } = index

  function toSpellRecord(streak: ReturnType<typeof calculateDryStreak>): SpellRecord {
    return {
      length: streak.length,
      startDate: streak.startDate,
      endDate: streak.endDate,
    }
  }

  const longestDry = toSpellRecord(calculateDryStreak(allDays))
  const longestWet = toSpellRecord(calculateWetStreak(allDays))
  const longestWarm = toSpellRecord(calculateWarmStreak(allDays, warmThresholdC))
  const longestCold = toSpellRecord(calculateColdStreak(allDays, coldThresholdC))

  return {
    longestDry,
    longestWet,
    longestWarm,
    longestCold,
    warmThresholdC,
    coldThresholdC,
    missingDataRule: 'A missing daily value breaks the streak.',
  }
}

// ── 8. Record progression ─────────────────────────────────────────────────────

function progressionSelector(metric: ProgressionMetric) {
  return (day: ClimateDay): number | null => {
    switch (metric) {
      case 'highest-max': return day.maxTempC
      case 'lowest-min':  return day.minTempC
      case 'highest-min': return day.minTempC
      case 'lowest-max':  return day.maxTempC
      case 'highest-range':
      case 'lowest-range':
        return diurnalRange(day)
      case 'wettest':     return day.rainfallMm
    }
  }
}

function progressionIsNewRecord(
  value: number,
  current: number | null,
  metric: ProgressionMetric,
): boolean {
  if (current == null) return true
  switch (metric) {
    case 'highest-max':
    case 'highest-min':
    case 'highest-range':
    case 'wettest':
      return value > current
    case 'lowest-min':
    case 'lowest-max':
    case 'lowest-range':
      return value < current
  }
}

export function getRecordProgression(
  index: RecordsIndex,
  metric: ProgressionMetric,
): RecordProgressionSummary {
  const selector = progressionSelector(metric)
  const entries: RecordProgressionEntry[] = []
  let currentRecord: number | null = null

  // allDays is already date-sorted ascending
  for (const day of index.allDays) {
    const value = selector(day)
    if (!isFiniteNum(value)) continue

    // For wettest, only include rainfall-available dates
    if (metric === 'wettest' && day.date < RAINFALL_START_DATE) continue

    if (progressionIsNewRecord(value, currentRecord, metric)) {
      entries.push({
        date: day.date,
        value,
        isNewRecord: true,
        isTie: false,
        previousValue: currentRecord,
      })
      currentRecord = value
    } else if (value === currentRecord) {
      entries.push({
        date: day.date,
        value,
        isNewRecord: false,
        isTie: true,
        previousValue: currentRecord,
      })
    }
  }

  const currentValue = currentRecord
  const currentRecordDates = entries
    .filter((e) => e.value === currentValue)
  const currentRecordYears = [
    ...new Set(currentRecordDates.map((e) => yearOf(e.date))),
  ].sort((a, b) => a - b)

  return {
    metric,
    entries,
    eventCount: entries.length,
    currentRecordYears,
    currentValue,
  }
}

/**
 * Count how many distinct record metrics each year currently holds.
 * Considers: highest-max, lowest-min, highest-min, lowest-max, wettest.
 */
export function getYearRecordCounts(
  index: RecordsIndex,
  progressions: RecordProgressionSummary[],
): YearRecordCount[] {
  const countByYear = new Map<number, number>()

  for (const progression of progressions) {
    const currentValue = progression.currentValue
    if (currentValue == null) continue

    for (const year of progression.currentRecordYears) {
      countByYear.set(year, (countByYear.get(year) ?? 0) + 1)
    }
  }

  const result: YearRecordCount[] = []
  for (const [year, count] of countByYear.entries()) {
    const summary = index.annualSummaries.get(year)
    result.push({
      year,
      count,
      provisional: summary?.coverage.provisional ?? false,
    })
  }

  return result.sort((a, b) => b.count - a.count || a.year - b.year)
}
