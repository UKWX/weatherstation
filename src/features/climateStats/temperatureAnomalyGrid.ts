import type { ClimateDay } from '@/types/weather'
import { TEMP_MONTHLY_NORMALS_C } from '@/features/normals/temperatureNormals'

export interface TemperatureAnomalyCell {
  readonly year: number
  readonly month: number
  readonly meanC: number | null
  readonly anomalyC: number | null
  readonly complete: boolean
}

export function buildTemperatureAnomalyGrid(
  records: readonly ClimateDay[],
  firstYear = 1995,
  lastYear = new Date().getFullYear(),
): readonly TemperatureAnomalyCell[] {
  const byMonth = new Map<string, Map<string, ClimateDay>>()
  for (const record of records) {
    if (record.date < `${firstYear}-01-01` || record.date > `${lastYear}-12-31`) continue
    const key = record.date.slice(0, 7)
    if (!byMonth.has(key)) byMonth.set(key, new Map())
    byMonth.get(key)!.set(record.date, record)
  }
  const cells: TemperatureAnomalyCell[] = []
  for (let year = firstYear; year <= lastYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const days = [...(byMonth.get(`${year}-${String(month).padStart(2, '0')}`)?.values() ?? [])]
      const values = days.flatMap((r) =>
        r.maxTempC != null && r.minTempC != null &&
        Number.isFinite(r.maxTempC) && Number.isFinite(r.minTempC)
          ? [(r.maxTempC + r.minTempC) / 2] : [],
      )
      const expected = new Date(Date.UTC(year, month, 0)).getUTCDate()
      const meanC = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
      const complete = values.length >= Math.ceil(expected * 0.9) &&
        days.every((day) => day.status === 'finalised')
      const normal = TEMP_MONTHLY_NORMALS_C.mean[month - 1] ?? null
      cells.push({ year, month, meanC, complete, anomalyC: complete && meanC != null && normal != null ? meanC - normal : null })
    }
  }
  return cells
}
