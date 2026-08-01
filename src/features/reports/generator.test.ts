import { describe, expect, it, vi } from 'vitest'
import type { AnnualClimatePayload, ClimateDateString, ClimateDay, MonthlyNormal } from '@/types/weather'
import {
  buildAnnualReportCsv,
  buildAnnualReportModel,
  buildMonthlyReportCsv,
  buildMonthlyReportModel,
} from '@/features/reports/generator'

function makeDay(date: ClimateDateString, overrides: Partial<ClimateDay> = {}): ClimateDay {
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

function daysForMonth(year: number, month: number, overrides: Partial<ClimateDay> = {}): ClimateDay[] {
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Array.from({ length: count }, (_, index) => {
    const day = index + 1
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as ClimateDateString
    return makeDay(date, overrides)
  })
}

function payloadForYear(year: number, monthOverrides: Partial<ClimateDay> = {}): AnnualClimatePayload {
  const records: ClimateDay[] = []
  for (let month = 1; month <= 12; month++) {
    records.push(...daysForMonth(year, month, monthOverrides))
  }
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

const MONTHLY_NORMALS: MonthlyNormal[] = Array.from({ length: 12 }, (_, index) => ({
  month: index + 1,
  meanMaxTempC: 18,
  meanMinTempC: 9,
  meanTempC: 13.5,
  rainfallMm: 50,
}))

describe('report generators', () => {
  it('keeps tied dates and computes rankings and rainfall percentages', () => {
    const payload2024 = payloadForYear(2024)
    const payload2023 = payloadForYear(2023)
    const june = payload2024.records.filter((record) => record.date.startsWith('2024-06-'))
    const modified = payload2024.records.map((record) => {
      if (record.date === '2024-06-10' || record.date === '2024-06-20') {
        return { ...record, maxTempC: 31, rainfallMm: 12 }
      }
      if (record.date === '2024-06-11') {
        return { ...record, maxTempC: 31, rainfallMm: 12 }
      }
      return record
    })
    const payload = { ...payload2024, records: modified }
    expect(june.length).toBe(30)

    const report = buildMonthlyReportModel({
      year: 2024,
      month: 6,
      selectedYearPayload: payload,
      comparablePayloads: [payload2023, payload],
      monthlyNormals: MONTHLY_NORMALS,
    })

    expect(report.tMax.value).toBe(31)
    expect(report.tMax.dates).toEqual(['2024-06-10', '2024-06-11', '2024-06-20'])
    expect(report.wettestDay.dates).toEqual(['2024-06-10', '2024-06-11', '2024-06-20'])
    expect(report.temperatureRanking.rank).toBe(1)
    expect(report.rainfallPercentage).not.toBeNull()
    expect(report.compactText).toContain('TMax 31.0 °C')
  })

  it('handles missing data and partial-month counts without treating zero as missing', () => {
    const payload = payloadForYear(2025)
    const records = payload.records
      .filter((record) => record.date !== '2025-06-15')
      .map((record) => {
        if (record.date === '2025-06-16') return { ...record, rainfallMm: 0 }
        if (record.date === '2025-06-17') return { ...record, rainfallMm: null, maxTempC: null }
        return record
      })

    const report = buildMonthlyReportModel({
      year: 2025,
      month: 6,
      selectedYearPayload: { ...payload, records },
      comparablePayloads: [{ ...payload, records }],
      monthlyNormals: MONTHLY_NORMALS,
    })

    expect(report.counts.expectedDays).toBe(30)
    expect(report.counts.temperatureMissingDays).toBe(2)
    expect(report.counts.rainfallMissingDays).toBe(2)
    expect(report.rainfallTotalMm).toBeGreaterThan(0)
    expect(report.compactText).toContain('Rainfall')
  })

  it('flags provisional annual years and includes threshold and spell summaries', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T12:00:00Z'))
    const payload = payloadForYear(2026, { status: 'provisional' })
    const records = payload.records.filter((record) => record.date <= '2026-07-31')
    const report = buildAnnualReportModel({
      year: 2026,
      selectedYearPayload: {
        ...payload,
        records,
        complete: false,
        through: '2026-07-31',
      },
      comparablePayloads: [{ ...payload, records }],
      monthlyNormals: MONTHLY_NORMALS,
    })

    expect(report.provisional).toBe(true)
    expect(report.thresholds.atOrAbove20C).toBeGreaterThan(0)
    expect(report.longestSpells.length).toBe(4)
    expect(report.completenessStatement).toContain('Provisional')
    vi.useRealTimers()
  })

  it('builds CSV output with required columns for monthly and annual exports', () => {
    const payload = payloadForYear(2024)
    const monthlyReport = buildMonthlyReportModel({
      year: 2024,
      month: 6,
      selectedYearPayload: payload,
      comparablePayloads: [payload],
      monthlyNormals: MONTHLY_NORMALS,
    })
    const annualReport = buildAnnualReportModel({
      year: 2024,
      selectedYearPayload: payload,
      comparablePayloads: [payload],
      monthlyNormals: MONTHLY_NORMALS,
    })

    const monthlyCsv = buildMonthlyReportCsv(monthlyReport)
    const annualCsv = buildAnnualReportCsv(annualReport)

    expect(monthlyCsv).toContain('TMax (°C)')
    expect(monthlyCsv).toContain('Temperature ranking')
    expect(annualCsv).toContain('Annual mean temperature (°C)')
    expect(annualCsv).toContain('Month,Mean max (°C),Mean min (°C),Mean temp (°C),Rainfall (mm),Rain days')
  })
})
