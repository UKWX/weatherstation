import { useRef } from 'react'
import { ChartCard } from '@/components/charts/ChartCard'
import { chartTheme, MONTH_SHORT } from '@/components/charts/chartTheme'
import type { ClimateDay } from '@/types/weather'
import { buildTemperatureAnomalyGrid } from './temperatureAnomalyGrid'
import { legendSwatch, temperatureLabel, useClimateChartHover } from './climateChartCommon'

const W = chartTheme.exportWidth
const LEFT = 94
const TOP = 53
const COL = (W - LEFT - 24) / 12
const ROW = 25

function anomalyColor(value: number | null): string {
  if (value == null) return '#f5f7f9'
  const base = [245, 247, 249]
  const target = value < 0 ? [36, 83, 201] : [194, 43, 43]
  const intensity = Math.min(1, Math.abs(value) / 3)
  return `rgb(${base.map((channel, index) => Math.round(channel + (target[index]! - channel) * intensity)).join(',')})`
}

export function TemperatureAnomalyGridChart({ records, currentYear }: {
  readonly records: readonly ClimateDay[]
  readonly currentYear: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { containerRef, hover, handlers, Tooltip } = useClimateChartHover()
  const firstYear = 1995
  const lastYear = currentYear
  const cells = currentYear >= firstYear ? buildTemperatureAnomalyGrid(records, firstYear, lastYear) : []
  const height = TOP + Math.max(1, lastYear - firstYear + 1) * ROW + 24
  const active = hover == null ? null : cells[hover.index]
  const activeDays = active == null ? [] : records.filter((record) =>
    record.date.startsWith(`${active.year}-${String(active.month).padStart(2, '0')}-`) &&
    record.maxTempC != null && record.minTempC != null)
  const average = (values: number[]) => values.length ? `${(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)} °C` : '—'

  return (
    <ChartCard
      title="Temperature anomaly grid"
      subtitle="Station temperature since 1995 · 1991–2020 average."
      footnote="Colder / Warmer than the 1991–2020 average (−3°C to +3°C). Incomplete months are faded."
      svgRef={svgRef}
      svgFilename={`wakefield-${currentYear}-temperature-anomaly-grid.svg`}
      pngFilename={`wakefield-${currentYear}-temperature-anomaly-grid.png`}
      minWidth={760}
      legend={[
        { label: 'Cooler', swatch: legendSwatch('#2453c9') },
        { label: 'Near normal', swatch: legendSwatch('#f5f7f9') },
        { label: 'Warmer', swatch: legendSwatch('#c22b2b') },
        { label: 'Insufficient data', swatch: legendSwatch('#f5f7f9') },
      ]}
    >
      {cells.length === 0 ? <p className="normals-no-data">No chart data available.</p> : (
        <div ref={containerRef} className="chart-kit-canvas" style={{ position: 'relative' }}>
          <svg ref={svgRef} className="chart-kit-svg" viewBox={`0 0 ${W} ${height}`} role="img"
            aria-label={`Monthly temperature anomaly grid from ${firstYear} to ${lastYear}`}
            style={{ width: '100%', height: 'auto' }}>
            {MONTH_SHORT.map((month, i) => (
              <text key={month} x={LEFT + (i + 0.5) * COL} y={TOP - 17} textAnchor="middle"
                fill={chartTheme.colors.ink} fontSize={chartTheme.fontSizes.monthHeader}>{month}</text>
            ))}
            {Array.from({ length: lastYear - firstYear + 1 }, (_, i) => (
              <text key={i} x={LEFT - 12} y={TOP + (i + 0.5) * ROW}
                textAnchor="end" dominantBaseline="middle" fill={chartTheme.colors.sub}
                fontSize={chartTheme.fontSizes.tick}>{(firstYear + i) % 5 === 0 || firstYear + i === currentYear ? firstYear + i : ''}</text>
            ))}
            {cells.map((cell, i) => (
              <g key={`${cell.year}-${cell.month}`}>
              <rect
                x={LEFT + (cell.month - 1) * COL + 2} y={TOP + (cell.year - firstYear) * ROW + 2}
                width={COL - 4} height={ROW - 4} rx={3}
                fill={anomalyColor(cell.anomalyC)}
                opacity={cell.complete ? 1 : 0.4}
                stroke={hover?.index === i || cell.year === currentYear ? chartTheme.colors.ink : '#fff'}
                strokeWidth={hover?.index === i ? 2 : 1}
                aria-label={`${MONTH_SHORT[cell.month - 1]} ${cell.year}: ${cell.anomalyC == null ? 'insufficient data' : `${temperatureLabel(cell.anomalyC)} anomaly`}`}
                {...handlers(i)}
                data-grid-cell="true"
                onKeyDown={(event) => {
                  const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 :
                    event.key === 'ArrowDown' ? 12 : event.key === 'ArrowUp' ? -12 : 0
                  if (delta) {
                    event.preventDefault()
                    const cells = event.currentTarget.ownerSVGElement?.querySelectorAll<SVGRectElement>('[data-grid-cell="true"]')
                    cells?.[Math.max(0, Math.min(cells.length - 1, i + delta))]?.focus()
                  }
                }}
              />
              <text x={LEFT + (cell.month - 0.5) * COL}
                y={TOP + (cell.year - firstYear + 0.5) * ROW}
                textAnchor="middle" dominantBaseline="middle" pointerEvents="none"
                fill={cell.anomalyC != null && Math.abs(cell.anomalyC) >= 2.5 ? '#fff' : chartTheme.colors.ink}
                fontSize={chartTheme.fontSizes.tick}>
                {cell.anomalyC == null ? '—' :
                  `${cell.anomalyC > 0.05 ? '↑' : cell.anomalyC < -0.05 ? '↓' : '→'} ${Math.abs(cell.anomalyC).toFixed(1)}`}
              </text>
              </g>
            ))}
          </svg>
          {active != null && (
            <Tooltip title={`${MONTH_SHORT[active.month - 1]} ${active.year}`}
              rows={[
                { label: 'Mean temperature', value: temperatureLabel(active.meanC) },
                { label: 'Anomaly vs 1991–2020', value: `${active.anomalyC != null && active.anomalyC > 0 ? '+' : ''}${temperatureLabel(active.anomalyC)}`, accentColor: anomalyColor(active.anomalyC) },
                { label: 'Mean maximum', value: average(activeDays.map((record) => record.maxTempC!)) },
                { label: 'Mean minimum', value: average(activeDays.map((record) => record.minTempC!)) },
                ...(!active.complete || active.anomalyC == null ? [] : [{
                  label: 'Rank for this month',
                  value: `#${1 + cells.filter((cell) => cell.month === active.month &&
                    cell.complete && cell.anomalyC != null && cell.anomalyC > active.anomalyC!).length}`,
                }]),
              ]}
              footer={active.complete ? undefined : `Partial month (${activeDays.length} of ${new Date(Date.UTC(active.year, active.month, 0)).getUTCDate()} days)`} />
          )}
        </div>
      )}
    </ChartCard>
  )
}
