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
  const cells: TemperatureAnomalyCell[] = []
  for (let year = firstYear; year <= lastYear; year += 1) {
    for (let month = 1; month <= 12; month += 1) {
      const days = records.filter((r) => r.date.startsWith(`${year}-${String(month).padStart(2, '0')}-`))
      const values = days
        .filter((r) => r.maxTempC != null && r.minTempC != null)
        .map((r) => ((r.maxTempC as number) + (r.minTempC as number)) / 2)
      const expected = new Date(Date.UTC(year, month, 0)).getUTCDate()
      const meanC = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
      const complete = values.length >= expected * 0.9
      const normal = TEMP_MONTHLY_NORMALS_C.mean[month - 1] ?? null
      cells.push({ year, month, meanC, complete, anomalyC: complete && meanC != null && normal != null ? meanC - normal : null })
    }
  }
  return cells
}
