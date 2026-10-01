import { useRef } from 'react'
import { ChartCard } from '@/components/charts/ChartCard'
import { chartTheme, MONTH_SHORT } from '@/components/charts/chartTheme'
import type { ClimateDay } from '@/types/weather'
import { buildOnThisDayRows } from './onThisDay'
import { legendSwatch, temperatureLabel, useClimateChartHover } from './climateChartCommon'

const W = chartTheme.exportWidth
const LEFT = 100
const RIGHT = 55
const TOP = 56
const ROW = 29
const MAX_COLOR = chartTheme.colors.actualMax
const MIN_COLOR = chartTheme.colors.actualMin

export function TodayEveryYearChart({
  records,
  month = new Date().getUTCMonth() + 1,
  day = new Date().getUTCDate(),
}: {
  readonly records: readonly ClimateDay[]
  readonly month?: number
  readonly day?: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { containerRef, hover, handlers, Tooltip } = useClimateChartHover()
  const rows = buildOnThisDayRows(records, month, day)
  const values = rows.flatMap((row) => [row.maxC, row.minC]).filter((v): v is number => v != null && Number.isFinite(v))
  const min = values.length ? Math.floor(Math.min(...values) / 5) * 5 - 5 : 0
  const max = values.length ? Math.ceil(Math.max(...values) / 5) * 5 + 5 : 5
  const x = (value: number) => LEFT + (value - min) / (max - min) * (W - LEFT - RIGHT)
  const height = TOP + rows.length * ROW + 38
  const active = hover == null ? null : rows[hover.index]
  const dateLabel = `${MONTH_SHORT[month - 1] ?? 'Month'} ${day}`

  return (
    <ChartCard title="Today vs every year" subtitle={`${dateLabel}: daily maximum and minimum temperatures across the record.`}
      svgRef={svgRef} svgFilename={`today-every-year-${month}-${day}.svg`}
      pngFilename={`today-every-year-${month}-${day}.png`} minWidth={710}
      legend={[
        { label: 'Daily maximum', swatch: legendSwatch(MAX_COLOR) },
        { label: 'Daily minimum', swatch: legendSwatch(MIN_COLOR) },
      ]}>
      {values.length === 0 ? <p className="normals-no-data">No chart data available for this date.</p> : (
        <div ref={containerRef} className="chart-kit-canvas" style={{ position: 'relative' }}>
          <svg ref={svgRef} className="chart-kit-svg" viewBox={`0 0 ${W} ${height}`}
            role="img" aria-label={`Minimum and maximum temperatures on ${dateLabel} in each year`}
            style={{ width: '100%', height: 'auto' }}>
            {Array.from({ length: 6 }, (_, i) => {
              const value = min + (max - min) * i / 5
              return (
                <g key={i}>
                  <line x1={x(value)} x2={x(value)} y1={TOP - 12} y2={height - 33}
                    stroke={chartTheme.colors.grid} />
                  <text x={x(value)} y={height - 12} textAnchor="middle" fontSize={chartTheme.fontSizes.tick}
                    fill={chartTheme.colors.sub}>{value.toFixed(0)} °C</text>
                </g>
              )
            })}
            {rows.map((row, i) => {
              const y = TOP + i * ROW
              return (
                <g key={row.year}>
                  <text x={LEFT - 14} y={y} textAnchor="end" dominantBaseline="middle"
                    fontSize={chartTheme.fontSizes.tick} fill={chartTheme.colors.sub}>{row.year}</text>
                  {row.minC != null && row.maxC != null && (
                    <line x1={x(row.minC)} x2={x(row.maxC)} y1={y} y2={y}
                      stroke={chartTheme.colors.bandEdge} strokeWidth={chartTheme.strokeWidths.standard} />
                  )}
                  {row.minC != null && <circle cx={x(row.minC)} cy={y} r={5} fill={MIN_COLOR} />}
                  {row.maxC != null && <circle cx={x(row.maxC)} cy={y} r={5} fill={MAX_COLOR} />}
                  <rect x={LEFT} y={y - ROW / 2} width={W - LEFT - RIGHT} height={ROW}
                    fill="transparent" stroke={hover?.index === i ? chartTheme.colors.monthLine : 'none'}
                    aria-label={`${row.year}: high ${temperatureLabel(row.maxC)}, low ${temperatureLabel(row.minC)}`}
                    {...handlers(i)} />
                </g>
              )
            })}
          </svg>
          {active != null && <Tooltip title={`${dateLabel}, ${active.year}`} rows={[
            { label: 'Maximum', value: temperatureLabel(active.maxC), accentColor: MAX_COLOR },
            { label: 'Minimum', value: temperatureLabel(active.minC), accentColor: MIN_COLOR },
          ]} />}
        </div>
      )}
    </ChartCard>
  )
}
