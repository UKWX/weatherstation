import { formatEuropeLondonDisplay } from '@/lib/climate'
import type {
  AnnualOverviewDataset,
  AnnualOverviewDay,
  AnnualOverviewRecordEvent,
  AnnualOverviewRecordType,
} from '@/features/annualOverview/model'

export const ANNUAL_OVERVIEW_CHART_WIDTH = 1400
export const ANNUAL_OVERVIEW_CHART_HEIGHT = 560
export const ANNUAL_OVERVIEW_EXPORT_WIDTH = 1400

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
}): string {
  const geometry = createAnnualOverviewChartGeometry(input.dataset)
  const monthBoundaries = getMonthBoundaries(input.dataset)
  const bandPath = buildNormalBandPath(input.dataset, geometry.yMin, geometry.yMax)
  const maxPath = buildLinePath(input.dataset, (day) => day.actualMaxC, geometry.yMin, geometry.yMax)
  const minPath = buildLinePath(input.dataset, (day) => day.actualMinC, geometry.yMin, geometry.yMax)
  const rollingPath = buildLinePath(input.dataset, (day) => day.rollingMeanC, geometry.yMin, geometry.yMax)
  const recordHighMaxPath = buildLinePath(input.dataset, (day) => day.recordHighMaxC, geometry.yMin, geometry.yMax)
  const recordLowMinPath = buildLinePath(input.dataset, (day) => day.recordLowMinC, geometry.yMin, geometry.yMax)
  const contentHeight = ANNUAL_OVERVIEW_CHART_HEIGHT + 220 + input.dataset.recordEvents.length * 24
  const rows = input.dataset.recordEvents.length > 0 ? input.dataset.recordEvents : []

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${ANNUAL_OVERVIEW_EXPORT_WIDTH}" height="${contentHeight}" viewBox="0 0 ${ANNUAL_OVERVIEW_EXPORT_WIDTH} ${contentHeight}" role="img" aria-label="${escapeXml(`${input.year} Daily Temperature Data for Wakefield, United Kingdom`)}">
  <defs>
    <linearGradient id="annual-normal-band" x1="0" y1="${MARGIN.top}" x2="0" y2="${ANNUAL_OVERVIEW_CHART_HEIGHT - MARGIN.bottom}" gradientUnits="userSpaceOnUse">
      ${NORMAL_GRADIENT_STOPS.map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.color}"/>`).join('')}
    </linearGradient>
  </defs>
  <rect width="${ANNUAL_OVERVIEW_EXPORT_WIDTH}" height="${contentHeight}" fill="#ffffff"/>
  <text x="48" y="40" font-size="24" font-weight="700" fill="${ANNUAL_OVERVIEW_COLORS.ink}">${escapeXml(`${input.year} Daily Temperature Data for Wakefield, United Kingdom`)}</text>
  <text x="48" y="68" font-size="14" fill="${ANNUAL_OVERVIEW_COLORS.sub}">${escapeXml(input.subtitle)}</text>
  ${buildLegendSvg()}
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
  ${buildMarkerSvg(input.dataset, geometry.yMin, geometry.yMax)}
  <rect x="${MARGIN.left}" y="${MARGIN.top}" width="${geometry.plotWidth}" height="${geometry.plotHeight}" fill="none" stroke="#c7ced4" stroke-width="1"/>
  ${buildBottomAxisSvg(input.dataset)}
  <text x="28" y="${MARGIN.top + geometry.plotHeight / 2}" transform="rotate(-90 28 ${MARGIN.top + geometry.plotHeight / 2})" font-size="12" fill="${ANNUAL_OVERVIEW_COLORS.sub}">Temperature (°C)</text>
  <text x="48" y="${ANNUAL_OVERVIEW_CHART_HEIGHT + 26}" font-size="11.5" fill="${ANNUAL_OVERVIEW_COLORS.sub}">${escapeXml(input.footnote)}</text>
  <text x="48" y="${ANNUAL_OVERVIEW_CHART_HEIGHT + 72}" font-size="16" font-weight="700" fill="${ANNUAL_OVERVIEW_COLORS.ink}">${escapeXml(`New daily records set in ${input.year}`)}</text>
  <text x="48" y="${ANNUAL_OVERVIEW_CHART_HEIGHT + 96}" font-size="13" fill="${ANNUAL_OVERVIEW_COLORS.sub}">${escapeXml(input.recordSummary)}</text>
  ${buildExportTableSvg(rows)}
</svg>`
}

export async function downloadAnnualOverviewPng(svgMarkup: string, filename: string): Promise<void> {
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  await new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = ANNUAL_OVERVIEW_EXPORT_WIDTH * 2
      canvas.height = Math.max(1, image.height) * 2
      const context = canvas.getContext('2d')
      if (context == null) {
        URL.revokeObjectURL(url)
        reject(new Error('Canvas context unavailable'))
        return
      }

      context.scale(2, 2)
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, ANNUAL_OVERVIEW_EXPORT_WIDTH, image.height)
      context.drawImage(image, 0, 0)
      const anchor = document.createElement('a')
      anchor.href = canvas.toDataURL('image/png')
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)
      resolve()
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Unable to render annual overview export'))
    }
    image.src = url
  })
}

export function downloadAnnualOverviewSvg(svgMarkup: string, filename: string): void {
  const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function buildLegendSvg(): string {
  const items = [
    'Normal range (dynamic mean)',
    '7-day rolling mean temperature',
    'Max Temp (°C)',
    'Min Temp (°C)',
    'Absolute max on record',
    'Absolute min on record',
    'New record set',
  ]

  let x = 52
  return items
    .map((label, index) => {
      let marker = ''
      if (index === 0) {
        marker = `<rect x="${x}" y="83" width="22" height="10" rx="2" fill="url(#annual-normal-band)" opacity="0.8"/>`
      } else if (index === 1) {
        marker = `<line x1="${x}" y1="88" x2="${x + 22}" y2="88" stroke="${ANNUAL_OVERVIEW_COLORS.rollingMean}" stroke-width="4" stroke-linecap="round"/>`
      } else if (index === 2) {
        marker = `<line x1="${x}" y1="88" x2="${x + 22}" y2="88" stroke="${ANNUAL_OVERVIEW_COLORS.actualMax}" stroke-width="2.6"/>`
      } else if (index === 3) {
        marker = `<line x1="${x}" y1="88" x2="${x + 22}" y2="88" stroke="${ANNUAL_OVERVIEW_COLORS.actualMin}" stroke-width="2.6"/>`
      } else if (index === 4) {
        marker = `<line x1="${x}" y1="88" x2="${x + 22}" y2="88" stroke="${ANNUAL_OVERVIEW_COLORS.recordHighMax}" stroke-width="1.8" stroke-dasharray="6 4"/>`
      } else if (index === 5) {
        marker = `<line x1="${x}" y1="88" x2="${x + 22}" y2="88" stroke="${ANNUAL_OVERVIEW_COLORS.recordLowMin}" stroke-width="1.8" stroke-dasharray="6 4"/>`
      } else {
        marker = `<circle cx="${x + 11}" cy="88" r="6" fill="#ffffff" stroke="${ANNUAL_OVERVIEW_COLORS.tagHighMax}" stroke-width="2.4"/>`
      }
      const text = `<text x="${x + 30}" y="92" font-size="12.5" fill="${ANNUAL_OVERVIEW_COLORS.ink}">${escapeXml(label)}</text>`
      const chunk = `${marker}${text}`
      x += label.length * 6.2 + 60
      return chunk
    })
    .join('')
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
        return `<circle cx="${xForDay(day.index, dataset.days.length)}" cy="${y}" r="6.5" fill="#ffffff" stroke="${getRecordMarkerColor(type)}" stroke-width="2.4"/>`
      }),
    )
    .join('')
}

function buildExportTableSvg(rows: readonly AnnualOverviewRecordEvent[]): string {
  if (rows.length === 0) {
    return `<text x="48" y="${ANNUAL_OVERVIEW_CHART_HEIGHT + 126}" font-size="13" fill="${ANNUAL_OVERVIEW_COLORS.sub}">No new all-time daily records were set in the selected year.</text>`
  }

  const startY = ANNUAL_OVERVIEW_CHART_HEIGHT + 132
  const colX = [48, 190, 510, 670, 840]
  const headers = ['Date', 'Record type', 'Selected-year value', 'Previous record', 'Margin']
  const headerRow = headers
    .map((header, index) => `<text x="${colX[index]}" y="${startY}" font-size="11.5" font-weight="600" fill="${ANNUAL_OVERVIEW_COLORS.sub}">${escapeXml(header.toUpperCase())}</text>`)
    .join('')

  const body = rows
    .map((row, index) => {
      const y = startY + 28 + index * 24
      const color = getRecordMarkerColor(row.type)
      return `
      <text x="${colX[0]}" y="${y}" font-size="12.5" fill="${ANNUAL_OVERVIEW_COLORS.ink}">${escapeXml(formatEuropeLondonDisplay(row.date, { day: '2-digit', month: 'short', year: 'numeric' }))}</text>
      <rect x="${colX[1]}" y="${y - 12}" width="152" height="18" rx="9" fill="${color}"/>
      <text x="${colX[1] + 10}" y="${y}" font-size="11" font-weight="700" fill="#ffffff">${escapeXml(getExportRecordLabel(row.type))}</text>
      <text x="${colX[2]}" y="${y}" font-size="12.5" fill="${ANNUAL_OVERVIEW_COLORS.ink}">${row.currentValueC.toFixed(1)}°C</text>
      <text x="${colX[3]}" y="${y}" font-size="12.5" fill="${ANNUAL_OVERVIEW_COLORS.ink}">${row.previousRecordC.toFixed(1)}°C</text>
      <text x="${colX[4]}" y="${y}" font-size="12.5" fill="${ANNUAL_OVERVIEW_COLORS.ink}">+${row.marginC.toFixed(1)}°C</text>
      <line x1="48" x2="${ANNUAL_OVERVIEW_EXPORT_WIDTH - 48}" y1="${y + 8}" y2="${y + 8}" stroke="#eef1f3"/>
      `
    })
    .join('')

  return headerRow + body
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

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
