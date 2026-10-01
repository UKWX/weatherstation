import type { ClimateDay } from '@/types/weather'
import { monthNormal } from '@/features/normals/rainfallNormals'
import { RAIN_DAY_THRESHOLD_MM } from '@/config/weather'
export interface RainfallGridCell { readonly year: number; readonly month: number; readonly totalMm: number | null; readonly percent: number | null; readonly rainDays: number }
export function buildRainfallGrid(
  records: readonly ClimateDay[],
  firstYear = 2020,
  lastYear = new Date().getUTCFullYear(),
): readonly RainfallGridCell[] {
  const out: RainfallGridCell[] = []
  for (let year = firstYear; year <= lastYear; year += 1) for (let month = 1; month <= 12; month += 1) {
    const rows = records.filter((r) => r.date.startsWith(`${year}-${String(month).padStart(2, '0')}-`))
    const valid = rows.filter((r) => r.rainfallMm != null)
    const totalMm = valid.length ? valid.reduce((s, r) => s + (r.rainfallMm as number), 0) : null
    out.push({ year, month, totalMm, percent: totalMm == null ? null : totalMm / monthNormal(month - 1) * 100, rainDays: valid.filter((r) => (r.rainfallMm as number) > RAIN_DAY_THRESHOLD_MM).length })
  }
  return out
}
