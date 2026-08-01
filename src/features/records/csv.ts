import type {
  AnnualRankEntry,
  DailyRankEntry,
  MonthlyRankEntry,
  OverallRecord,
  RecordProgressionEntry,
  ThresholdSummary,
} from './types'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function fmtVal(value: number, decimals = 1): string {
  return value.toFixed(decimals)
}

function fmtProvisional(provisional: boolean): string {
  return provisional ? 'Provisional' : 'Final'
}

export function buildOverallRecordsCsv(records: OverallRecord[]): string {
  const header = 'Metric,Value,Unit,Holders'
  const rows = records.map((r) => {
    const holders = r.holders.map((h) => h.label).join('; ')
    return [
      csvEscape(r.label),
      r.value != null ? fmtVal(r.value) : '',
      csvEscape(r.unit),
      csvEscape(holders),
    ].join(',')
  })
  return [header, ...rows].join('\r\n')
}

export function buildDailyRankingsCsv(
  entries: DailyRankEntry[],
  metricLabel: string,
  unit: string,
): string {
  const header = `Rank,Date,${csvEscape(metricLabel)} (${unit}),Status`
  const rows = entries.map((e) =>
    [
      String(e.rank),
      e.date,
      fmtVal(e.value),
      fmtProvisional(e.provisional),
    ].join(','),
  )
  return [header, ...rows].join('\r\n')
}

export function buildMonthlyRankingsCsv(
  entries: MonthlyRankEntry[],
  metricLabel: string,
  unit: string,
): string {
  const header = `Rank,Year,Month,${csvEscape(metricLabel)} (${unit}),Coverage,Status`
  const rows = entries.map((e) => {
    const monthName = MONTH_NAMES[e.month - 1] ?? String(e.month)
    return [
      String(e.rank),
      String(e.year),
      csvEscape(monthName),
      fmtVal(e.value),
      e.complete ? 'Complete' : 'Incomplete',
      fmtProvisional(e.provisional),
    ].join(',')
  })
  return [header, ...rows].join('\r\n')
}

export function buildAnnualRankingsCsv(
  entries: AnnualRankEntry[],
  metricLabel: string,
  unit: string,
): string {
  const header = `Rank,Year,${csvEscape(metricLabel)} (${unit}),Coverage,Status`
  const rows = entries.map((e) =>
    [
      String(e.rank),
      String(e.year),
      fmtVal(e.value),
      csvEscape(e.coverageNote),
      fmtProvisional(e.provisional),
    ].join(','),
  )
  return [header, ...rows].join('\r\n')
}

export function buildProgressionCsv(entries: RecordProgressionEntry[]): string {
  const header = 'Date,Value,Event,Previous Record'
  const rows = entries.map((e) => {
    const event = e.isNewRecord ? 'New record' : 'Tie'
    return [
      e.date,
      fmtVal(e.value),
      event,
      e.previousValue != null ? fmtVal(e.previousValue) : '',
    ].join(',')
  })
  return [header, ...rows].join('\r\n')
}

export function buildThresholdCsv(summary: ThresholdSummary): string {
  const heavyLabel = `Heavy rain (≥${summary.heavyRainThresholdMm} mm)`
  const header = `Year,≥20°C,≥25°C,≥30°C,Frost days (<0°C),Rain days (>0.1 mm),${csvEscape(heavyLabel)},Status`
  const rows = summary.byYear.map((r) =>
    [
      String(r.year),
      String(r.atOrAbove20C),
      String(r.atOrAbove25C),
      String(r.atOrAbove30C),
      String(r.frostDays),
      String(r.rainDays),
      String(r.heavyRainDays),
      fmtProvisional(r.provisional),
    ].join(','),
  )
  return [header, ...rows].join('\r\n')
}
