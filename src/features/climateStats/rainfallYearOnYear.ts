import type { ClimateDay } from '@/types/weather'
import { RAINFALL_START_DATE } from '@/config/weather'

export interface CumulativeRainfall { readonly year: number; readonly date: string; readonly totalMm: number }
export function buildCumulativeRainfall(records: readonly ClimateDay[], year: number): readonly CumulativeRainfall[] {
  let total = 0
  return [...new Map(records.map((record) => [record.date, record])).values()]
    .filter((r) => r.date.startsWith(`${year}-`) && r.date >= RAINFALL_START_DATE)
    .sort((a, b) => a.date.localeCompare(b.date))
    .flatMap((r) => {
    if (r.rainfallMm == null || !Number.isFinite(r.rainfallMm)) return []
    total += r.rainfallMm
    return [{ year, date: r.date, totalMm: total }]
  })
}
