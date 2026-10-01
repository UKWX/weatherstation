import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadChartPng, serializeChartSvg } from '@/components/charts/exportChart'

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function chartFixture(): { card: HTMLElement; svg: SVGSVGElement } {
  document.body.innerHTML = `
    <section class="chart-kit-card">
      <h2 class="chart-kit-card__title">Rainfall &amp; temperature</h2>
      <p class="chart-kit-card__subtitle">Daily readings &amp; averages</p>
      <div class="chart-kit-legend">
        <span class="chart-kit-legend__item"><span class="chart-kit-swatch" style="background: #2f5fa8; border: 2px solid #2f5fa8"></span><span>Rainfall</span></span>
        <span class="chart-kit-legend__item"><span class="chart-kit-swatch" style="background: transparent; border: 2px dashed #c22b2b"></span><span>Temperature</span></span>
      </div>
      <button>Download PNG</button>
      <svg viewBox="0 0 1400 560" style="color: red">
        <path d="M 0 10 L 1400 10" stroke="currentColor"/>
        <line data-export-ignore="true" x1="1" x2="1"/>
        <rect data-export-ignore="true" width="1400" height="560"/>
      </svg>
      <p class="chart-kit-card__footnote">Measurements from Wakefield &amp; nearby stations.</p>
    </section>`
  return {
    card: document.querySelector('section')!,
    svg: document.querySelector('svg')!,
  }
}

describe('shared chart exports', () => {
  it('exports a complete, self-contained wide card without hover controls', () => {
    const { card, svg } = chartFixture()
    const result = serializeChartSvg(svg, card)
    const exported = new DOMParser().parseFromString(result.markup, 'image/svg+xml')

    expect(result.width).toBe(1480)
    expect(result.height).toBeGreaterThan(600)
    expect(exported.querySelector('parsererror')).toBeNull()
    expect(exported.documentElement.getAttribute('viewBox')).toBe(`0 0 1480 ${result.height}`)
    expect(exported.querySelector('rect[fill="#f5f7f9"]')).not.toBeNull()
    expect(exported.querySelector('rect[fill="#ffffff"]')).not.toBeNull()
    expect(result.markup).toContain('Rainfall &amp; temperature')
    expect(result.markup).toContain('Daily readings &amp; averages')
    expect(result.markup).toContain('Measurements from Wakefield &amp; nearby stations.')
    expect(result.markup).toContain('stroke-dasharray="5 3"')
    expect(exported.querySelector('svg svg')?.getAttribute('width')).toBe('1400')
    expect(exported.querySelector('svg svg')?.getAttribute('style')).toContain('color: red')
    expect(exported.querySelector('svg svg path')).not.toBeNull()
    expect(exported.querySelector('[data-export-ignore]')).toBeNull()
    expect(result.markup).not.toContain('Download PNG')
    expect(result.markup).not.toContain('var(')
  })

  it('preserves the bare SVG export for callers without a card', () => {
    const { svg } = chartFixture()
    const result = serializeChartSvg(svg)
    expect(result.width).toBe(1400)
    expect(result.height).toBe(560)
    expect(result.markup).not.toContain('Rainfall &amp; temperature')
    expect(result.markup).not.toContain('data-export-ignore')
  })

  it('renders the complete card as a white-backed PNG at 2x resolution', async () => {
    const { svg, card } = chartFixture()
    const serialized = serializeChartSvg(svg, card)
    const context = {
      scale: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillStyle: '',
    }
    const canvas = document.createElement('canvas')
    vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => callback(new Blob(['png'], { type: 'image/png' })))
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag) =>
      tag === 'canvas' ? canvas : originalCreateElement(tag)
    )
    const createObjectURL = vi.fn(() => 'blob:chart')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    class LoadedImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_url: string) { queueMicrotask(() => this.onload?.()) }
    }
    vi.stubGlobal('Image', LoadedImage)
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    await downloadChartPng(svg, 'chart.png', card)

    expect(canvas.width).toBe(serialized.width * 2)
    expect(canvas.height).toBe(serialized.height * 2)
    expect(context.scale).toHaveBeenCalledWith(2, 2)
    expect(context.fillStyle).toBe('#ffffff')
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, serialized.width, serialized.height)
    expect(context.drawImage).toHaveBeenCalledWith(expect.any(LoadedImage), 0, 0, serialized.width, serialized.height)
    expect(createObjectURL).toHaveBeenCalledTimes(2)
  })
})
