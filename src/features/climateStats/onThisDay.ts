import type { ClimateDay } from '@/types/weather'
export interface OnThisDayRow { readonly year: number; readonly maxC: number | null; readonly minC: number | null }
export function buildOnThisDayRows(records: readonly ClimateDay[], month: number, day: number, firstYear = 1995): readonly OnThisDayRow[] {
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) return []
  return records.filter((r) => {
    const [y, m, d] = r.date.split('-').map(Number)
    return y! >= firstYear && m === month && d === day
  })
    .map((r) => ({
      year: Number(r.date.slice(0, 4)),
      maxC: r.maxTempC != null && Number.isFinite(r.maxTempC) ? r.maxTempC : null,
      minC: r.minTempC != null && Number.isFinite(r.minTempC) ? r.minTempC : null,
    }))
    .sort((a, b) => a.year - b.year)
}
