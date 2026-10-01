import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { serializeChartSvg } from '@/components/charts/exportChart'
import { TemperatureAnomalyGridChart } from './TemperatureAnomalyGridChart'
import { TodayEveryYearChart } from './TodayEveryYearChart'
import { MonthlySpreadChart } from './MonthlySpreadChart'
import { WarmFrostSpellsChart } from './WarmFrostSpellsChart'
import { RainfallYearOnYearChart } from './RainfallYearOnYearChart'
import { RainfallGridChart } from './RainfallGridChart'
import { DrySpellsChart } from './DrySpellsChart'
import { WarmWetQuadrantChart } from './WarmWetQuadrantChart'
import type { ClimateDay } from '@/types/weather'

const days: ClimateDay[] = Array.from({ length: 31 }, (_, index) => ({
  date: `2024-01-${String(index + 1).padStart(2, '0')}` as ClimateDay['date'],
  maxTempC: 25 + index / 10,
  minTempC: index % 10 < 5 ? -2 : 2,
  meanTempC: 6,
  rainfallMm: index % 10 === 0 ? 2 : 0,
  status: 'finalised',
}))

afterEach(cleanup)

describe('new climate charts', () => {
  const charts = [
    ['Temperature anomaly grid', <TemperatureAnomalyGridChart records={days} currentYear={2024} />],
    ['Today vs every year', <TodayEveryYearChart records={days} currentYear={2024} month={1} day={1} />],
    ['Monthly spread', <MonthlySpreadChart records={days} currentYear={2024} />],
    ['Warm and frost spells', <WarmFrostSpellsChart records={days} currentYear={2024} />],
    ['Rainfall year on year', <RainfallYearOnYearChart records={days} currentYear={2024} />],
    ['Rainfall grid', <RainfallGridChart records={days} currentYear={2024} />],
    ['Dry spells', <DrySpellsChart records={days} currentYear={2024} />],
    ['Warm/wet quadrant', <WarmWetQuadrantChart records={days} currentYear={2024} />],
  ] as const

  for (const [title, chart] of charts) {
    it(`${title} renders and exports a standalone card without hover styles or clipping`, () => {
      const { container } = render(chart)
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
      const svg = container.querySelector<SVGSVGElement>('.chart-kit-card svg')
      expect(svg).not.toBeNull()
      const card = svg!.closest<HTMLElement>('.chart-kit-card')
      expect(card).not.toBeNull()
      const { markup, height, width } = serializeChartSvg(svg!, card!)
      expect(width).toBeGreaterThanOrEqual(1480)
      expect(height).toBeGreaterThan(100)
      expect(markup).not.toMatch(/var\(--|data-export-ignore="true"/)
      expect(markup).toContain(title)
      const exported = new DOMParser().parseFromString(markup, 'image/svg+xml')
      const nested = exported.documentElement.querySelector('svg')
      expect(nested).not.toBeNull()
      expect(Number(nested!.getAttribute('y')) + Number(nested!.getAttribute('height'))).toBeLessThan(height)
    })
  }
})
