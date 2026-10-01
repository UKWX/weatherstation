import type { ClimateDay } from '@/types/weather'
import { monthNormal } from '@/features/normals/rainfallNormals'
import { RAIN_DAY_THRESHOLD_MM, RAINFALL_START_DATE } from '@/config/weather'
export interface RainfallGridCell { readonly year: number; readonly month: number; readonly totalMm: number | null; readonly percent: number | null; readonly rainDays: number }
export function buildRainfallGrid(
  records: readonly ClimateDay[],
  firstYear = 2020,
  lastYear = new Date().getUTCFullYear(),
): readonly RainfallGridCell[] {
  const byMonth = new Map<string, Map<string, ClimateDay>>()
  for (const record of records) {
    if (record.date < RAINFALL_START_DATE || record.date < `${firstYear}-01-01` ||
      record.date > `${lastYear}-12-31`) continue
    const key = record.date.slice(0, 7)
    if (!byMonth.has(key)) byMonth.set(key, new Map())
    byMonth.get(key)!.set(record.date, record)
  }
  const out: RainfallGridCell[] = []
  for (let year = firstYear; year <= lastYear; year += 1) for (let month = 1; month <= 12; month += 1) {
    const rows = [...(byMonth.get(`${year}-${String(month).padStart(2, '0')}`)?.values() ?? [])]
    const valid = rows.filter((r): r is ClimateDay & { rainfallMm: number } =>
      r.rainfallMm != null && Number.isFinite(r.rainfallMm))
    const totalMm = valid.length ? valid.reduce((sum, r) => sum + r.rainfallMm, 0) : null
    const normal = monthNormal(month - 1)
    out.push({
      year, month, totalMm,
      percent: totalMm == null || normal <= 0 ? null : totalMm / normal * 100,
      rainDays: valid.filter((r) => r.rainfallMm > RAIN_DAY_THRESHOLD_MM).length,
    })
  }
  return out
}
