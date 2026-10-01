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
  if (value == null) return '#e4e8ec'
  if (value <= -3) return '#2453c9'
  if (value <= -1.5) return '#719bd9'
  if (value < -0.5) return '#b5d1ec'
  if (value <= 0.5) return '#f1f1ed'
  if (value < 1.5) return '#f4be9d'
  if (value < 3) return '#e67856'
  return '#b82d32'
}

export function TemperatureAnomalyGridChart({ records }: { readonly records: readonly ClimateDay[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { containerRef, hover, handlers, Tooltip } = useClimateChartHover()
  const years = records.map((record) => Number(record.date.slice(0, 4))).filter(Number.isFinite)
  const firstYear = Math.max(1995, Math.min(...years))
  const lastYear = Math.max(...years)
  const cells = years.length ? buildTemperatureAnomalyGrid(records, firstYear, lastYear) : []
  const height = TOP + Math.max(1, lastYear - firstYear + 1) * ROW + 24
  const active = hover == null ? null : cells[hover.index]

  return (
    <ChartCard
      title="Temperature anomaly grid"
      subtitle="Monthly mean temperature relative to the monthly normal, by year."
      footnote="Grey cells have insufficient observations (fewer than 90% of the month's days)."
      svgRef={svgRef}
      svgFilename="temperature-anomaly-grid.svg"
      pngFilename="temperature-anomaly-grid.png"
      minWidth={760}
      legend={[
        { label: 'Cooler', swatch: legendSwatch('#2453c9') },
        { label: 'Near normal', swatch: legendSwatch('#f1f1ed') },
        { label: 'Warmer', swatch: legendSwatch('#b82d32') },
        { label: 'Insufficient data', swatch: legendSwatch('#e4e8ec') },
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
                fontSize={chartTheme.fontSizes.tick}>{firstYear + i}</text>
            ))}
            {cells.map((cell, i) => (
              <rect key={`${cell.year}-${cell.month}`}
                x={LEFT + (cell.month - 1) * COL + 2} y={TOP + (cell.year - firstYear) * ROW + 2}
                width={COL - 4} height={ROW - 4} rx={3}
                fill={anomalyColor(cell.anomalyC)}
                stroke={hover?.index === i ? chartTheme.colors.ink : '#fff'}
                strokeWidth={hover?.index === i ? 2 : 1}
                aria-label={`${MONTH_SHORT[cell.month - 1]} ${cell.year}: ${cell.anomalyC == null ? 'insufficient data' : `${temperatureLabel(cell.anomalyC)} anomaly`}`}
                {...handlers(i)}
              />
            ))}
          </svg>
          {active != null && (
            <Tooltip title={`${MONTH_SHORT[active.month - 1]} ${active.year}`}
              rows={[
                { label: 'Mean temperature', value: temperatureLabel(active.meanC) },
                { label: 'Anomaly', value: temperatureLabel(active.anomalyC), accentColor: anomalyColor(active.anomalyC) },
              ]}
              footer={active.complete ? undefined : 'Insufficient data for a monthly anomaly'} />
          )}
        </div>
      )}
    </ChartCard>
  )
}
