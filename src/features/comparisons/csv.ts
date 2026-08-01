/**
 * CSV export functions for the Comparisons feature.
 */
import type { ComparisonPeriodResult, ComparisonResult } from '@/types/weather'
import type { SamePeriodYearResult } from './calculations'

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function fmt(value: number | null, decimals = 1): string {
  if (value == null) return ''
  return value.toFixed(decimals)
}

function fmtInt(value: number | null): string {
  if (value == null) return ''
  return String(value)
}

function fmtPct(value: number | null): string {
  if (value == null) return ''
  return value.toFixed(1) + '%'
}

function periodRow(r: ComparisonPeriodResult): string[] {
  return [
    csvEscape(r.selection.label),
    r.selection.startDate,
    r.selection.endDate,
    fmt(r.meanMaxTempC),
    fmt(r.meanMinTempC),
    fmt(r.meanTempC),
    fmt(r.highestMax.value),
    r.highestMax.dates.join('; '),
    fmt(r.lowestMin.value),
    r.lowestMin.dates.join('; '),
    fmt(r.rainfallTotalMm),
    fmtPct(r.rainfallPercentageOfNormal),
    fmtInt(r.rainDays),
    fmt(r.wettestDay.value),
    r.wettestDay.dates.join('; '),
    fmt(r.temperatureAnomalyC),
    fmtInt(r.thresholds.atOrAbove20C),
    fmtInt(r.thresholds.atOrAbove25C),
    fmtInt(r.thresholds.atOrAbove30C),
    fmtInt(r.thresholds.frostDays),
    fmtInt(r.coverage.maxTemperature.valid),
    fmtInt(r.coverage.maxTemperature.missing),
    String(r.coverage.provisional),
    String(r.coverage.rainfall.complete),
  ]
}

const PERIOD_HEADER = [
  'Period',
  'Start',
  'End',
  'Mean Max (°C)',
  'Mean Min (°C)',
  'Mean Temp (°C)',
  'Highest Max (°C)',
  'Highest Max Date(s)',
  'Lowest Min (°C)',
  'Lowest Min Date(s)',
  'Rainfall (mm)',
  'Rainfall % of Normal',
  'Rain Days',
  'Wettest Day (mm)',
  'Wettest Day Date(s)',
  'Temp Anomaly (°C)',
  'Days ≥20°C',
  'Days ≥25°C',
  'Days ≥30°C',
  'Frost Days',
  'Valid Days (Max Temp)',
  'Missing Days (Max Temp)',
  'Provisional',
  'Rainfall Complete',
].join(',')

/**
 * Build a CSV for a two-period comparison result.
 */
export function buildComparisonCsv(result: ComparisonResult): string {
  const leftRow = periodRow(result.left).join(',')
  const rightRow = periodRow(result.right).join(',')

  const diffSection = [
    '',
    'Differences (Left − Right)',
    `Mean Temp Difference (°C),${fmt(result.meanTempDifferenceC)}`,
    `Rainfall Difference (mm),${fmt(result.rainfallDifferenceMm)}`,
    `Rainfall % Difference,${fmtPct(result.rainfallPercentageDifference)}`,
  ].join('\r\n')

  return [PERIOD_HEADER, leftRow, rightRow, diffSection].join('\r\n')
}

/**
 * Build a CSV for a same-period multi-year result set.
 */
export function buildSamePeriodCsv(results: readonly SamePeriodYearResult[]): string {
  const rows = results.map((r) => periodRow(r.result).join(','))
  return [PERIOD_HEADER, ...rows].join('\r\n')
}
