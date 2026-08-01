import { describe, expect, it } from 'vitest'
import { buildCustomGraphCsv } from '@/features/customGraphs/csv'
import { prepareSvgPngExport } from '@/features/customGraphs/png'
import type { CustomGraphSeries } from '@/features/customGraphs/types'

const series: CustomGraphSeries[] = [
  {
    id: 'temperature-primary',
    label: 'Air temperature',
    shortLabel: 'Temperature',
    unit: '°C',
    group: 'temperature',
    color: '#0000ff',
    chartType: 'line',
    points: [
      { timestamp: 1, label: '01 Jun', value: 12.3 },
      { timestamp: 2, label: '02 Jun', value: null },
    ],
  },
  {
    id: 'rain-primary',
    label: 'Rainfall',
    shortLabel: 'Rainfall',
    unit: 'mm',
    group: 'rainfall',
    color: '#00aa00',
    chartType: 'bar',
    points: [
      { timestamp: 1, label: '01 Jun', value: 1.2 },
      { timestamp: 2, label: '02 Jun', value: 0 },
    ],
  },
]

describe('custom graph exports', () => {
  it('builds CSV output for visible series while preserving blanks for null gaps', () => {
    const csv = buildCustomGraphCsv(series)

    expect(csv).toContain('Label,Air temperature (°C),Rainfall (mm)')
    expect(csv).toContain('01 Jun,12.30,1.20')
    expect(csv).toContain('02 Jun,,0.00')
  })

  it('prepares SVG export metadata for PNG rendering', () => {
    document.body.innerHTML = '<svg width="400" height="200"><rect width="10" height="10"></rect></svg>'
    const svg = document.querySelector('svg') as SVGSVGElement

    const preparation = prepareSvgPngExport(svg, {
      scale: 3,
      backgroundColor: '#101820',
    })

    expect(preparation.width).toBe(400)
    expect(preparation.height).toBe(200)
    expect(preparation.scale).toBe(3)
    expect(preparation.backgroundColor).toBe('#101820')
    expect(preparation.serializedSvg).toContain('<svg')
  })
})
