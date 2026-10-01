import type { ClimateDay } from '@/types/weather'

export interface Spell {
  readonly length: number
  readonly startDate: string
  readonly endDate: string
  readonly ongoing: boolean
}

function allSpells(records: readonly ClimateDay[], predicate: (record: ClimateDay) => boolean): readonly Spell[] {
  const sorted = [...new Map(records.map((record) => [record.date, record])).values()]
    .sort((a, b) => a.date.localeCompare(b.date))
  const spells: Spell[] = []
  let start: string | null = null
  let end: string | null = null
  let length = 0

  const finish = (ongoing: boolean) => {
    if (start != null && end != null) {
      spells.push({ length, startDate: start, endDate: end, ongoing })
    }
    start = null
    end = null
    length = 0
  }

  for (const record of sorted) {
    if (end != null && Date.parse(`${record.date}T00:00:00Z`) -
      Date.parse(`${end}T00:00:00Z`) !== 86_400_000) finish(false)
    if (!predicate(record)) {
      finish(false)
      continue
    }
    start ??= record.date
    end = record.date
    length += 1
  }
  finish(true)
  return spells
}

export function warmSpells(records: readonly ClimateDay[]): readonly Spell[] {
  return allSpells(records, (record) => record.maxTempC != null &&
    Number.isFinite(record.maxTempC) && record.maxTempC >= 25)
}

export function frostSpells(records: readonly ClimateDay[]): readonly Spell[] {
  return allSpells(records, (record) => record.minTempC != null &&
    Number.isFinite(record.minTempC) && record.minTempC < 0)
}

export function longestWarmSpell(records: readonly ClimateDay[]): Spell | null {
  return [...warmSpells(records)].sort((a, b) => b.length - a.length)[0] ?? null
}

export function longestFrostSpell(records: readonly ClimateDay[]): Spell | null {
  return [...frostSpells(records)].sort((a, b) => b.length - a.length)[0] ?? null
}
