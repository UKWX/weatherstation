import { compareClimateDates, daysInMonth, formatEuropeLondonDisplay, parseIsoClimateDate, toClimateDateString } from '@/lib/climate'
import type { AnnualOverviewRecordEvent, AnnualOverviewRecordType } from '@/features/annualOverview/model'
import type { ClimateDateString } from '@/types/weather'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

export const ANNUAL_OVERVIEW_RECORD_CARD_COLOR_BY_TYPE: Readonly<
  Record<AnnualOverviewRecordType, string>
> = {
  'record-high-max': '#c22b2b',
  'record-high-min': '#d9951a',
  'record-low-min': '#2453c9',
  'record-low-max': '#6fa3d6',
}

export const ANNUAL_OVERVIEW_RECORD_CARD_TYPE_ORDER: readonly AnnualOverviewRecordType[] = [
  'record-high-max',
  'record-high-min',
  'record-low-max',
  'record-low-min',
] as const

export interface AnnualOverviewRecordCardTile {
  readonly key: string
  readonly label: string
  readonly value: string
  readonly color: string | null
}

export interface AnnualOverviewRecordCardTooltipBlock {
  readonly color: string
  readonly title: string
  readonly previous: string
  readonly margin: string
  readonly ariaLabel: string
}

export interface AnnualOverviewRecordCardDateGroup {
  readonly date: ClimateDateString
  readonly dateKey: string
  readonly displayDate: string
  readonly records: readonly AnnualOverviewRecordEvent[]
  readonly visualRecords: readonly AnnualOverviewRecordEvent[]
  readonly tooltipBlocks: readonly AnnualOverviewRecordCardTooltipBlock[]
  readonly linkedMonthlyRecordMonth: string | null
  readonly ariaLabel: string
}

export interface AnnualOverviewRecordCardDayCell {
  readonly month: number
  readonly day: number
  readonly dateKey: string
  readonly valid: boolean
  readonly future: boolean
  readonly group: AnnualOverviewRecordCardDateGroup | null
}

export interface AnnualOverviewRecordCardMonthRow {
  readonly month: number
  readonly label: string
  readonly cells: readonly AnnualOverviewRecordCardDayCell[]
}

export interface AnnualOverviewRecordCardModel {
  readonly summaryText: string
  readonly totalRecords: number
  readonly typeCounts: ReadonlyMap<AnnualOverviewRecordType, number>
  readonly presentTypes: readonly AnnualOverviewRecordType[]
  readonly largestMarginC: number
  readonly tiles: readonly AnnualOverviewRecordCardTile[]
  readonly groupedRecords: ReadonlyMap<string, AnnualOverviewRecordCardDateGroup>
  readonly monthRows: readonly AnnualOverviewRecordCardMonthRow[]
  readonly topRecords: readonly AnnualOverviewRecordEvent[]
}

export function buildAnnualOverviewRecordsCardModel(input: {
  readonly year: number
  readonly rows: readonly AnnualOverviewRecordEvent[]
  readonly latestObservedDate: ClimateDateString | null
  readonly linkedMonthlyRecordMonthsByDate?: ReadonlyMap<ClimateDateString, string>
}): AnnualOverviewRecordCardModel {
  const typeCounts = getAnnualOverviewRecordTypeCounts(input.rows)
  const presentTypes = ANNUAL_OVERVIEW_RECORD_CARD_TYPE_ORDER.filter(
    (type) => (typeCounts.get(type) ?? 0) > 0,
  )
  const largestMarginC = input.rows.reduce((max, row) => Math.max(max, row.marginC), 0)
  const groupedRecords = buildAnnualOverviewRecordGroups(
    input.year,
    input.rows,
    input.linkedMonthlyRecordMonthsByDate,
  )
  const latest =
    input.latestObservedDate != null ? parseIsoClimateDate(input.latestObservedDate) : null

  return {
    summaryText: buildAnnualOverviewRecordsSummaryText(
      input.rows.length,
      input.latestObservedDate,
    ),
    totalRecords: input.rows.length,
    typeCounts,
    presentTypes,
    largestMarginC,
    tiles: [
      { key: 'total', label: 'New records', value: String(input.rows.length), color: null },
      ...presentTypes.map((type) => ({
        key: type,
        label: getAnnualOverviewRecordTypeLabel(type),
        value: String(typeCounts.get(type) ?? 0),
        color: ANNUAL_OVERVIEW_RECORD_CARD_COLOR_BY_TYPE[type],
      })),
      {
        key: 'margin',
        label: 'Largest margin',
        value: `+${largestMarginC.toFixed(1)}°C`,
        color: null,
      },
    ],
    groupedRecords,
    monthRows: MONTH_SHORT.map((label, monthIndex) => {
      const month = monthIndex + 1
      const days = daysInMonth(input.year, month)
      return {
        month,
        label,
        cells: Array.from({ length: 31 }, (_, dayIndex) => {
          const day = dayIndex + 1
          const valid = day <= days
          const dateKey = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const future =
            latest != null && (month > latest.month || (month === latest.month && day > latest.day))
          return {
            month,
            day,
            dateKey,
            valid,
            future,
            group: valid && !future ? (groupedRecords.get(dateKey) ?? null) : null,
          }
        }),
      }
    }),
    topRecords: [...input.rows]
      .sort((left, right) => right.marginC - left.marginC || compareClimateDates(right.date, left.date))
      .slice(0, 5),
  }
}

export function buildAnnualOverviewRecordsSummaryText(
  count: number,
  latestObservedDate: ClimateDateString | null,
): string {
  const throughText =
    latestObservedDate == null
      ? ''
      : ` through ${formatEuropeLondonDisplay(latestObservedDate, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}`
  return `${count} new all-time daily records for Wakefield${throughText}`
}

export function buildAnnualOverviewRecordGroups(
  year: number,
  rows: readonly AnnualOverviewRecordEvent[],
  linkedMonthlyRecordMonthsByDate?: ReadonlyMap<ClimateDateString, string>,
): ReadonlyMap<string, AnnualOverviewRecordCardDateGroup> {
  const grouped = new Map<string, AnnualOverviewRecordEvent[]>()
  for (const row of rows) {
    const { month, day } = parseIsoClimateDate(row.date)
    const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const existing = grouped.get(key) ?? []
    existing.push(row)
    grouped.set(key, existing)
  }

  return new Map(
    [...grouped.entries()].map(([dateKey, dateRows]) => {
      const records = [...dateRows].sort(
        (left, right) =>
          ANNUAL_OVERVIEW_RECORD_CARD_TYPE_ORDER.indexOf(left.type) -
          ANNUAL_OVERVIEW_RECORD_CARD_TYPE_ORDER.indexOf(right.type),
      )
      const { month, day } = parseMonthDayKey(dateKey)
      const date = records[0]?.date ?? toClimateDateString(year, month, day)
      const displayDate = formatEuropeLondonDisplay(date, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
      const tooltipBlocks = records.map((row) => buildAnnualOverviewRecordTooltipBlock(row))
      const linkedMonthlyRecordMonth = linkedMonthlyRecordMonthsByDate?.get(date) ?? null
      const linkedMonthlyRecordText =
        linkedMonthlyRecordMonth != null
          ? `Also a new monthly record for ${linkedMonthlyRecordMonth}`
          : null
      const ariaLabel = [displayDate, ...tooltipBlocks.map((block) => block.ariaLabel), linkedMonthlyRecordText]
        .filter((value): value is string => value != null)
        .join('. ')

      return [
        dateKey,
        {
          date,
          dateKey,
          displayDate,
          records,
          visualRecords: records.slice(0, 2),
          tooltipBlocks,
          linkedMonthlyRecordMonth,
          ariaLabel,
        },
      ] as const
    }),
  )
}

export function getAnnualOverviewRecordTypeCounts(
  rows: readonly AnnualOverviewRecordEvent[],
): ReadonlyMap<AnnualOverviewRecordType, number> {
  const counts = new Map<AnnualOverviewRecordType, number>()
  for (const row of rows) {
    counts.set(row.type, (counts.get(row.type) ?? 0) + 1)
  }
  return counts
}

export function getAnnualOverviewRecordTypeLabel(type: AnnualOverviewRecordType): string {
  switch (type) {
    case 'record-high-max':
      return 'Record high maximum'
    case 'record-high-min':
      return 'Record high minimum'
    case 'record-low-max':
      return 'Record low maximum'
    case 'record-low-min':
      return 'Record low minimum'
  }
}

export function getAnnualOverviewRecordTooltipTypeLabel(type: AnnualOverviewRecordType): string {
  switch (type) {
    case 'record-high-max':
      return 'Record high max'
    case 'record-high-min':
      return 'Record high min'
    case 'record-low-max':
      return 'Record low max'
    case 'record-low-min':
      return 'Record low min'
  }
}

export function formatAnnualOverviewPreviousRecordLabel(row: AnnualOverviewRecordEvent): string {
  const years = row.previousRecordYears.join(', ')
  return years.length > 0
    ? `${row.previousRecordC.toFixed(1)}°C (${years})`
    : `${row.previousRecordC.toFixed(1)}°C`
}

export function formatAnnualOverviewPreviousRecordSummary(row: AnnualOverviewRecordEvent): string {
  return `Previous record ${formatAnnualOverviewPreviousRecordLabel(row)}`
}

export function buildAnnualOverviewRecordTooltipBlock(
  row: AnnualOverviewRecordEvent,
): AnnualOverviewRecordCardTooltipBlock {
  const title = `${getAnnualOverviewRecordTooltipTypeLabel(row.type)}: ${row.currentValueC.toFixed(1)}°C`
  const previous = formatAnnualOverviewPreviousRecordSummary(row)
  const margin = `Beaten by ${row.marginC.toFixed(1)}°C`
  return {
    color: ANNUAL_OVERVIEW_RECORD_CARD_COLOR_BY_TYPE[row.type],
    title,
    previous,
    margin,
    ariaLabel: `${title}. ${previous}. ${margin}`,
  }
}

export function getAnnualOverviewRecordFillOpacity(marginC: number): number {
  return 0.45 + 0.55 * Math.min(Math.max(marginC, 0) / 4, 1)
}

export function getAnnualOverviewRecordFillColor(
  type: AnnualOverviewRecordType,
  marginC: number,
): string {
  return hexToRgba(
    ANNUAL_OVERVIEW_RECORD_CARD_COLOR_BY_TYPE[type],
    getAnnualOverviewRecordFillOpacity(marginC),
  )
}

function parseMonthDayKey(dateKey: string): { readonly month: number; readonly day: number } {
  const [month, day] = dateKey.split('-').map((value) => Number.parseInt(value, 10))
  return {
    month: Number.isFinite(month) ? month : 1,
    day: Number.isFinite(day) ? day : 1,
  }
}

function hexToRgba(color: string, alpha: number): string {
  const normalized = color.replace('#', '')
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((part) => `${part}${part}`)
          .join('')
      : normalized
  const red = Number.parseInt(value.slice(0, 2), 16)
  const green = Number.parseInt(value.slice(2, 4), 16)
  const blue = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(alpha, 1)).toFixed(3)})`
}
