import type { ClimateDay } from '@/types/weather'
import { RAINFALL_START_DATE } from '@/config/weather'

export interface DrySpell {
  readonly length: number
  readonly startDate: string
  readonly endDate: string
}

export function buildDrySpells(records: readonly ClimateDay[], minimum = 5): readonly DrySpell[] {
  const sorted = [...new Map(records.map((record) => [record.date, record])).values()]
    .sort((a, b) => a.date.localeCompare(b.date))
  const spells: DrySpell[] = []
  let start: string | null = null
  let end: string | null = null
  let length = 0
  const flush = () => {
    if (start != null && end != null && length >= minimum) {
      spells.push({ length, startDate: start, endDate: end })
    }
    start = null
    end = null
    length = 0
  }

  for (const record of sorted) {
    if (end != null && Date.parse(`${record.date}T00:00:00Z`) -
      Date.parse(`${end}T00:00:00Z`) !== 86_400_000) flush()
    if (record.date < RAINFALL_START_DATE || record.rainfallMm == null ||
      !Number.isFinite(record.rainfallMm) || record.rainfallMm >= 0.2) {
      flush()
      continue
    }
    start ??= record.date
    end = record.date
    length += 1
  }
  flush()
  return spells
}
