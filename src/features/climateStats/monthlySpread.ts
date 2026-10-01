import type { ClimateDay } from '@/types/weather'
export interface PercentileSummary { readonly min: number; readonly p05: number; readonly p25: number; readonly median: number; readonly p75: number; readonly p95: number; readonly max: number }
function percentile(values: readonly number[], p: number): number { const v = [...values].sort((a, b) => a - b); if (!v.length) return NaN; const i = (v.length - 1) * p; const lo = Math.floor(i); return v[lo]! + (v[Math.ceil(i)]! - v[lo]!) * (i - lo) }
export function summarizeMonthlySpread(records: readonly ClimateDay[], month: number, useMin = false, firstYear = 1995): PercentileSummary | null {
  const values = records.filter((r) => Number(r.date.slice(0, 4)) >= firstYear && Number(r.date.slice(5, 7)) === month).map((r) => useMin ? r.minTempC : r.maxTempC).filter((v): v is number => v != null)
  return values.length ? { min: percentile(values, 0), p05: percentile(values, .05), p25: percentile(values, .25), median: percentile(values, .5), p75: percentile(values, .75), p95: percentile(values, .95), max: percentile(values, 1) } : null
}
