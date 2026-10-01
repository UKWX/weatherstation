import type { ClimateDay } from '@/types/weather'
export interface OnThisDayRow { readonly year: number; readonly maxC: number | null; readonly minC: number | null }
export function buildOnThisDayRows(records: readonly ClimateDay[], month: number, day: number, firstYear = 1995): readonly OnThisDayRow[] {
  return records.filter((r) => { const [y, m, d] = r.date.split('-').map(Number); return y >= firstYear && m === month && d === day })
    .map((r) => ({ year: Number(r.date.slice(0, 4)), maxC: r.maxTempC, minC: r.minTempC }))
    .sort((a, b) => a.year - b.year)
}
