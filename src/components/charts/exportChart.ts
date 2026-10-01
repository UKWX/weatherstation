function triggerDownload(url: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

function inlineComputedStyles(source: Element, target: Element): void {
  const computed = window.getComputedStyle(source)
  const style = Array.from(computed)
    .map((property) => `${property}: ${computed.getPropertyValue(property)};`)
    .join(' ')
  target.setAttribute('style', style)

  const sourceChildren = Array.from(source.children)
  const targetChildren = Array.from(target.children)
  sourceChildren.forEach((child, index) => {
    const targetChild = targetChildren[index]
    if (targetChild != null) {
      inlineComputedStyles(child, targetChild)
    }
  })
}

export function serializeChartSvg(svg: SVGSVGElement): { readonly markup: string; readonly width: number; readonly height: number } {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  inlineComputedStyles(svg, clone)
  clone.querySelectorAll('[data-export-ignore="true"]').forEach((node) => node.remove())
  const viewBoxWidth = clone.viewBox.baseVal.width || Number(clone.getAttribute('width')) || svg.clientWidth || 960
  const viewBoxHeight = clone.viewBox.baseVal.height || Number(clone.getAttribute('height')) || svg.clientHeight || 420
  clone.setAttribute('width', String(viewBoxWidth))
  clone.setAttribute('height', String(viewBoxHeight))
  return {
    markup: new XMLSerializer().serializeToString(clone),
    width: viewBoxWidth,
    height: viewBoxHeight,
  }
}

export function downloadChartSvg(svg: SVGSVGElement, filename: string): void {
  const serialized = serializeChartSvg(svg)
  const blob = new Blob([serialized.markup], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  triggerDownload(url, filename)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export async function downloadChartPng(svg: SVGSVGElement, filename: string): Promise<void> {
  const serialized = serializeChartSvg(svg)
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
