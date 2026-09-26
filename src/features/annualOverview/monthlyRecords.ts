import { compareClimateDates, formatEuropeLondonDisplay, parseIsoClimateDate } from '@/lib/climate'
import { ANNUAL_OVERVIEW_RECORD_CARD_COLOR_BY_TYPE } from '@/features/annualOverview/recordsCard'
import type { AnnualOverviewRecordType } from '@/features/annualOverview/model'
import type { AnnualClimatePayload, ClimateDateString, ClimateDay } from '@/types/weather'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export const ANNUAL_OVERVIEW_MONTHLY_RECORD_TYPE_ORDER: readonly AnnualOverviewRecordType[] = [
  'record-high-max',
  'record-low-max',
  'record-high-min',
  'record-low-min',
] as const

export type AnnualOverviewMonthlyRecordStatus = 'historical' | 'broken' | 'equalled'

export interface AnnualOverviewMonthlyRecordCell {
  readonly key: string
  readonly month: number
  readonly monthLabel: string
  readonly monthShortLabel: string
  readonly type: AnnualOverviewRecordType
  readonly typeLabel: string
  readonly color: string
  readonly status: AnnualOverviewMonthlyRecordStatus
  readonly valueC: number | null
  readonly valueLabel: string
  readonly yearLabel: string
  readonly setDateLabel: string
  readonly equalledDate: ClimateDateString | null
  readonly equalledDateLabel: string | null
  readonly tooltipTitle: string
  readonly tooltipValue: string
  readonly tooltipDate: string
  readonly tooltipDateLabel: string
  readonly tooltipPrevious: string | null
  readonly tooltipMargin: string | null
  readonly tooltipEqualled: string | null
  readonly ariaLabel: string
  readonly displayDate: ClimateDateString | null
  readonly previousRecordValueC: number | null
  readonly previousRecordYearLabel: string | null
  readonly marginC: number | null
}

export interface AnnualOverviewMonthlyRecordRow {
  readonly type: AnnualOverviewRecordType
  readonly label: string
  readonly color: string
  readonly cells: readonly AnnualOverviewMonthlyRecordCell[]
}

export interface AnnualOverviewMonthlyRecordHighlight {
  readonly key: string
  readonly type: AnnualOverviewRecordType
  readonly typeLabel: string
  readonly month: number
  readonly monthLabel: string
  readonly color: string
  readonly status: 'broken' | 'equalled'
  readonly valueLabel: string
  readonly valueC: number
  readonly lineLabel: string
  readonly description: string
  readonly date: ClimateDateString
}

export interface AnnualOverviewMonthlyRecordsCardModel {
  readonly year: number
  readonly firstYearOfRecord: number | null
  readonly brokenCount: number
  readonly equalledCount: number
  readonly subtitle: string
  readonly footnote: string
  readonly highlights: readonly AnnualOverviewMonthlyRecordHighlight[]
  readonly rows: readonly AnnualOverviewMonthlyRecordRow[]
  readonly linkedDailyRecordMonthsByDate: ReadonlyMap<ClimateDateString, readonly string[]>
}

type MonthlyExtremeAccumulator = {
  value: number | null
  dates: ClimateDateString[]
}

type MonthlyExtremeSummary = {
  readonly value: number | null
  readonly dates: readonly ClimateDateString[]
}

type MonthlyRecordCollection = Record<
  AnnualOverviewRecordType,
  MonthlyExtremeAccumulator
>

export function buildAnnualOverviewMonthlyRecordsCardModel(input: {
  readonly year: number
  readonly selectedYearRecords: readonly ClimateDay[]
  readonly historicalPayloads: readonly AnnualClimatePayload[]
}): AnnualOverviewMonthlyRecordsCardModel {
  const historicalPayloads = [...input.historicalPayloads].sort((left, right) => left.year - right.year)
  const firstYearOfRecord =
    historicalPayloads.map((payload) => payload.year).sort((left, right) => left - right)[0] ?? null
  const baselinePayloads = historicalPayloads.filter((payload) => payload.year !== input.year)
  const selectedRecords = [...input.selectedYearRecords].sort((left, right) =>
    compareClimateDates(left.date, right.date),
  )

  const rows = ANNUAL_OVERVIEW_MONTHLY_RECORD_TYPE_ORDER.map((type) => {
    const label = getAnnualOverviewMonthlyRecordTypeLabel(type)
    const color = ANNUAL_OVERVIEW_RECORD_CARD_COLOR_BY_TYPE[type]
    const cells = MONTH_SHORT.map((monthLabel, monthIndex) => {
      const month = monthIndex + 1
      const baseline = buildMonthlyExtremeSummary(type, month, baselinePayloads)
      const fullHistory = buildMonthlyExtremeSummary(type, month, historicalPayloads)
      const broken = findBrokenMonthlyRecord(type, month, selectedRecords, baseline.value)
      const equalled =
        broken == null ? findEqualledMonthlyRecord(type, month, selectedRecords, baseline.value) : null
      const historicalValue = baseline.value
      const historicalDates = baseline.dates

      const displayValue =
        broken?.value ?? historicalValue ?? fullHistory.value
      const displayDate =
        broken?.date ?? historicalDates[0] ?? fullHistory.dates[0] ?? null
      const displayYears =
        historicalDates.length > 0
          ? formatYearList(historicalDates)
          : displayDate != null
            ? String(parseIsoClimateDate(displayDate).year)
            : '—'
      const status: AnnualOverviewMonthlyRecordStatus =
        broken != null ? 'broken' : equalled != null ? 'equalled' : 'historical'
      const tooltipTitle = `${label} · ${MONTH_LONG[monthIndex]}`
      const tooltipValue = displayValue != null ? `${displayValue.toFixed(1)}°C` : 'No record available'
      const tooltipDate =
        broken != null
          ? `Set ${formatEuropeLondonDisplay(broken.date)}`
          : formatMonthlyRecordDateLine(displayDate, historicalDates)
      const tooltipPrevious =
        broken != null && historicalValue != null
          ? `Previous record ${historicalValue.toFixed(1)}°C (${formatYearList(historicalDates)})`
          : null
      const tooltipMargin =
        broken != null && historicalValue != null
          ? `Beaten by ${Math.abs(broken.value - historicalValue).toFixed(1)}°C`
          : null
      const tooltipEqualled =
        equalled != null ? `Equalled on ${formatEuropeLondonDisplay(equalled.date)}` : null
      const ariaLabel = [
        tooltipTitle,
        tooltipValue,
        tooltipDate,
        tooltipPrevious,
        tooltipMargin,
        tooltipEqualled,
      ]
        .filter((value): value is string => value != null && value.length > 0)
        .join('. ')

      return {
        key: `${type}-${month}`,
        month,
        monthLabel: MONTH_LONG[monthIndex],
        monthShortLabel: monthLabel,
        type,
        typeLabel: label,
        color,
        status,
        valueC: displayValue,
        valueLabel: displayValue != null ? displayValue.toFixed(1) : '—',
        yearLabel: broken != null ? String(input.year) : displayYears,
        setDateLabel:
          displayDate != null
            ? `Set ${formatEuropeLondonDisplay(displayDate, { day: 'numeric', month: 'short' })}`
            : 'No historical record',
        equalledDate: equalled?.date ?? null,
        equalledDateLabel:
          equalled != null
            ? formatEuropeLondonDisplay(equalled.date, { day: 'numeric', month: 'short', year: 'numeric' })
            : null,
        tooltipTitle,
        tooltipValue,
        tooltipDate,
        tooltipDateLabel: displayDate != null ? formatEuropeLondonDisplay(displayDate) : 'No historical record',
        tooltipPrevious,
        tooltipMargin,
        tooltipEqualled,
        ariaLabel,
        displayDate,
        previousRecordValueC: historicalValue,
        previousRecordYearLabel: historicalDates.length > 0 ? formatYearList(historicalDates) : null,
        marginC:
          broken != null && historicalValue != null ? Math.abs(broken.value - historicalValue) : null,
      } satisfies AnnualOverviewMonthlyRecordCell
    })

    return {
      type,
      label,
      color,
      cells,
    } satisfies AnnualOverviewMonthlyRecordRow
  })

  const highlights = rows
    .flatMap((row) =>
      row.cells.flatMap((cell) => {
        if (cell.status !== 'broken' && cell.status !== 'equalled') {
          return []
        }
        if (cell.valueC == null || cell.displayDate == null) {
          return []
        }
        const previousRecordText =
          cell.previousRecordValueC != null && cell.previousRecordYearLabel != null
            ? `${cell.previousRecordValueC.toFixed(1)}°C (${cell.previousRecordYearLabel})`
            : null
        return [
          {
            key: `${cell.type}-${cell.month}-${cell.status}`,
            type: cell.type,
            typeLabel: cell.typeLabel,
            month: cell.month,
            monthLabel: cell.monthLabel,
            color: cell.color,
            status: cell.status,
            valueLabel: `${cell.valueC.toFixed(1)}°C`,
            valueC: cell.valueC,
            lineLabel:
              cell.status === 'equalled'
                ? `${cell.typeLabel} · ${cell.monthLabel} · Equalled`
                : `${cell.typeLabel} · ${cell.monthLabel}`,
            description:
              cell.status === 'equalled'
                ? `Set ${formatEuropeLondonDisplay(cell.equalledDate ?? cell.displayDate, { day: 'numeric', month: 'short' })}, previous record ${previousRecordText ?? '—'}`
                : `Set ${formatEuropeLondonDisplay(cell.displayDate, { day: 'numeric', month: 'short' })}, previous record ${previousRecordText ?? '—'}`,
            date: cell.status === 'equalled' ? (cell.equalledDate ?? cell.displayDate) : cell.displayDate,
          } satisfies AnnualOverviewMonthlyRecordHighlight,
        ]
      }),
    )
    .sort((left, right) => compareClimateDates(left.date, right.date) || left.month - right.month)

  const linkedDailyRecordMonthsByDate = new Map<ClimateDateString, string[]>()
  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.status !== 'broken' || cell.displayDate == null) {
        continue
      }
      const existing = linkedDailyRecordMonthsByDate.get(cell.displayDate) ?? []
      if (!existing.includes(cell.monthLabel)) {
        existing.push(cell.monthLabel)
      }
      linkedDailyRecordMonthsByDate.set(cell.displayDate, existing)
    }
  }

  const brokenCount = highlights.filter((highlight) => highlight.status === 'broken').length
  const equalledCount = highlights.filter((highlight) => highlight.status === 'equalled').length
  const subtitle = `All-time monthly extremes for Wakefield · ${brokenCount} broken in ${input.year}${
    equalledCount > 0 ? ` · ${equalledCount} equalled` : ''
  }`
  const footnote = `Outlined cells are monthly records set or equalled in ${input.year}. Records based on data since ${
    firstYearOfRecord ?? 'the first available year'
  }.`

  return {
    year: input.year,
    firstYearOfRecord,
    brokenCount,
    equalledCount,
    subtitle,
    footnote,
    highlights,
    rows,
    linkedDailyRecordMonthsByDate,
  }
}

export function getAnnualOverviewMonthlyRecordTypeLabel(type: AnnualOverviewRecordType): string {
  switch (type) {
    case 'record-high-max':
      return 'Highest max'
    case 'record-low-max':
      return 'Lowest max'
    case 'record-high-min':
      return 'Highest min'
    case 'record-low-min':
      return 'Lowest min'
  }
}

export function getAnnualOverviewMonthlyRecordCellFill(type: AnnualOverviewRecordType, alpha: number): string {
  const normalized = ANNUAL_OVERVIEW_RECORD_CARD_COLOR_BY_TYPE[type].replace('#', '')
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`
}

function buildMonthlyExtremeSummary(
  type: AnnualOverviewRecordType,
  month: number,
  payloads: readonly AnnualClimatePayload[],
): MonthlyExtremeSummary {
  const accumulator = createMonthlyRecordCollection()[type]
  for (const payload of payloads) {
    for (const record of payload.records) {
      if (parseIsoClimateDate(record.date).month !== month) {
        continue
      }
      const candidate = getRecordValue(type, record)
      if (candidate == null) {
        continue
      }
      updateMonthlyExtreme(accumulator, record.date, candidate, type)
    }
  }

  return {
    value: accumulator.value,
    dates: [...accumulator.dates].sort(compareClimateDates),
  }
}

function findBrokenMonthlyRecord(
  type: AnnualOverviewRecordType,
  month: number,
  records: readonly ClimateDay[],
  baselineValue: number | null,
): { readonly date: ClimateDateString; readonly value: number } | null {
  if (baselineValue == null) {
    return null
  }

  let winner: { date: ClimateDateString; value: number } | null = null

  for (const record of records) {
    if (parseIsoClimateDate(record.date).month !== month) {
      continue
    }
    const value = getRecordValue(type, record)
    if (value == null || !isMoreExtremeThanBaseline(type, value, baselineValue)) {
      continue
    }
    if (winner == null || isMoreExtremeThanCurrent(type, value, winner.value)) {
      winner = { date: record.date, value }
      continue
    }
    if (value === winner.value && compareClimateDates(record.date, winner.date) < 0) {
      winner = { date: record.date, value }
    }
  }

  return winner
}

function findEqualledMonthlyRecord(
  type: AnnualOverviewRecordType,
  month: number,
  records: readonly ClimateDay[],
  baselineValue: number | null,
): { readonly date: ClimateDateString; readonly value: number } | null {
  if (baselineValue == null) {
    return null
  }

  for (const record of records) {
    if (parseIsoClimateDate(record.date).month !== month) {
      continue
    }
    const value = getRecordValue(type, record)
    if (value == null || value !== baselineValue) {
      continue
    }
    return { date: record.date, value }
  }

  return null
}

function createMonthlyRecordCollection(): MonthlyRecordCollection {
  return {
    'record-high-max': { value: null, dates: [] },
    'record-low-max': { value: null, dates: [] },
    'record-high-min': { value: null, dates: [] },
    'record-low-min': { value: null, dates: [] },
  }
}

function getRecordValue(type: AnnualOverviewRecordType, record: ClimateDay): number | null {
  return type === 'record-high-max' || type === 'record-low-max' ? record.maxTempC : record.minTempC
}

function updateMonthlyExtreme(
  accumulator: MonthlyExtremeAccumulator,
  date: ClimateDateString,
  candidate: number,
  type: AnnualOverviewRecordType,
): void {
  if (accumulator.value == null) {
    accumulator.value = candidate
    accumulator.dates = [date]
    return
  }

  if (isMoreExtremeThanCurrent(type, candidate, accumulator.value)) {
    accumulator.value = candidate
    accumulator.dates = [date]
    return
  }

  if (candidate === accumulator.value && !accumulator.dates.includes(date)) {
    accumulator.dates.push(date)
  }
}

function isMoreExtremeThanBaseline(
  type: AnnualOverviewRecordType,
  candidate: number,
  baseline: number,
): boolean {
  return type === 'record-high-max' || type === 'record-high-min'
    ? candidate > baseline
    : candidate < baseline
}

function isMoreExtremeThanCurrent(
  type: AnnualOverviewRecordType,
  candidate: number,
  current: number,
): boolean {
  return type === 'record-high-max' || type === 'record-high-min'
    ? candidate > current
    : candidate < current
}

function formatYearList(dates: readonly ClimateDateString[]): string {
  const years = [...new Set(dates.map((date) => parseIsoClimateDate(date).year))].sort(
    (left, right) => left - right,
  )
  return years.length > 0 ? years.join(', ') : '—'
}

function formatMonthlyRecordDateLine(
  displayDate: ClimateDateString | null,
  historicalDates: readonly ClimateDateString[],
): string {
  if (displayDate == null) {
    return 'No historical record'
  }
  if (historicalDates.length <= 1) {
    return `Set ${formatEuropeLondonDisplay(displayDate)}`
  }
  return `Set ${historicalDates.map((date) => formatEuropeLondonDisplay(date)).join('; ')}`
}
