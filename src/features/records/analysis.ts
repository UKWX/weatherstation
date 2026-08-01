/**
 * Reusable indexed analysis layer for the Records Centre.
 *
 * `buildRecordsIndex` is a pure function. Call it once per data change (via
 * useMemo). All filter operations then work on the pre-sorted arrays without
 * recomputing sorts or summaries.
 */
import {
  buildAnnualSummary,
  buildMonthlySummary,
} from '@/features/climateArchive/calculations'
import { parseIsoClimateDate } from '@/lib/climate'
import type {
  AnnualClimatePayload,
  ClimateDay,
  MonthlyNormal,
} from '@/types/weather'
import type { RecordsIndex } from './types'

// ── Internal helpers ──────────────────────────────────────────────────────────

function isFiniteNum(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v)
}

function compareAsc(a: ClimateDay, b: ClimateDay): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : 0
}

function sortByMetric(
  days: ClimateDay[],
  selector: (d: ClimateDay) => number | null | undefined,
  direction: 'asc' | 'desc',
): ClimateDay[] {
  return [...days]
    .filter((d) => isFiniteNum(selector(d)))
    .sort((a, b) => {
      const av = selector(a) as number
      const bv = selector(b) as number
      return direction === 'asc' ? av - bv : bv - av
    })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build the RecordsIndex from all loaded annual payloads.
 *
 * Designed to be wrapped in useMemo; it is a pure function whose output
 * depends only on its inputs.
 */
export function buildRecordsIndex(
  payloads: readonly AnnualClimatePayload[],
  monthlyNormals: readonly MonthlyNormal[],
): RecordsIndex {
  // Merge all daily records
  const allDays: ClimateDay[] = []
  for (const payload of payloads) {
    for (const record of payload.records) {
      allDays.push(record)
    }
  }
  allDays.sort(compareAsc)

  const loadedYears = payloads.map((p) => p.year).sort((a, b) => a - b)

  // Pre-sort daily arrays for each metric
  const daysByMaxTempDesc = sortByMetric(allDays, (d) => d.maxTempC, 'desc')
  const daysByMaxTempAsc = sortByMetric(allDays, (d) => d.maxTempC, 'asc')
  const daysByMinTempDesc = sortByMetric(allDays, (d) => d.minTempC, 'desc')
  const daysByMinTempAsc = sortByMetric(allDays, (d) => d.minTempC, 'asc')
  const daysByRainfallDesc = sortByMetric(allDays, (d) => d.rainfallMm, 'desc')

  // Build monthly summaries
  const monthlySummaries = new Map<string, ReturnType<typeof buildMonthlySummary>>()
  for (const payload of payloads) {
    const year = payload.year
    for (let month = 1; month <= 12; month++) {
      const normal = monthlyNormals.find((n) => n.month === month) ?? null
      const summary = buildMonthlySummary(year, month, payload.records, normal)
      monthlySummaries.set(`${year}-${String(month).padStart(2, '0')}`, summary)
    }
  }

  // Build annual summaries
  const annualSummaries = new Map<number, ReturnType<typeof buildAnnualSummary>>()
  for (const payload of payloads) {
    const summary = buildAnnualSummary(payload.year, payload.records, monthlyNormals)
    annualSummaries.set(payload.year, summary)
  }

  // Group by calendar date ("MM-DD")
  const daysByCalendarDate = new Map<string, ClimateDay[]>()
  for (const day of allDays) {
    const { month, day: dayNum } = parseIsoClimateDate(day.date)
    const key = `${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
    const existing = daysByCalendarDate.get(key)
    if (existing != null) {
      existing.push(day)
    } else {
      daysByCalendarDate.set(key, [day])
    }
  }

  return {
    allDays,
    loadedYears,
    daysByMaxTempDesc,
    daysByMaxTempAsc,
    daysByMinTempDesc,
    daysByMinTempAsc,
    daysByRainfallDesc,
    monthlySummaries,
    annualSummaries,
    daysByCalendarDate,
  }
}

/** Return an empty index for use before any data has loaded. */
export function emptyRecordsIndex(): RecordsIndex {
  return {
    allDays: [],
    loadedYears: [],
    daysByMaxTempDesc: [],
    daysByMaxTempAsc: [],
    daysByMinTempDesc: [],
    daysByMinTempAsc: [],
    daysByRainfallDesc: [],
    monthlySummaries: new Map(),
    annualSummaries: new Map(),
    daysByCalendarDate: new Map(),
  }
}
