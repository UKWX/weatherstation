function triggerDownload(url: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

import { chartTheme } from '@/components/charts/chartTheme'

const EXPORT_WIDTH = chartTheme.exportWidth
const PAGE_PADDING = 32
const CARD_PADDING = 24
const CHART_WIDTH = 1400
const FONT = chartTheme.fontFamily

function inlineComputedStyles(source: Element, target: Element): void {
  const computed = window.getComputedStyle(source)
  const style = Array.from(computed)
    .map((property) => `${property}: ${computed.getPropertyValue(property)};`)
    .join(' ')
  target.setAttribute('style', `${source.getAttribute('style') ?? ''}; ${style}`)

  const sourceChildren = Array.from(source.children)
  const targetChildren = Array.from(target.children)
  sourceChildren.forEach((child, index) => {
    const targetChild = targetChildren[index]
    if (targetChild != null) {
      inlineComputedStyles(child, targetChild)
    }
  })
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]!)
}

function textLines(text: string, fontSize: number, width: number): string[] {
  const maxChars = Math.max(1, Math.floor(width / (fontSize * 0.55)))
  const lines: string[] = []
  for (const paragraph of text.split(/\n/)) {
    let line = ''
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && `${line} ${word}`.length > maxChars) {
        lines.push(line)
        line = ''
      }
      // Split unusually long unbroken strings rather than letting them overflow the card.
      while (word.length > maxChars && !line) {
        lines.push(word.slice(0, maxChars))
        word = word.slice(maxChars)
      }
      line = line ? `${line} ${word}` : word
    }
    lines.push(line)
  }
  return lines
}

function linesMarkup(lines: readonly string[], x: number, y: number, size: number, step: number, color: string, weight = 400): string {
  return lines.map((line, index) => `<text x="${x}" y="${y + index * step}" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeXml(line)}</text>`).join('')
}

function serializeCardSvg(chart: { readonly markup: string; readonly width: number; readonly height: number }, card: HTMLElement): { readonly markup: string; readonly width: number; readonly height: number } {
  const contentX = PAGE_PADDING + CARD_PADDING
  const contentWidth = EXPORT_WIDTH - 2 * contentX
  const title = card.querySelector('.chart-kit-card__title')?.textContent?.trim() ?? ''
  const subtitle = card.querySelector('.chart-kit-card__subtitle')?.textContent?.trim() ?? ''
  const footnote = card.querySelector('.chart-kit-card__footnote')?.textContent?.trim() ?? ''
  const subtitleLines = subtitle ? textLines(subtitle, 14, contentWidth) : []
  const footnoteLines = footnote ? textLines(footnote, 11.5, contentWidth) : []
  let y = PAGE_PADDING + 42
  const titleLines = textLines(title, 24, contentWidth)
  const titleMarkup = linesMarkup(titleLines, contentX, y, 24, 30, '#1c2530', 700)
  y += titleLines.length * 30
  const subtitleMarkup = linesMarkup(subtitleLines, contentX, y, 14, 19, '#5b6773')
  y += subtitleLines.length * 19 + 14

  let legendMarkup = ''
  const legendItems = card.querySelectorAll('.chart-kit-legend__item')
  let legendX = contentX
  for (const item of legendItems) {
    const label = item.lastElementChild?.textContent?.trim() ?? ''
    const itemWidth = 24 + label.length * 7 + 18
    if (legendX > contentX && legendX + itemWidth > contentX + contentWidth) {
      legendX = contentX
      y += 22
    }
    const swatch = item.firstElementChild !== item.lastElementChild ? item.firstElementChild : null
    if (swatch != null) {
      const style = window.getComputedStyle(swatch)
      if (swatch.classList.contains('chart-kit-swatch')) {
        const color = style.borderColor || '#1c2530'
        const outline = style.borderStyle === 'dashed' || style.backgroundColor === 'transparent' || style.backgroundColor === 'rgba(0, 0, 0, 0)'
        legendMarkup += outline
          ? `<line x1="${legendX}" x2="${legendX + 18}" y1="${y - 4}" y2="${y - 4}" stroke="${escapeXml(color)}" stroke-width="3"${style.borderStyle === 'dashed' ? ' stroke-dasharray="5 3"' : ''}/>`
          : `<rect x="${legendX}" y="${y - 11}" width="18" height="10" rx="5" fill="${escapeXml(style.backgroundColor || color)}" stroke="${escapeXml(color)}" stroke-width="2"/>`
      } else {
        legendMarkup += `<text x="${legendX}" y="${y}" font-size="15" fill="${escapeXml(style.color || '#1c2530')}">${escapeXml(swatch.textContent ?? '')}</text>`
      }
    }
    legendMarkup += `<text x="${legendX + 24}" y="${y}" font-size="12.5" fill="#5b6773">${escapeXml(label)}</text>`
    legendX += itemWidth
  }
  if (legendItems.length) y += 22

  const chartHeight = Math.round(chart.height * CHART_WIDTH / chart.width)
  const chartY = y + 8
  const footnoteY = chartY + chartHeight + 28
  const cardHeight = footnoteY + footnoteLines.length * 16 - PAGE_PADDING + CARD_PADDING
  const height = cardHeight + 2 * PAGE_PADDING
  const chartElement = new DOMParser().parseFromString(chart.markup, 'image/svg+xml').documentElement
  if (!chartElement.hasAttribute('viewBox')) {
    chartElement.setAttribute('viewBox', `0 0 ${chart.width} ${chart.height}`)
  }
  chartElement.setAttribute('x', String((EXPORT_WIDTH - CHART_WIDTH) / 2))
  chartElement.setAttribute('y', String(chartY))
  chartElement.setAttribute('width', String(CHART_WIDTH))
  chartElement.setAttribute('height', String(chartHeight))
  const nestedChart = new XMLSerializer().serializeToString(chartElement)

  return {
    width: EXPORT_WIDTH,
    height,
    markup: `<svg xmlns="http://www.w3.org/2000/svg" width="${EXPORT_WIDTH}" height="${height}" viewBox="0 0 ${EXPORT_WIDTH} ${height}" style="font-family: ${FONT};" role="img" aria-label="${escapeXml(title)}"><rect width="${EXPORT_WIDTH}" height="${height}" fill="#f5f7f9"/><rect x="${PAGE_PADDING}" y="${PAGE_PADDING}" width="${EXPORT_WIDTH - 2 * PAGE_PADDING}" height="${cardHeight}" rx="16" fill="#ffffff" stroke="#e6e9ec"/>${titleMarkup}${subtitleMarkup}${legendMarkup}${nestedChart}${linesMarkup(footnoteLines, contentX, footnoteY, 11.5, 16, '#5b6773')}</svg>`,
  }
}

export function serializeChartSvg(svg: SVGSVGElement, card?: HTMLElement): { readonly markup: string; readonly width: number; readonly height: number } {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  inlineComputedStyles(svg, clone)
  clone.querySelectorAll('[data-export-ignore="true"]').forEach((node) => node.remove())
  const viewBox = clone.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
  const viewBoxWidth = viewBox?.[2] || Number(clone.getAttribute('width')) || svg.clientWidth || 960
  const viewBoxHeight = viewBox?.[3] || Number(clone.getAttribute('height')) || svg.clientHeight || 420
  clone.setAttribute('width', String(viewBoxWidth))
  clone.setAttribute('height', String(viewBoxHeight))
  const chart = {
    markup: new XMLSerializer().serializeToString(clone),
    width: viewBoxWidth,
    height: viewBoxHeight,
  }
  return card == null ? chart : serializeCardSvg(chart, card)
}

export function downloadChartSvg(svg: SVGSVGElement, filename: string, card?: HTMLElement): void {
  const serialized = serializeChartSvg(svg, card)
  const blob = new Blob([serialized.markup], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function downloadChartPng(svg: SVGSVGElement, filename: string, card?: HTMLElement): Promise<void> {
  const serialized = serializeChartSvg(svg, card)
  await downloadSvgMarkupPng(serialized.markup, filename, serialized)
}

/**
 * Render an SVG string using the same white-background, high-resolution export
 * path as the annual overview. This is also useful for charts that are built
 * from SVG markup rather than a live SVG element.
 */
export async function downloadSvgMarkupPng(
  markup: string,
  filename: string,
  knownSize?: { readonly width: number; readonly height: number },
): Promise<void> {
  const size = knownSize ?? parseSvgDimensions(markup)
  const image = await loadSvgImage(markup)
  const scale = 2
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(size.width * scale)
  canvas.height = Math.round(size.height * scale)
  const context = canvas.getContext('2d')
  if (context == null) {
    throw new Error('Canvas context unavailable')
  }

  context.scale(scale, scale)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size.width, size.height)
  context.drawImage(image, 0, 0, size.width, size.height)
  const pngBlob = await canvasToBlob(canvas)
  const url = URL.createObjectURL(pngBlob)
  triggerDownload(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function parseSvgDimensions(markup: string): { readonly width: number; readonly height: number } {
  const viewBox = markup.match(/<svg[^>]*viewBox="([^"]+)"/i)?.[1]
    ?.trim()
    .split(/\s+/)
    .map(Number) ?? []
  const width = Number(markup.match(/<svg[^>]*width="([0-9.]+)"/i)?.[1])
  const height = Number(markup.match(/<svg[^>]*height="([0-9.]+)"/i)?.[1])
  return {
    width: Number.isFinite(width) && width > 0 ? width : (viewBox[2] ?? 960),
    height: Number.isFinite(height) && height > 0 ? height : (viewBox[3] ?? 420),
  }
}

async function loadSvgImage(markup: string): Promise<HTMLImageElement> {
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Unable to render chart for PNG export'))
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob == null) {
        reject(new Error('Unable to encode PNG export'))
      } else {
        resolve(blob)
      }
    }, 'image/png')
  })
}
