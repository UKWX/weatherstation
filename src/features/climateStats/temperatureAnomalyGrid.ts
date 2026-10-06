import type { ClimateDay } from '@/types/weather'
import { TEMP_MONTHLY_NORMALS_C } from '@/features/normals/temperatureNormals'

export type TemperatureAnomalyMetric = keyof typeof TEMP_MONTHLY_NORMALS_C

export function temperatureAnomalyValue(
  record: ClimateDay,
  metric: TemperatureAnomalyMetric,
): number | null {
  if (metric === 'max') {
    return record.maxTempC != null && Number.isFinite(record.maxTempC) ? record.maxTempC : null
  }
  if (metric === 'min') {
    return record.minTempC != null && Number.isFinite(record.minTempC) ? record.minTempC : null
  }
  if (record.meanTempC != null && Number.isFinite(record.meanTempC)) return record.meanTempC
  return record.maxTempC != null && record.minTempC != null &&
    Number.isFinite(record.maxTempC) && Number.isFinite(record.minTempC)
    ? (record.maxTempC + record.minTempC) / 2 : null
}

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
  metric: TemperatureAnomalyMetric = 'mean',
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
      const values = days.map((record) => temperatureAnomalyValue(record, metric))
        .filter((value): value is number => value != null)
      const expected = new Date(Date.UTC(year, month, 0)).getUTCDate()
      const meanC = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
      const now = new Date()
      const complete = values.length >= Math.ceil(expected * 0.9) &&
        days.every((day) => day.status === 'finalised') &&
        (year < now.getUTCFullYear() || year === now.getUTCFullYear() && month < now.getUTCMonth() + 1)
      const normal = TEMP_MONTHLY_NORMALS_C[metric][month - 1] ?? null
      cells.push({ year, month, meanC, complete, anomalyC: meanC != null && normal != null ? meanC - normal : null })
    }
  }
  return cells
}
