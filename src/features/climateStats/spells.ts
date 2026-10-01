import type { ClimateDay } from '@/types/weather'
export interface Spell { readonly length: number; readonly startDate: string; readonly endDate: string; readonly ongoing: boolean }
function longest(records: readonly ClimateDay[], predicate: (r: ClimateDay) => boolean): Spell | null {
  let best: Spell | null = null; let run: ClimateDay[] = []
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date))
  for (const r of sorted) {
    const previous = run.at(-1)
    const gap = previous && (Date.parse(`${r.date}T00:00:00Z`) - Date.parse(`${previous.date}T00:00:00Z`)) > 86400000
    if (predicate(r) && !gap) run.push(r); else { if (run.length && (!best || run.length > best.length)) best = { length: run.length, startDate: run[0]!.date, endDate: run.at(-1)!.date, ongoing: false }; run = predicate(r) ? [r] : [] }
  }
  if (run.length && (!best || run.length > best.length)) best = { length: run.length, startDate: run[0]!.date, endDate: run.at(-1)!.date, ongoing: true }
  return best
}
export function longestWarmSpell(records: readonly ClimateDay[]): Spell | null { return longest(records, (r) => r.maxTempC != null && r.maxTempC >= 25) }
export function longestFrostSpell(records: readonly ClimateDay[]): Spell | null { return longest(records, (r) => r.minTempC != null && r.minTempC < 0) }
