function triggerDownload(url: string, filename: string): void {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

export function serializeChartSvg(svg: SVGSVGElement): { readonly markup: string; readonly width: number; readonly height: number } {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
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
  const blob = new Blob([serialized.markup], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  await new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = async () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = serialized.width * 3
        canvas.height = serialized.height * 3
        const context = canvas.getContext('2d')
        if (context == null) {
          throw new Error('Canvas context unavailable')
        }
        context.scale(3, 3)
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, serialized.width, serialized.height)
        context.drawImage(image, 0, 0, serialized.width, serialized.height)
        const dataUrl = canvas.toDataURL('image/png')
        triggerDownload(dataUrl, filename)
        resolve()
      } catch (error) {
        reject(error)
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Unable to render chart for PNG export'))
    }
    image.src = url
  })
}
