import type { ClimateDay } from '@/types/weather'
export interface PercentileSummary { readonly min: number; readonly p05: number; readonly p25: number; readonly median: number; readonly p75: number; readonly p95: number; readonly max: number }
function percentile(values: readonly number[], p: number): number {
  const index = (values.length - 1) * p
  const lower = Math.floor(index)
  return values[lower]! + (values[Math.ceil(index)]! - values[lower]!) * (index - lower)
}
export function summarizeMonthlySpread(records: readonly ClimateDay[], month: number, useMin = false, firstYear = 1995): PercentileSummary | null {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  const values = records
    .filter((r) => Number(r.date.slice(0, 4)) >= firstYear && Number(r.date.slice(5, 7)) === month)
    .map((r) => useMin ? r.minTempC : r.maxTempC)
    .filter((v): v is number => v != null && Number.isFinite(v))
    .sort((a, b) => a - b)
  return values.length ? {
    min: percentile(values, 0), p05: percentile(values, 0.05),
    p25: percentile(values, 0.25), median: percentile(values, 0.5),
    p75: percentile(values, 0.75), p95: percentile(values, 0.95),
    max: percentile(values, 1),
  } : null
}
