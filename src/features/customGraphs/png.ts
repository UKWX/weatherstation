export interface SvgPngExportPreparation {
  readonly serializedSvg: string
  readonly width: number
  readonly height: number
  readonly scale: number
  readonly backgroundColor: string
}

export function prepareSvgPngExport(
  svg: SVGSVGElement,
  options: {
    readonly scale?: number
    readonly backgroundColor?: string
  } = {},
): SvgPngExportPreparation {
  const width = svg.clientWidth || Number(svg.getAttribute('width')) || 960
  const height = svg.clientHeight || Number(svg.getAttribute('height')) || 420
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  const serializedSvg = new XMLSerializer().serializeToString(clone)

  return {
    serializedSvg,
    width,
    height,
    scale: options.scale ?? 2,
    backgroundColor: options.backgroundColor ?? '#ffffff',
  }
}

export async function downloadSvgAsPng(
  svg: SVGSVGElement,
  filename: string,
  options: {
    readonly scale?: number
    readonly backgroundColor?: string
  } = {},
): Promise<void> {
  const preparation = prepareSvgPngExport(svg, options)
  const blob = new Blob([preparation.serializedSvg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  await new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = preparation.width * preparation.scale
      canvas.height = preparation.height * preparation.scale
      const context = canvas.getContext('2d')
      if (context == null) {
        URL.revokeObjectURL(url)
        reject(new Error('Canvas context unavailable'))
        return
      }
      context.scale(preparation.scale, preparation.scale)
      context.fillStyle = preparation.backgroundColor
      context.fillRect(0, 0, preparation.width, preparation.height)
      context.drawImage(image, 0, 0, preparation.width, preparation.height)
      URL.revokeObjectURL(url)
      const anchor = document.createElement('a')
      anchor.href = canvas.toDataURL('image/png')
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      resolve()
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Unable to render chart for PNG export'))
    }
    image.src = url
  })
}
