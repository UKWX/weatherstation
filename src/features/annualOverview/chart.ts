import { formatEuropeLondonDisplay } from '@/lib/climate'
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

const MARGIN = {
  top: 112,
  right: 34,
  bottom: 82,
  left: 72,
} as const

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
  const title = `${input.year} Daily Temperature Data for Wakefield, United Kingdom`
  const contentWidth = ANNUAL_OVERVIEW_EXPORT_WIDTH - EXPORT_PAGE_PADDING * 2
  const textWidth = contentWidth - EXPORT_CARD_PADDING_X * 2
  const subtitleLines = wrapText(input.subtitle, 14, textWidth)
  const footnoteLines = wrapText(input.footnote, 11.5, textWidth)
  const recordSummaryLines = wrapText(input.recordSummary, 13, textWidth)
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
      y: subtitleY + subtitleLines.length * 18 + 22,
      maxWidth: textWidth,
      showRecordOutlines,
    })
    const chartY = legend.bottom + 18
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
    return `<g><line x1="${x}" x2="${x}" y1="${MARGIN.top - 18}" y2="${ANNUAL_OVERVIEW_CHART_HEIGHT - MARGIN.bottom}" stroke="${ANNUAL_OVERVIEW_COLORS.monthLine}" stroke-width="1"/><text x="${labelX}" y="${MARGIN.top - 28}" text-anchor="middle" font-size="12.5" font-weight="700" fill="${ANNUAL_OVERVIEW_COLORS.ink}">${month.shortLabel.toUpperCase()}</text></g>`
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
    const recordsTitleY = recordsCardY + 36
    const recordsSummaryY = recordsTitleY + 26
    const tableStartY = recordsSummaryY + Math.max(recordSummaryLines.length, 1) * 18 + 22
    const table = buildExportTableSvg({
      rows,
      year: input.year,
      x: chartCardX + EXPORT_CARD_PADDING_X,
      y: tableStartY,
      width: textWidth,
    })
    const recordsCardHeight = table.height + (tableStartY - recordsCardY) + EXPORT_CARD_PADDING_Y
    recordsMarkup = `
  <rect x="${chartCardX}" y="${recordsCardY}" width="${contentWidth}" height="${recordsCardHeight}" rx="${EXPORT_CARD_RADIUS}" fill="${EXPORT_SURFACE}" stroke="${EXPORT_SURFACE_BORDER}"/>
  <text x="${chartCardX + EXPORT_CARD_PADDING_X}" y="${recordsTitleY}" font-size="16" font-weight="700" fill="${ANNUAL_OVERVIEW_COLORS.ink}">${escapeXml(`New daily records set in ${input.year}`)}</text>
  ${buildMultilineTextSvg(recordSummaryLines, {
    x: chartCardX + EXPORT_CARD_PADDING_X,
    y: recordsSummaryY,
    fontSize: 13,
    lineHeight: 18,
    fill: ANNUAL_OVERVIEW_COLORS.sub,
  })}
  ${table.markup}`
    cursorY += recordsCardHeight
  }

  const contentHeight = cursorY + EXPORT_PAGE_PADDING

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${ANNUAL_OVERVIEW_EXPORT_WIDTH}" height="${contentHeight}" viewBox="0 0 ${ANNUAL_OVERVIEW_EXPORT_WIDTH} ${contentHeight}" role="img" aria-label="${escapeXml(`${input.year} Daily Temperature Data for Wakefield, United Kingdom`)}">
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
          marker = `<circle cx="${itemX + 11}" cy="${itemY - 4}" r="6" fill="none" stroke="${ANNUAL_OVERVIEW_COLORS.tagHighMax}" stroke-width="2.4"/>`
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
        return `<circle cx="${xForDay(day.index, dataset.days.length)}" cy="${y}" r="6.5" fill="none" stroke="${getRecordMarkerColor(type)}" stroke-width="2.4"/>`
      }),
    )
    .join('')
}

function buildExportTableSvg(input: {
  readonly rows: readonly AnnualOverviewRecordEvent[]
  readonly year: number
  readonly x: number
  readonly y: number
  readonly width: number
}): { readonly markup: string; readonly height: number } {
  const columnOffsets = [0, 0.104, 0.338, 0.455, 0.579] as const
  const colX = [
    input.x + input.width * columnOffsets[0],
    input.x + input.width * columnOffsets[1],
    input.x + input.width * columnOffsets[2],
    input.x + input.width * columnOffsets[3],
    input.x + input.width * columnOffsets[4],
  ]

  if (input.rows.length === 0) {
    return {
      markup: `<text x="${input.x}" y="${input.y}" font-size="13" fill="${ANNUAL_OVERVIEW_COLORS.sub}">${escapeXml(`No new all-time daily records were set in ${input.year}.`)}</text>`,
      height: 20,
    }
  }

  const startY = input.y
  const dividerX2 = input.x + input.width
  const tagWidth = Math.min(152, Math.max(136, input.width * 0.111))

  const headers = ['Date', 'Record type', 'Selected-year value', 'Previous record', 'Margin']
  const headerRow = headers
    .map((header, index) => `<text x="${colX[index]}" y="${startY}" font-size="11.5" font-weight="600" fill="${ANNUAL_OVERVIEW_COLORS.sub}">${escapeXml(header.toUpperCase())}</text>`)
    .join('')

  const body = input.rows
    .map((row, index) => {
      const y = startY + 28 + index * 24
      const color = getRecordMarkerColor(row.type)
      return `
      <text x="${colX[0]}" y="${y}" font-size="12.5" fill="${ANNUAL_OVERVIEW_COLORS.ink}">${escapeXml(formatEuropeLondonDisplay(row.date, { day: '2-digit', month: 'short', year: 'numeric' }))}</text>
      <rect x="${colX[1]}" y="${y - 12}" width="${tagWidth}" height="18" rx="9" fill="${color}"/>
      <text x="${colX[1] + 10}" y="${y}" font-size="11" font-weight="700" fill="#ffffff">${escapeXml(getExportRecordLabel(row.type))}</text>
      <text x="${colX[2]}" y="${y}" font-size="12.5" fill="${ANNUAL_OVERVIEW_COLORS.ink}">${row.currentValueC.toFixed(1)}°C</text>
      <text x="${colX[3]}" y="${y}" font-size="12.5" fill="${ANNUAL_OVERVIEW_COLORS.ink}">${escapeXml(formatPreviousRecordExportLabel(row))}</text>
      <text x="${colX[4]}" y="${y}" font-size="12.5" fill="${ANNUAL_OVERVIEW_COLORS.ink}">+${row.marginC.toFixed(1)}°C</text>
      <line x1="${input.x}" x2="${dividerX2}" y1="${y + 8}" y2="${y + 8}" stroke="#eef1f3"/>
      `
    })
    .join('')

  return {
    markup: headerRow + body,
    height: 36 + input.rows.length * 24,
  }
}

function getExportRecordLabel(type: AnnualOverviewRecordType): string {
  switch (type) {
    case 'record-high-max':
      return 'Record high maximum'
    case 'record-low-max':
      return 'Record low maximum'
    case 'record-high-min':
      return 'Record high minimum'
    case 'record-low-min':
      return 'Record low minimum'
  }
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
  const width = Number(widthMatch?.[1] ?? ANNUAL_OVERVIEW_EXPORT_WIDTH)
  const height = Number(heightMatch?.[1] ?? ANNUAL_OVERVIEW_CHART_HEIGHT)
  return {
    width: Number.isFinite(width) && width > 0 ? width : ANNUAL_OVERVIEW_EXPORT_WIDTH,
    height: Number.isFinite(height) && height > 0 ? height : ANNUAL_OVERVIEW_CHART_HEIGHT,
  }

  function formatPreviousRecordExportLabel(row: AnnualOverviewRecordEvent): string {
    const years = row.previousRecordYears.join(', ')
    return years.length > 0 ? `${row.previousRecordC.toFixed(1)}°C (${years})` : `${row.previousRecordC.toFixed(1)}°C`
  }
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
