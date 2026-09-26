import {
  compareClimateDates,
  daysInMonth,
  formatEuropeLondonDisplay,
  parseIsoClimateDate,
} from '@/lib/climate'
import type {
  AnnualOverviewDataset,
  AnnualOverviewDay,
  AnnualOverviewRecordEvent,
  AnnualOverviewRecordType,
} from '@/features/annualOverview/model'

export const ANNUAL_OVERVIEW_CHART_WIDTH = 1400
export const ANNUAL_OVERVIEW_CHART_HEIGHT = 560
export const ANNUAL_OVERVIEW_EXPORT_WIDTH = 1480

const EXPORT_FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
const EXPORT_PAGE_BACKGROUND = '#f5f7f9'
const EXPORT_SURFACE = '#ffffff'
const EXPORT_SURFACE_BORDER = '#e6e9ec'
const EXPORT_PAGE_PADDING = 32
const EXPORT_CARD_PADDING_X = 24
const EXPORT_CARD_PADDING_Y = 24
const EXPORT_CARD_GAP = 20
const EXPORT_CARD_RADIUS = 16
const EXPORT_CHART_OFFSET_X = (ANNUAL_OVERVIEW_EXPORT_WIDTH - ANNUAL_OVERVIEW_CHART_WIDTH) / 2
const EXPORT_SUBTITLE = 'Daily maximum & minimum vs. the normal range and all-time daily records'
const EXPORT_FOOTNOTE_LEAD =
  'Shaded band shows the normal range between the average daily maximum and minimum, coloured by temperature. Dashed lines mark the all-time daily record maximum and minimum for each calendar day.'
const EXPORT_LEGEND_TOP_GAP = 9
const EXPORT_MONTH_HEADER_GAP_BELOW_LEGEND = 13
const RECORD_CARD_COLOR_BY_TYPE: Readonly<Record<AnnualOverviewRecordType, string>> = {
  'record-high-max': '#c22b2b',
  'record-high-min': '#d9951a',
  'record-low-min': '#2453c9',
  'record-low-max': '#6fa3d6',
}
const RECORD_CARD_TYPE_ORDER: readonly AnnualOverviewRecordType[] = [
  'record-high-max',
  'record-high-min',
  'record-low-max',
  'record-low-min',
]

const MARGIN = {
  top: 112,
  right: 34,
  bottom: 82,
  left: 72,
} as const
const MONTH_HEADER_BASELINE_Y = MARGIN.top - 28

const MONTH_NAMES = [
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

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

const NORMAL_GRADIENT_STOPS = [
  { offset: '0%', color: '#f2922f' },
  { offset: '18%', color: '#f2922f' },
  { offset: '34%', color: '#ffd955' },
  { offset: '54%', color: '#4caf50' },
  { offset: '72%', color: '#c3e9b6' },
  { offset: '88%', color: '#2f7fd6' },
  { offset: '100%', color: '#0f3f6e' },
] as const

export const ANNUAL_OVERVIEW_COLORS = {
  ink: '#1c2530',
  sub: '#5b6773',
  grid: '#e4e8ec',
  monthLine: '#aeb8c2',
  bandEdge: '#7a8794',
  actualMax: '#c22b2b',
  actualMin: '#2453c9',
  rollingMean: '#555b61',
  recordHighMax: '#e07a4d',
  recordLowMin: '#6fa3d6',
  tagHighMax: '#a3241d',
  tagLowMax: '#0d7d7d',
  tagHighMin: '#b8860b',
  tagLowMin: '#1d3f8a',
  crosshair: '#8a94a0',
} as const

export interface AnnualOverviewChartGeometry {
  readonly width: number
  readonly height: number
  readonly plotWidth: number
  readonly plotHeight: number
  readonly yMin: number
  readonly yMax: number
  readonly yTicks: readonly number[]
}

export function createAnnualOverviewChartGeometry(
  dataset: AnnualOverviewDataset,
): AnnualOverviewChartGeometry {
  const plotWidth = ANNUAL_OVERVIEW_CHART_WIDTH - MARGIN.left - MARGIN.right
  const plotHeight = ANNUAL_OVERVIEW_CHART_HEIGHT - MARGIN.top - MARGIN.bottom
  const values = dataset.days.flatMap((day) =>
    [
      day.actualMaxC,
      day.actualMinC,
      day.rollingMeanC,
      day.normalMaxC,
      day.normalMinC,
      day.recordHighMaxC,
      day.recordLowMinC,
      day.recordHighMinC,
      day.recordLowMaxC,
    ].filter((value): value is number => value != null),
  )

  const rawMin = values.length > 0 ? Math.min(...values) : -5
  const rawMax = values.length > 0 ? Math.max(...values) : 25
  const yMin = Math.floor((rawMin - 2) / 5) * 5
  const yMax = Math.ceil((rawMax + 2) / 5) * 5
  const yTicks = Array.from(
    { length: Math.max(2, Math.round((yMax - yMin) / 5) + 1) },
    (_, index) => yMin + index * 5,
  )

  return {
    width: ANNUAL_OVERVIEW_CHART_WIDTH,
    height: ANNUAL_OVERVIEW_CHART_HEIGHT,
    plotWidth,
    plotHeight,
    yMin,
    yMax,
    yTicks,
  }
}

export function xForDay(index: number, totalDays: number): number {
  if (totalDays <= 1) {
    return MARGIN.left
  }

  return MARGIN.left + (index / (totalDays - 1)) * (ANNUAL_OVERVIEW_CHART_WIDTH - MARGIN.left - MARGIN.right)
}

export function yForValue(value: number, yMin: number, yMax: number): number {
  const span = Math.max(1, yMax - yMin)
  return MARGIN.top + (ANNUAL_OVERVIEW_CHART_HEIGHT - MARGIN.top - MARGIN.bottom) - ((value - yMin) / span) * (ANNUAL_OVERVIEW_CHART_HEIGHT - MARGIN.top - MARGIN.bottom)
}

export function buildLinePath(
  dataset: AnnualOverviewDataset,
  selector: (day: AnnualOverviewDay) => number | null,
  yMin: number,
  yMax: number,
): string {
  const segments: string[] = []
  let current: string[] = []

  dataset.days.forEach((day, index) => {
    const value = selector(day)
    if (value == null) {
      if (current.length > 1) {
        segments.push(current.join(' '))
      }
      current = []
      return
    }

    const x = xForDay(index, dataset.days.length)
    const y = yForValue(value, yMin, yMax)
    current.push(`${current.length === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
  })

  if (current.length > 1) {
    segments.push(current.join(' '))
  }

  return segments.join(' ')
}

export function buildNormalBandPath(
  dataset: AnnualOverviewDataset,
  yMin: number,
  yMax: number,
): string | null {
  const topPoints: string[] = []
  const bottomPoints: string[] = []

  for (let index = 0; index < dataset.days.length; index += 1) {
    const day = dataset.days[index]!
    if (day.normalMaxC == null || day.normalMinC == null) {
      continue
    }
    const x = xForDay(index, dataset.days.length)
    topPoints.push(`${topPoints.length === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${yForValue(day.normalMaxC, yMin, yMax).toFixed(2)}`)
    bottomPoints.unshift(`L ${x.toFixed(2)} ${yForValue(day.normalMinC, yMin, yMax).toFixed(2)}`)
  }

  if (topPoints.length < 2) {
    return null
  }

  return `${topPoints.join(' ')} ${bottomPoints.join(' ')} Z`
}

export function getMonthBoundaries(dataset: AnnualOverviewDataset) {
  return MONTH_NAMES.map((label, monthIndex) => {
    const month = monthIndex + 1
    const monthDays = dataset.days.filter((day) => day.month === month)
    const first = monthDays[0]
    const last = monthDays.at(-1)

    return {
      label,
      shortLabel: MONTH_SHORT[monthIndex],
      month,
      startIndex: first?.index ?? 0,
      endIndex: last?.index ?? 0,
    }
  })
}

export function getRecordMarkerY(
  day: AnnualOverviewDay,
  type: AnnualOverviewRecordType,
  yMin: number,
  yMax: number,
): number | null {
  const value =
    type === 'record-high-max' || type === 'record-low-max' ? day.actualMaxC : day.actualMinC

  return value == null ? null : yForValue(value, yMin, yMax)
}

export function getRecordMarkerColor(type: AnnualOverviewRecordType): string {
  switch (type) {
    case 'record-high-max':
      return ANNUAL_OVERVIEW_COLORS.tagHighMax
    case 'record-low-max':
      return ANNUAL_OVERVIEW_COLORS.tagLowMax
    case 'record-high-min':
      return ANNUAL_OVERVIEW_COLORS.tagHighMin
    case 'record-low-min':
      return ANNUAL_OVERVIEW_COLORS.tagLowMin
  }
}

export function buildAnnualOverviewExportSvg(input: {
  readonly year: number
  readonly dataset: AnnualOverviewDataset
  readonly subtitle: string
  readonly footnote: string
  readonly recordSummary: string
  readonly includeChart?: boolean
  readonly includeRecords?: boolean
  readonly showRecordOutlines?: boolean
  readonly interactiveRecords?: boolean
}): string {
  const includeChart = input.includeChart ?? true
  const includeRecords = input.includeRecords ?? true
  const showRecordOutlines = input.showRecordOutlines ?? true
  const geometry = createAnnualOverviewChartGeometry(input.dataset)
  const monthBoundaries = getMonthBoundaries(input.dataset)
  const bandPath = buildNormalBandPath(input.dataset, geometry.yMin, geometry.yMax)
  const maxPath = buildLinePath(input.dataset, (day) => day.actualMaxC, geometry.yMin, geometry.yMax)
  const minPath = buildLinePath(input.dataset, (day) => day.actualMinC, geometry.yMin, geometry.yMax)
  const rollingPath = buildLinePath(input.dataset, (day) => day.rollingMeanC, geometry.yMin, geometry.yMax)
  const recordHighMaxPath = buildLinePath(input.dataset, (day) => day.recordHighMaxC, geometry.yMin, geometry.yMax)
  const recordLowMinPath = buildLinePath(input.dataset, (day) => day.recordLowMinC, geometry.yMin, geometry.yMax)
  const rows = input.dataset.recordEvents.length > 0 ? input.dataset.recordEvents : []
  const title = `${input.year} Daily Temperature Data for Wakefield`
  const contentWidth = ANNUAL_OVERVIEW_EXPORT_WIDTH - EXPORT_PAGE_PADDING * 2
  const textWidth = contentWidth - EXPORT_CARD_PADDING_X * 2
  const subtitleLines = wrapText(EXPORT_SUBTITLE, 14, textWidth)
  const footnoteLines = wrapText(normalizeExportFootnote(input.footnote), 11.5, textWidth)
  const recordsSummary = buildRecordsSummaryText(rows.length, input.dataset.latestObservedDate)
  const recordSummaryLines = wrapText(recordsSummary, 13, textWidth)
  const chartCardX = EXPORT_PAGE_PADDING
  let cursorY = EXPORT_PAGE_PADDING
  let chartMarkup = ''
  let recordsMarkup = ''

  if (includeChart) {
    const chartCardY = cursorY
    const titleY = chartCardY + 42
    const subtitleY = titleY + 28
    const legend = buildLegendSvg({
      year: input.year,
      x: chartCardX + EXPORT_CARD_PADDING_X,
      y: subtitleY + subtitleLines.length * 18 + EXPORT_LEGEND_TOP_GAP,
      maxWidth: textWidth,
      showRecordOutlines,
    })
    const chartY =
      legend.bottom +
      EXPORT_MONTH_HEADER_GAP_BELOW_LEGEND -
      MONTH_HEADER_BASELINE_Y
    const footnoteY = chartY + ANNUAL_OVERVIEW_CHART_HEIGHT + 28
    const chartCardHeight =
      footnoteY +
      Math.max(footnoteLines.length, 1) * 16 -
      chartCardY +
      EXPORT_CARD_PADDING_Y
    chartMarkup = `
  <rect x="${chartCardX}" y="${chartCardY}" width="${contentWidth}" height="${chartCardHeight}" rx="${EXPORT_CARD_RADIUS}" fill="${EXPORT_SURFACE}" stroke="${EXPORT_SURFACE_BORDER}"/>
  <text x="${chartCardX + EXPORT_CARD_PADDING_X}" y="${titleY}" font-size="24" font-weight="700" fill="${ANNUAL_OVERVIEW_COLORS.ink}">${escapeXml(title)}</text>
  ${buildMultilineTextSvg(subtitleLines, {
    x: chartCardX + EXPORT_CARD_PADDING_X,
    y: subtitleY,
    fontSize: 14,
    lineHeight: 18,
    fill: ANNUAL_OVERVIEW_COLORS.sub,
  })}
  ${legend.markup}
  <g transform="translate(${EXPORT_CHART_OFFSET_X} ${chartY})">
  ${geometry.yTicks.map((tick) => {
    const y = yForValue(tick, geometry.yMin, geometry.yMax)
    return `<g><line x1="${MARGIN.left}" x2="${ANNUAL_OVERVIEW_CHART_WIDTH - MARGIN.right}" y1="${y}" y2="${y}" stroke="${ANNUAL_OVERVIEW_COLORS.grid}" stroke-width="${tick === 0 ? 1.4 : 1}"/><text x="${MARGIN.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="${ANNUAL_OVERVIEW_COLORS.sub}">${tick}</text></g>`
  }).join('')}
  ${monthBoundaries.map((month) => {
    const x = xForDay(month.startIndex, input.dataset.days.length)
    const labelX = (xForDay(month.startIndex, input.dataset.days.length) + xForDay(month.endIndex, input.dataset.days.length)) / 2
    return `<g><line x1="${x}" x2="${x}" y1="${MARGIN.top - 18}" y2="${ANNUAL_OVERVIEW_CHART_HEIGHT - MARGIN.bottom}" stroke="${ANNUAL_OVERVIEW_COLORS.monthLine}" stroke-width="1"/><text x="${labelX}" y="${MONTH_HEADER_BASELINE_Y}" text-anchor="middle" font-size="12.5" font-weight="700" fill="${ANNUAL_OVERVIEW_COLORS.ink}">${month.shortLabel.toUpperCase()}</text></g>`
  }).join('')}
  ${bandPath == null ? '' : `<path d="${bandPath}" fill="url(#annual-normal-band)" fill-opacity="0.62"/>`}
  <path d="${buildLinePath(input.dataset, (day) => day.normalMaxC, geometry.yMin, geometry.yMax)}" fill="none" stroke="${ANNUAL_OVERVIEW_COLORS.bandEdge}" stroke-width="1" opacity="0.55"/>
  <path d="${buildLinePath(input.dataset, (day) => day.normalMinC, geometry.yMin, geometry.yMax)}" fill="none" stroke="${ANNUAL_OVERVIEW_COLORS.bandEdge}" stroke-width="1" opacity="0.55"/>
  <path d="${recordHighMaxPath}" fill="none" stroke="${ANNUAL_OVERVIEW_COLORS.recordHighMax}" stroke-width="1.4" stroke-dasharray="6 4" opacity="0.9"/>
  <path d="${recordLowMinPath}" fill="none" stroke="${ANNUAL_OVERVIEW_COLORS.recordLowMin}" stroke-width="1.4" stroke-dasharray="6 4" opacity="0.9"/>
  <path d="${maxPath}" fill="none" stroke="${ANNUAL_OVERVIEW_COLORS.actualMax}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="${minPath}" fill="none" stroke="${ANNUAL_OVERVIEW_COLORS.actualMin}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="${rollingPath}" fill="none" stroke="${ANNUAL_OVERVIEW_COLORS.rollingMean}" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>
  ${showRecordOutlines ? buildMarkerSvg(input.dataset, geometry.yMin, geometry.yMax) : ''}
  <rect x="${MARGIN.left}" y="${MARGIN.top}" width="${geometry.plotWidth}" height="${geometry.plotHeight}" fill="none" stroke="#c7ced4" stroke-width="1"/>
  ${buildBottomAxisSvg(input.dataset)}
  <text x="28" y="${MARGIN.top + geometry.plotHeight / 2}" transform="rotate(-90 28 ${MARGIN.top + geometry.plotHeight / 2})" font-size="12" fill="${ANNUAL_OVERVIEW_COLORS.sub}">Temperature (°C)</text>
  </g>
  ${buildMultilineTextSvg(footnoteLines, {
    x: chartCardX + EXPORT_CARD_PADDING_X,
    y: footnoteY,
    fontSize: 11.5,
    lineHeight: 16,
    fill: ANNUAL_OVERVIEW_COLORS.sub,
  })}`
    cursorY += chartCardHeight + (includeRecords ? EXPORT_CARD_GAP : 0)
  }

  if (includeRecords) {
    const recordsCardY = cursorY
    const recordsCard = buildExportRecordsCardSvg({
      year: input.year,
      rows,
      x: chartCardX,
      y: recordsCardY,
      width: textWidth,
      summaryLines: recordSummaryLines,
      latestObservedDate: input.dataset.latestObservedDate,
      interactive: input.interactiveRecords ?? false,
    })
    recordsMarkup = recordsCard.markup
    cursorY += recordsCard.height
  }

  const contentHeight = cursorY + EXPORT_PAGE_PADDING

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${ANNUAL_OVERVIEW_EXPORT_WIDTH}" height="${contentHeight}" viewBox="0 0 ${ANNUAL_OVERVIEW_EXPORT_WIDTH} ${contentHeight}" role="img" aria-label="${escapeXml(`${input.year} Daily Temperature Data for Wakefield`)}">
  <defs>
    <linearGradient id="annual-normal-band" x1="0" y1="${MARGIN.top}" x2="0" y2="${ANNUAL_OVERVIEW_CHART_HEIGHT - MARGIN.bottom}" gradientUnits="userSpaceOnUse">
      ${NORMAL_GRADIENT_STOPS.map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.color}"/>`).join('')}
    </linearGradient>
    <style>
      text { font-family: ${EXPORT_FONT_FAMILY}; }
    </style>
  </defs>
  <rect width="${ANNUAL_OVERVIEW_EXPORT_WIDTH}" height="${contentHeight}" fill="${EXPORT_PAGE_BACKGROUND}"/>
  ${chartMarkup}
  ${recordsMarkup}
</svg>`
}

export async function downloadAnnualOverviewPng(svgMarkup: string, filename: string): Promise<void> {
  const size = parseSvgSize(svgMarkup)
  const image = await loadSvgImage(svgMarkup)
  const canvas = document.createElement('canvas')
  canvas.width = size.width * 2
  canvas.height = size.height * 2
  const context = canvas.getContext('2d')
  if (context == null) {
    throw new Error('Canvas context unavailable')
  }

  context.scale(2, 2)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size.width, size.height)
  context.drawImage(image, 0, 0, size.width, size.height)
  const pngBlob = await canvasToBlob(canvas)
  const url = URL.createObjectURL(pngBlob)
  triggerDownload(url, filename)
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

export function downloadAnnualOverviewSvg(svgMarkup: string, filename: string): void {
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

function buildLegendSvg(input: {
  readonly year: number
  readonly x: number
  readonly y: number
  readonly maxWidth: number
  readonly showRecordOutlines: boolean
}): { readonly markup: string; readonly bottom: number } {
  const items = [
    'Normal range (dynamic mean)',
    '7-day rolling mean temperature',
    'Max Temp (°C)',
    'Min Temp (°C)',
    'Absolute max on record',
    'Absolute min on record',
    ...(input.showRecordOutlines ? [`New record set in ${input.year}`] : []),
  ]

  let x = input.x
  let y = input.y
  return {
    markup: items
      .map((label, index) => {
        const itemWidth = estimateLegendItemWidth(label)
        if (index > 0 && x + itemWidth > input.x + input.maxWidth) {
          x = input.x
          y += 28
        }

        const itemX = x
        const itemY = y
        x += itemWidth

        let marker = ''
        if (index === 0) {
          marker = `<rect x="${itemX}" y="${itemY - 9}" width="22" height="10" rx="2" fill="url(#annual-normal-band)" opacity="0.8"/>`
        } else if (index === 1) {
          marker = `<line x1="${itemX}" y1="${itemY - 4}" x2="${itemX + 22}" y2="${itemY - 4}" stroke="${ANNUAL_OVERVIEW_COLORS.rollingMean}" stroke-width="4" stroke-linecap="round"/>`
        } else if (index === 2) {
          marker = `<line x1="${itemX}" y1="${itemY - 4}" x2="${itemX + 22}" y2="${itemY - 4}" stroke="${ANNUAL_OVERVIEW_COLORS.actualMax}" stroke-width="2.6"/>`
        } else if (index === 3) {
          marker = `<line x1="${itemX}" y1="${itemY - 4}" x2="${itemX + 22}" y2="${itemY - 4}" stroke="${ANNUAL_OVERVIEW_COLORS.actualMin}" stroke-width="2.6"/>`
        } else if (index === 4) {
          marker = `<line x1="${itemX}" y1="${itemY - 4}" x2="${itemX + 22}" y2="${itemY - 4}" stroke="${ANNUAL_OVERVIEW_COLORS.recordHighMax}" stroke-width="1.8" stroke-dasharray="6 4"/>`
        } else if (index === 5) {
          marker = `<line x1="${itemX}" y1="${itemY - 4}" x2="${itemX + 22}" y2="${itemY - 4}" stroke="${ANNUAL_OVERVIEW_COLORS.recordLowMin}" stroke-width="1.8" stroke-dasharray="6 4"/>`
        } else {
          marker = `<circle cx="${itemX + 11}" cy="${itemY - 4}" r="3" fill="none" stroke="${ANNUAL_OVERVIEW_COLORS.tagHighMax}" stroke-width="1.2"/>`
        }
        const text = `<text x="${itemX + 30}" y="${itemY}" font-size="12.5" fill="${ANNUAL_OVERVIEW_COLORS.ink}">${escapeXml(label)}</text>`
        const chunk = `${marker}${text}`
        return chunk
      })
      .join(''),
    bottom: y + 8,
  }
}

function buildBottomAxisSvg(dataset: AnnualOverviewDataset): string {
  const ticks = getMonthBoundaries(dataset).map((month) => month.startIndex)
  return ticks
    .map((index) => {
      const day = dataset.days[index]
      if (day == null) {
        return ''
      }
      return `<text x="${xForDay(index, dataset.days.length)}" y="${ANNUAL_OVERVIEW_CHART_HEIGHT - 24}" transform="rotate(-55 ${xForDay(index, dataset.days.length)} ${ANNUAL_OVERVIEW_CHART_HEIGHT - 24})" text-anchor="end" font-size="11" fill="${ANNUAL_OVERVIEW_COLORS.sub}">${escapeXml(formatEuropeLondonDisplay(day.date, { day: '2-digit', month: 'short' }))}</text>`
    })
    .join('')
}

function buildMarkerSvg(dataset: AnnualOverviewDataset, yMin: number, yMax: number): string {
  return dataset.days
    .flatMap((day) =>
      day.recordFlags.map((type) => {
        const y = getRecordMarkerY(day, type, yMin, yMax)
        if (y == null) {
          return ''
        }
        return `<circle cx="${xForDay(day.index, dataset.days.length)}" cy="${y}" r="3.25" fill="none" stroke="${getRecordMarkerColor(type)}" stroke-width="1.2"/>`
      }),
    )
    .join('')
}

function buildExportRecordsCardSvg(input: {
  readonly year: number
  readonly rows: readonly AnnualOverviewRecordEvent[]
  readonly x: number
  readonly y: number
  readonly width: number
  readonly summaryLines: readonly string[]
  readonly latestObservedDate: string | null
  readonly interactive: boolean
}): { readonly markup: string; readonly height: number } {
  const contentX = input.x + EXPORT_CARD_PADDING_X
  const contentWidth = input.width
  const cardWidth = contentWidth + EXPORT_CARD_PADDING_X * 2
  const cardTop = input.y
  const titleY = cardTop + 36
  const summaryY = titleY + 26
  const summaryBottomY = summaryY + Math.max(input.summaryLines.length, 1) * 18
  const tilesY = summaryBottomY + 18
  const typeCounts = getRecordTypeCounts(input.rows)
  const presentTypes = RECORD_CARD_TYPE_ORDER.filter((type) => (typeCounts.get(type) ?? 0) > 0)
  const largestMargin = input.rows.reduce((max, row) => Math.max(max, row.marginC), 0)
  const tiles = [
    { key: 'total', label: 'New records', value: String(input.rows.length), color: null as string | null },
    ...presentTypes.map((type) => ({
      key: type,
      label: getRecordTypeLabel(type),
      value: String(typeCounts.get(type) ?? 0),
      color: RECORD_CARD_COLOR_BY_TYPE[type],
    })),
    {
      key: 'margin',
      label: 'Largest margin',
      value: `+${largestMargin.toFixed(1)}°C`,
      color: null as string | null,
    },
  ]
  const tileGap = 12
  const tileHeight = 74
  const tileWidth =
    tiles.length > 0 ? (contentWidth - tileGap * (tiles.length - 1)) / tiles.length : contentWidth
  const tilesMarkup = tiles
    .map((tile, index) => {
      const tileX = contentX + index * (tileWidth + tileGap)
      const labelX = tileX + 14 + (tile.color == null ? 0 : 16)
      const swatch = tile.color
        ? `<rect x="${tileX + 14}" y="${tilesY + 14}" width="10" height="10" rx="5" fill="${tile.color}"/>`
        : ''
      return `
      <g>
        <rect x="${tileX}" y="${tilesY}" width="${tileWidth}" height="${tileHeight}" rx="8" fill="#f5f7f9"/>
        ${swatch}
        <text x="${labelX}" y="${tilesY + 24}" font-size="12" fill="#5b6773">${escapeXml(tile.label)}</text>
        <text x="${tileX + 14}" y="${tilesY + 56}" font-size="24" font-weight="700" fill="#1c2530">${escapeXml(tile.value)}</text>
      </g>`
    })
    .join('')

  const monthLabelWidth = 34
  const dayHeaderY = tilesY + tileHeight + 26
  const cellGap = 2
  const cellHeight = 16
  const gridX = contentX + monthLabelWidth
  const gridWidth = contentWidth - monthLabelWidth
  const cellWidth = (gridWidth - cellGap * 30) / 31
  const rowHeight = cellHeight + cellGap
  const gridTop = dayHeaderY + 10
  const latest = input.latestObservedDate != null ? parseIsoClimateDate(input.latestObservedDate) : null
  const groupedRecords = groupRecordsByDate(input.rows)
  const cellsMarkup = MONTH_SHORT.map((monthLabel, monthIndex) => {
    const month = monthIndex + 1
    const daysInThisMonth = daysInMonth(input.year, month)
    const rowY = gridTop + monthIndex * rowHeight
    const monthLabelMarkup = `<text x="${contentX}" y="${rowY + 12}" font-size="11" fill="#5b6773">${monthLabel}</text>`
    const dayCells = Array.from({ length: 31 }, (_, dayIndex) => {
      const day = dayIndex + 1
      if (day > daysInThisMonth) {
        return ''
      }

      const cellX = gridX + dayIndex * (cellWidth + cellGap)
      const cellY = rowY
      const dateKey = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const records = groupedRecords.get(dateKey) ?? []
      const afterLatest =
        latest != null && (month > latest.month || (month === latest.month && day > latest.day))
      if (records.length === 0 || afterLatest) {
        return `<rect x="${cellX}" y="${cellY}" width="${cellWidth}" height="${cellHeight}" rx="2" fill="#f5f7f9" stroke="#e6e9ec" stroke-width="0.7"/>`
      }

      const sortedRecords = [...records].sort(
        (left, right) =>
          RECORD_CARD_TYPE_ORDER.indexOf(left.type) - RECORD_CARD_TYPE_ORDER.indexOf(right.type),
      )
      const visualRecords = sortedRecords.slice(0, 2)
      if (visualRecords.length === 1) {
        const record = visualRecords[0]!
        return `
        <g ${input.interactive ? `class="records-grid-cell--record" data-record-date="${dateKey}" data-cell-x="${cellX}" data-cell-y="${cellY}" data-cell-w="${cellWidth}" data-cell-h="${cellHeight}"` : ''}>
          <rect x="${cellX}" y="${cellY}" width="${cellWidth}" height="${cellHeight}" rx="2" fill="${hexToRgba(RECORD_CARD_COLOR_BY_TYPE[record.type], getRecordFillOpacity(record.marginC))}" stroke="#e6e9ec" stroke-width="0.7"/>
        </g>`
      }

      const first = visualRecords[0]!
      const second = visualRecords[1]!
      return `
      <g ${input.interactive ? `class="records-grid-cell--record" data-record-date="${dateKey}" data-cell-x="${cellX}" data-cell-y="${cellY}" data-cell-w="${cellWidth}" data-cell-h="${cellHeight}"` : ''}>
        <rect x="${cellX}" y="${cellY}" width="${cellWidth}" height="${cellHeight}" rx="2" fill="#f5f7f9" stroke="#e6e9ec" stroke-width="0.7"/>
        <path d="M ${cellX} ${cellY} L ${cellX + cellWidth} ${cellY} L ${cellX} ${cellY + cellHeight} Z" fill="${hexToRgba(RECORD_CARD_COLOR_BY_TYPE[first.type], getRecordFillOpacity(first.marginC))}"/>
        <path d="M ${cellX + cellWidth} ${cellY} L ${cellX + cellWidth} ${cellY + cellHeight} L ${cellX} ${cellY + cellHeight} Z" fill="${hexToRgba(RECORD_CARD_COLOR_BY_TYPE[second.type], getRecordFillOpacity(second.marginC))}"/>
      </g>`
    }).join('')
    return `<g>${monthLabelMarkup}${dayCells}</g>`
  }).join('')

  const dayNumberMarkup = [1, 5, 10, 15, 20, 25, 30]
    .map((day) => {
      const x = gridX + (day - 1) * (cellWidth + cellGap) + cellWidth / 2
      return `<text x="${x}" y="${dayHeaderY}" text-anchor="middle" font-size="11" fill="#5b6773">${day}</text>`
    })
    .join('')

  const legendTypes = presentTypes
  const legendY = gridTop + rowHeight * 12 + 20
  let legendCursorX = contentX
  const legendMarkup = legendTypes
    .map((type) => {
      const label = getRecordTypeLabel(type)
      const chunk = `<rect x="${legendCursorX}" y="${legendY - 9}" width="12" height="12" rx="3" fill="${RECORD_CARD_COLOR_BY_TYPE[type]}"/><text x="${legendCursorX + 18}" y="${legendY + 1}" font-size="11.5" fill="#1c2530">${escapeXml(label)}</text>`
      legendCursorX += 34 + label.length * 6.5
      return chunk
    })
    .join('')
  const legendNoteY = legendY + 20

  const topRecords = [...input.rows]
    .sort((left, right) => right.marginC - left.marginC || compareClimateDates(left.date, right.date))
    .slice(0, 5)
  const listHeadingY = legendNoteY + 28
  const listStartY = listHeadingY + 24
  const dateX = contentX
  const typeX = contentX + 118
  const valueX = contentX + 350
  const previousX = contentX + 452
  const marginX = contentX + contentWidth
  const listRowsMarkup =
    topRecords.length === 0
      ? `<text x="${contentX}" y="${listStartY}" font-size="12.5" fill="#5b6773">No records yet.</text>`
      : topRecords
          .map((row, index) => {
            const y = listStartY + index * 34
            const years = row.previousRecordYears.join(', ')
            const previousText = years.length > 0
              ? `was ${row.previousRecordC.toFixed(1)}°C (${years})`
              : `was ${row.previousRecordC.toFixed(1)}°C`
            return `
            <g>
              <text x="${dateX}" y="${y}" font-size="12.5" fill="#1c2530">${escapeXml(formatEuropeLondonDisplay(row.date, { day: '2-digit', month: 'short' }))}</text>
              <rect x="${typeX}" y="${y - 9}" width="10" height="10" rx="5" fill="${RECORD_CARD_COLOR_BY_TYPE[row.type]}"/>
              <text x="${typeX + 16}" y="${y}" font-size="12" fill="#1c2530">${escapeXml(getRecordTypeLabel(row.type))}</text>
              <text x="${valueX}" y="${y}" font-size="12.5" fill="#1c2530">${row.currentValueC.toFixed(1)}°C</text>
              <text x="${previousX}" y="${y}" font-size="12" fill="#5b6773">${escapeXml(previousText)}</text>
              <text x="${marginX}" y="${y}" text-anchor="end" font-size="12.5" font-weight="700" fill="#1c2530">+${row.marginC.toFixed(1)}°C</text>
              ${index < topRecords.length - 1 ? `<line x1="${contentX}" x2="${contentX + contentWidth}" y1="${y + 12}" y2="${y + 12}" stroke="#eef1f3"/>` : ''}
            </g>`
          })
          .join('')

  const listBottomY = topRecords.length === 0 ? listStartY : listStartY + (topRecords.length - 1) * 34 + 16
  const contentBottomY = listBottomY
  const cardHeight = contentBottomY - input.y + EXPORT_CARD_PADDING_Y
  const tooltipMarkup =
    input.interactive && groupedRecords.size > 0
      ? buildRecordsTooltipSvg({
          year: input.year,
          groupedRecords,
          cardX: input.x,
          cardY: input.y,
          cardWidth,
          cardHeight,
        })
      : ''

  return {
    markup: `
  <rect x="${input.x}" y="${input.y}" width="${cardWidth}" height="${cardHeight}" rx="${EXPORT_CARD_RADIUS}" fill="${EXPORT_SURFACE}" stroke="${EXPORT_SURFACE_BORDER}"/>
  <text x="${contentX}" y="${titleY}" font-size="16" font-weight="700" fill="${ANNUAL_OVERVIEW_COLORS.ink}">${escapeXml(`New daily records set in ${input.year}`)}</text>
  ${buildMultilineTextSvg(input.summaryLines, {
    x: contentX,
    y: summaryY,
    fontSize: 13,
    lineHeight: 18,
    fill: ANNUAL_OVERVIEW_COLORS.sub,
  })}
  ${tilesMarkup}
  ${dayNumberMarkup}
  <g id="records-grid-${input.year}">
    ${cellsMarkup}
  </g>
  ${legendMarkup}
  <text x="${contentX}" y="${legendNoteY}" font-size="11.5" fill="#5b6773">Stronger colour = bigger margin over previous record</text>
  <text x="${contentX}" y="${listHeadingY}" font-size="14" font-weight="700" fill="#1c2530">Biggest margins</text>
  ${listRowsMarkup}
  ${tooltipMarkup}
  `,
    height: cardHeight,
  }
}

function buildRecordsSummaryText(count: number, latestObservedDate: string | null): string {
  const throughText =
    latestObservedDate == null
      ? ''
      : ` through ${formatEuropeLondonDisplay(latestObservedDate, { day: 'numeric', month: 'short', year: 'numeric' })}`
  return `${count} new all-time daily records for Wakefield${throughText}`
}

function groupRecordsByDate(
  rows: readonly AnnualOverviewRecordEvent[],
): ReadonlyMap<string, readonly AnnualOverviewRecordEvent[]> {
  const map = new Map<string, AnnualOverviewRecordEvent[]>()
  for (const row of rows) {
    const { month, day } = parseIsoClimateDate(row.date)
    const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const existing = map.get(key) ?? []
    existing.push(row)
    map.set(key, existing)
  }

  return new Map(
    [...map.entries()].map(([key, value]) => [
      key,
      [...value].sort(
        (left, right) =>
          RECORD_CARD_TYPE_ORDER.indexOf(left.type) - RECORD_CARD_TYPE_ORDER.indexOf(right.type),
      ),
    ]),
  )
}

function getRecordTypeCounts(
  rows: readonly AnnualOverviewRecordEvent[],
): ReadonlyMap<AnnualOverviewRecordType, number> {
  const counts = new Map<AnnualOverviewRecordType, number>()
  for (const row of rows) {
    counts.set(row.type, (counts.get(row.type) ?? 0) + 1)
  }
  return counts
}

function getRecordTypeLabel(type: AnnualOverviewRecordType): string {
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

function getRecordTooltipTypeLabel(type: AnnualOverviewRecordType): string {
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

function getRecordFillOpacity(marginC: number): number {
  return 0.45 + 0.55 * Math.min(Math.max(marginC, 0) / 4, 1)
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

function buildRecordsTooltipSvg(input: {
  readonly year: number
  readonly groupedRecords: ReadonlyMap<string, readonly AnnualOverviewRecordEvent[]>
  readonly cardX: number
  readonly cardY: number
  readonly cardWidth: number
  readonly cardHeight: number
}): string {
  const gridId = `records-grid-${input.year}`
  const tooltipId = `records-tooltip-${input.year}`
  const activeId = `records-active-${input.year}`
  const tooltipData = Object.fromEntries(
    [...input.groupedRecords.entries()].map(([dateKey, rows]) => [
      dateKey,
      {
        date: formatEuropeLondonDisplay(rows[0]?.date ?? `${input.year}-01-01`, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        rows: rows.map((row) => ({
          title: `${getRecordTooltipTypeLabel(row.type)}: ${row.currentValueC.toFixed(1)}°C`,
          previous: formatPreviousRecordSummary(row),
          margin: `Beaten by ${row.marginC.toFixed(1)}°C`,
          color: RECORD_CARD_COLOR_BY_TYPE[row.type],
        })),
      },
    ]),
  )
  const tooltipDataJson = JSON.stringify(tooltipData).replaceAll('<', '\\u003c')

  return `
  <rect id="${activeId}" visibility="hidden" fill="none" stroke="#1c2530" stroke-width="2" rx="2"/>
  <g id="${tooltipId}" visibility="hidden" pointer-events="none"></g>
  <script><![CDATA[
    (() => {
      const svg = document.currentScript?.ownerSVGElement;
      if (!svg) return;
      const tooltip = svg.getElementById('${tooltipId}');
      const activeCell = svg.getElementById('${activeId}');
      const grid = svg.getElementById('${gridId}');
      const cells = svg.querySelectorAll('.records-grid-cell--record');
      if (!(tooltip instanceof SVGGElement) || !(activeCell instanceof SVGRectElement) || !(grid instanceof SVGGElement) || cells.length === 0) return;
      const tooltipData = ${tooltipDataJson};
      const ns = 'http://www.w3.org/2000/svg';
      const tooltipWidth = 250;
      const hide = () => {
        tooltip.setAttribute('visibility', 'hidden');
        activeCell.setAttribute('visibility', 'hidden');
      };
      const clear = () => {
        while (tooltip.firstChild) tooltip.removeChild(tooltip.firstChild);
      };
      /** @typedef {{ size?: number, fill?: string, weight?: number }} TextOptions */
      /** @param {number} x @param {number} y @param {string} value @param {TextOptions} options */
      const addText = (x, y, value, options = {}) => {
        const node = document.createElementNS(ns, 'text');
        node.setAttribute('x', String(x));
        node.setAttribute('y', String(y));
        node.setAttribute('font-size', String(options.size ?? 12));
        node.setAttribute('fill', options.fill ?? '#1c2530');
        if (options.weight) node.setAttribute('font-weight', String(options.weight));
        node.textContent = value;
        tooltip.appendChild(node);
      };
      /** @param {Element} cell */
      const show = (cell) => {
        const key = cell.getAttribute('data-record-date');
        if (!key || !Object.prototype.hasOwnProperty.call(tooltipData, key)) return;
        const datum = tooltipData[key];
        const rows = datum.rows ?? [];
        clear();
        const headingHeight = 28;
        const rowHeight = 52;
        const tipHeight = headingHeight + rows.length * rowHeight + 12;
        const tipRect = document.createElementNS(ns, 'rect');
        tipRect.setAttribute('x', '0');
        tipRect.setAttribute('y', '0');
        tipRect.setAttribute('width', String(tooltipWidth));
        tipRect.setAttribute('height', String(tipHeight));
        tipRect.setAttribute('rx', '8');
        tipRect.setAttribute('fill', '#ffffff');
        tipRect.setAttribute('stroke', '#d5dbe1');
        tooltip.appendChild(tipRect);
        addText(12, 20, datum.date, { size: 13, weight: 700 });
        rows.forEach((row, index) => {
          const blockTop = headingHeight + index * rowHeight;
          if (index > 0) {
            const divider = document.createElementNS(ns, 'line');
            divider.setAttribute('x1', '12');
            divider.setAttribute('x2', String(tooltipWidth - 12));
            divider.setAttribute('y1', String(blockTop));
            divider.setAttribute('y2', String(blockTop));
            divider.setAttribute('stroke', '#e6e9ec');
            tooltip.appendChild(divider);
          }
          const swatch = document.createElementNS(ns, 'rect');
          swatch.setAttribute('x', '12');
          swatch.setAttribute('y', String(blockTop + 8));
          swatch.setAttribute('width', '10');
          swatch.setAttribute('height', '10');
          swatch.setAttribute('rx', '5');
          swatch.setAttribute('fill', row.color);
          tooltip.appendChild(swatch);
          addText(28, blockTop + 18, row.title, { size: 12.5, weight: 700 });
          addText(12, blockTop + 34, row.previous, { size: 12, fill: '#5b6773' });
          addText(12, blockTop + 48, row.margin, { size: 12, fill: '#5b6773' });
        });

        const x = Number(cell.getAttribute('data-cell-x') ?? 0);
        const y = Number(cell.getAttribute('data-cell-y') ?? 0);
        const width = Number(cell.getAttribute('data-cell-w') ?? 0);
        const height = Number(cell.getAttribute('data-cell-h') ?? 0);
        let tooltipX = x + width / 2 - tooltipWidth / 2;
        const minX = ${input.cardX + EXPORT_CARD_PADDING_X};
        const maxX = ${input.cardX + input.cardWidth - EXPORT_CARD_PADDING_X} - tooltipWidth;
        tooltipX = Math.max(minX, Math.min(tooltipX, maxX));
        let tooltipY = y + height + 8;
        const maxBottom = ${input.cardY + input.cardHeight - EXPORT_CARD_PADDING_Y};
        if (tooltipY + tipHeight > maxBottom) tooltipY = y - tipHeight - 8;

        tooltip.setAttribute('transform', 'translate(' + tooltipX + ' ' + tooltipY + ')');
        tooltip.setAttribute('visibility', 'visible');
        activeCell.setAttribute('x', String(x - 1));
        activeCell.setAttribute('y', String(y - 1));
        activeCell.setAttribute('width', String(width + 2));
        activeCell.setAttribute('height', String(height + 2));
        activeCell.setAttribute('visibility', 'visible');
      };

      cells.forEach((cell) => {
        cell.addEventListener('pointerenter', () => show(cell));
        cell.addEventListener('click', (event) => {
          event.stopPropagation();
          show(cell);
        });
      });
      grid.addEventListener('pointerleave', hide);
      svg.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        if (event.target.closest('.records-grid-cell--record') == null) hide();
      });
    })();
  ]]></script>`
}

function formatPreviousRecordSummary(row: AnnualOverviewRecordEvent): string {
  const years = row.previousRecordYears.join(', ')
  return years.length > 0
    ? `Previous record ${row.previousRecordC.toFixed(1)}°C (${years})`
    : `Previous record ${row.previousRecordC.toFixed(1)}°C`
}

function buildMultilineTextSvg(
  lines: readonly string[],
  input: {
    readonly x: number
    readonly y: number
    readonly fontSize: number
    readonly lineHeight: number
    readonly fill: string
  },
): string {
  const safeLines = lines.length > 0 ? lines : ['']
  return `<text x="${input.x}" y="${input.y}" font-size="${input.fontSize}" fill="${input.fill}">${safeLines
    .map((line, index) =>
      `<tspan x="${input.x}" dy="${index === 0 ? 0 : input.lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join('')}</text>`
}

function wrapText(text: string, fontSize: number, maxWidth: number): readonly string[] {
  const maxChars = Math.max(18, Math.floor(maxWidth / (fontSize * 0.58)))
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return ['']
  }

  const lines: string[] = []
  let currentLine = words[0] ?? ''

  for (const word of words.slice(1)) {
    const nextLine = `${currentLine} ${word}`
    if (nextLine.length <= maxChars) {
      currentLine = nextLine
      continue
    }
    lines.push(currentLine)
    currentLine = word
  }

  lines.push(currentLine)
  return lines
}

function estimateLegendItemWidth(label: string): number {
  return 30 + label.length * 7.1 + 28
}

function parseSvgSize(svgMarkup: string): { readonly width: number; readonly height: number } {
  const widthMatch = svgMarkup.match(/<svg[^>]*width="(\d+(?:\.\d+)?)"/)
  const heightMatch = svgMarkup.match(/<svg[^>]*height="(\d+(?:\.\d+)?)"/)
  const viewBoxMatch = svgMarkup.match(/<svg[^>]*viewBox="([^"]+)"/)
  const viewBoxParts =
    viewBoxMatch?.[1]
      .trim()
      .split(/\s+/)
      .map((value) => Number(value)) ?? []
  const fallbackWidth =
    Number.isFinite(viewBoxParts[2]) && (viewBoxParts[2] ?? 0) > 0
      ? (viewBoxParts[2] as number)
      : ANNUAL_OVERVIEW_EXPORT_WIDTH
  const fallbackHeight =
    Number.isFinite(viewBoxParts[3]) && (viewBoxParts[3] ?? 0) > 0
      ? (viewBoxParts[3] as number)
      : ANNUAL_OVERVIEW_CHART_HEIGHT
  const width = Number(widthMatch?.[1] ?? fallbackWidth)
  const height = Number(heightMatch?.[1] ?? fallbackHeight)
  return {
    width: Number.isFinite(width) && width > 0 ? width : ANNUAL_OVERVIEW_EXPORT_WIDTH,
    height: Number.isFinite(height) && height > 0 ? height : ANNUAL_OVERVIEW_CHART_HEIGHT,
  }
}

function normalizeExportFootnote(footnote: string): string {
  let trailing = footnote.trim()
  const oldLeadPatterns = [
    /^Shaded band shows[^.]*, with record lines and new-record markers kept inside the export card\.\s*/i,
    /^Shaded band shows[^.]*\.\s*/i,
    /^Dashed lines mark[^.]*\.\s*/i,
  ]
  for (const pattern of oldLeadPatterns) {
    trailing = trailing.replace(pattern, '').trim()
  }
  return trailing.length > 0 ? `${EXPORT_FOOTNOTE_LEAD} ${trailing}` : EXPORT_FOOTNOTE_LEAD
}

async function loadSvgImage(svgMarkup: string): Promise<HTMLImageElement> {
  const svgUrl = await svgMarkupToDataUrl(svgMarkup)
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to render annual overview export'))
    image.src = svgUrl
  })
}

async function svgMarkupToDataUrl(svgMarkup: string): Promise<string> {
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Unable to prepare annual overview export'))
        return
      }
      resolve(reader.result)
    }
    reader.onerror = () => reject(new Error('Unable to prepare annual overview export'))
    reader.readAsDataURL(blob)
  })
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob == null) {
        reject(new Error('Unable to encode PNG export'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}

function triggerDownload(url: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
