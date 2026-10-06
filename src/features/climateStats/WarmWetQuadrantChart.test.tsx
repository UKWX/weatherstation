import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { serializeChartSvg } from '@/components/charts/exportChart'
import type { ClimateDay } from '@/types/weather'
import { WarmWetQuadrantChart } from './WarmWetQuadrantChart'
import { buildRainfallGrid } from './rainfallGrid'
import { buildTemperatureAnomalyGrid } from './temperatureAnomalyGrid'

vi.mock('./rainfallGrid', () => ({ buildRainfallGrid: vi.fn() }))
vi.mock('./temperatureAnomalyGrid', () => ({
  buildTemperatureAnomalyGrid: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

function renderQuadrant(anomalyC = 4.5, percent = 255) {
  vi.mocked(buildTemperatureAnomalyGrid).mockReturnValue([
    { year: 2024, month: 1, meanC: 2, anomalyC: -2.3, complete: true },
    { year: 2024, month: 2, meanC: 10, anomalyC, complete: true },
    { year: 2024, month: 3, meanC: 20, anomalyC: 10, complete: false },
  ])
  vi.mocked(buildRainfallGrid).mockReturnValue(
    [80, percent, 900].map((value, index) => ({
      year: 2024,
      month: index + 1,
      totalMm: 50,
      percent: value,
      rainDays: 10,
      complete: true,
    })),
  )
  const records = [1, 2, 3].flatMap((month) =>
    Array.from(
      { length: new Date(Date.UTC(2024, month, 0)).getUTCDate() },
      (_, index): ClimateDay => ({
        date: `2024-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}` as ClimateDay['date'],
        rainfallMm: 1,
        meanTempC: 10,
        maxTempC: 15,
        minTempC: 5,
        status: 'finalised',
      }),
    ),
  )
  return render(<WarmWetQuadrantChart records={records} currentYear={2024} />)
}

describe('warm/wet quadrant data-focused axes', () => {
  it('fits plotted extrema, resizes quadrants and exports the same bounds', () => {
    const { container } = renderQuadrant()
    const svg = screen.getByRole('img')
    expect(svg).toHaveTextContent('+4.5')
    expect(svg).toHaveTextContent('-2.3')
    expect(svg).toHaveTextContent('255%')
    expect(svg).not.toHaveTextContent('500%')
    expect(svg).not.toHaveTextContent('+6')
    const quadrants = [...svg.querySelectorAll('rect')].slice(0, 4)
    const coolWidth = Number(quadrants[0]!.getAttribute('width'))
    const warmWidth = Number(quadrants[1]!.getAttribute('width'))
    expect(coolWidth / warmWidth).toBeCloseTo(2.3 / 4.5)
    const normal = svg.querySelector('circle')!
    expect(Number(normal.getAttribute('cx'))).toBeCloseTo(114 + coolWidth)
    expect(Number(normal.getAttribute('cy'))).toBeCloseTo(
      55 + ((255 - 100) / 255) * (690 - 55 - 94),
    )
    const { markup } = serializeChartSvg(
      svg as unknown as SVGSVGElement,
      container.querySelector<HTMLElement>('.chart-kit-card')!,
    )
    expect(markup).toContain('255%')
    expect(markup).toContain('+4.5')
    expect(markup).toContain('Axes fit the plotted data')
  })

  it('caps outliers at the plot edge while retaining actual tooltip values', () => {
    renderQuadrant(8, 700)
    const svg = screen.getByRole('img')
    expect(svg).toHaveTextContent('+6')
    expect(svg).toHaveTextContent('500%')
    expect(svg).not.toHaveTextContent('700%')
    expect(svg.querySelectorAll('path')).toHaveLength(1)
    fireEvent.focus(
      screen.getByLabelText('Feb 2024: 8.0 °C anomaly, 700% rainfall'),
    )
    expect(screen.getByText('+8.0 °C')).toBeInTheDocument()
    expect(screen.getByText('700%')).toBeInTheDocument()
    expect(
      screen.getByText('Point pinned to plot edge; actual values shown above.'),
    ).toBeInTheDocument()
  })
})
