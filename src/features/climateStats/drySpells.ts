import type { ClimateDay } from '@/types/weather'
export interface DrySpell { readonly length: number; readonly startDate: string; readonly endDate: string }
export function buildDrySpells(records: readonly ClimateDay[], minimum = 5): readonly DrySpell[] {
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))
  const spells: DrySpell[] = []
  let run: ClimateDay[] = []
  const flush = () => {
    if (run.length >= minimum) spells.push({ length: run.length, startDate: run[0]!.date, endDate: run.at(-1)!.date })
    run = []
  }
  for (const record of sorted) {
    const previous = run.at(-1)
    const gap = previous != null && Date.parse(`${record.date}T00:00:00Z`) - Date.parse(`${previous.date}T00:00:00Z`) > 86400000
    if (gap || record.rainfallMm == null || record.rainfallMm >= 0.2) flush()
    if (record.rainfallMm != null && record.rainfallMm < 0.2) run.push(record)
  }
  flush()
  return spells
}
