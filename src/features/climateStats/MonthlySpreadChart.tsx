import { useRef } from 'react'
import { ChartCard } from '@/components/charts/ChartCard'
import { chartTheme, MONTH_SHORT } from '@/components/charts/chartTheme'
import type { ClimateDay } from '@/types/weather'
import { summarizeMonthlySpread, type PercentileSummary } from './monthlySpread'
import { legendSwatch, temperatureLabel, useClimateChartHover } from './climateChartCommon'

const W = chartTheme.exportWidth
const H = 610
const LEFT = 75
const TOP = 55
const BOTTOM = 65
const PLOT_H = H - TOP - BOTTOM
const COL = (W - LEFT - 35) / 12
const MAX_COLOR = chartTheme.colors.actualMax
const MIN_COLOR = chartTheme.colors.actualMin

export function MonthlySpreadChart({ records }: { readonly records: readonly ClimateDay[] }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { containerRef, hover, handlers, Tooltip } = useClimateChartHover()
  const groups = MONTH_SHORT.map((label, index) => ({
    label,
    max: summarizeMonthlySpread(records, index + 1),
    min: summarizeMonthlySpread(records, index + 1, true),
  }))
  const values = groups.flatMap((group) => [group.max?.min, group.max?.max, group.min?.min, group.min?.max])
    .filter((v): v is number => v != null && Number.isFinite(v))
  const lower = values.length ? Math.floor(Math.min(...values) / 5) * 5 - 5 : 0
  const upper = values.length ? Math.ceil(Math.max(...values) / 5) * 5 + 5 : 5
  const y = (value: number) => TOP + (upper - value) / (upper - lower) * PLOT_H
  const active = hover == null ? null : groups[Math.floor(hover.index / 2)]
  const activeSeries = hover?.index != null && hover.index % 2 === 0 ? 'max' : 'min'

  function box(summary: PercentileSummary, x: number, color: string, key: string) {
    return (
      <g key={key} stroke={color}>
        <line x1={x} x2={x} y1={y(summary.p05)} y2={y(summary.p95)} strokeWidth={2} />
        <line x1={x - 7} x2={x + 7} y1={y(summary.p05)} y2={y(summary.p05)} strokeWidth={2} />
        <line x1={x - 7} x2={x + 7} y1={y(summary.p95)} y2={y(summary.p95)} strokeWidth={2} />
        <rect x={x - 13} y={y(summary.p75)} width={26}
          height={Math.max(1, y(summary.p25) - y(summary.p75))} fill={color} fillOpacity={0.27} strokeWidth={2} />
        <line x1={x - 13} x2={x + 13} y1={y(summary.median)} y2={y(summary.median)} strokeWidth={3} />
        <circle cx={x} cy={y(summary.min)} r={2} fill={color} />
        <circle cx={x} cy={y(summary.max)} r={2} fill={color} />
      </g>
    )
  }

  return (
    <ChartCard title="Monthly spread" subtitle="Distribution of daily highs and lows for each calendar month since 1995."
      footnote="Boxes: 25th–75th percentiles; centre: median; whiskers: 5th–95th percentiles; dots: extremes."
      svgRef={svgRef} svgFilename="monthly-temperature-spread.svg" pngFilename="monthly-temperature-spread.png"
      minWidth={800} legend={[
        { label: 'Daily high', swatch: legendSwatch(MAX_COLOR) },
        { label: 'Daily low', swatch: legendSwatch(MIN_COLOR) },
      ]}>
      {values.length === 0 ? <p className="normals-no-data">No chart data available.</p> : (
        <div ref={containerRef} className="chart-kit-canvas" style={{ position: 'relative' }}>
          <svg ref={svgRef} className="chart-kit-svg" viewBox={`0 0 ${W} ${H}`} role="img"
            aria-label="Monthly distribution of daily maximum and minimum temperatures"
            style={{ width: '100%', height: 'auto' }}>
            {Array.from({ length: 6 }, (_, i) => {
              const tick = lower + (upper - lower) * i / 5
              return (
                <g key={i}>
                  <line x1={LEFT} x2={W - 35} y1={y(tick)} y2={y(tick)} stroke={chartTheme.colors.grid} />
                  <text x={LEFT - 12} y={y(tick)} dominantBaseline="middle" textAnchor="end"
                    fill={chartTheme.colors.sub} fontSize={chartTheme.fontSizes.tick}>{tick.toFixed(0)} °C</text>
                </g>
              )
            })}
            {groups.map((group, i) => {
              const center = LEFT + (i + 0.5) * COL
              return (
                <g key={group.label}>
                  <text x={center} y={H - 24} textAnchor="middle"
                    fill={chartTheme.colors.sub} fontSize={chartTheme.fontSizes.monthHeader}>{group.label}</text>
                  {group.max != null && box(group.max, center - 19, MAX_COLOR, 'max')}
                  {group.min != null && box(group.min, center + 19, MIN_COLOR, 'min')}
                  {[group.max, group.min].map((summary, series) => summary != null && (
                    <rect key={series} x={center + (series === 0 ? -38 : 0)} y={TOP}
                      width={38} height={PLOT_H} fill="transparent"
                      stroke={hover?.index === i * 2 + series ? chartTheme.colors.monthLine : 'none'}
                      aria-label={`${group.label} daily ${series === 0 ? 'high' : 'low'}: median ${temperatureLabel(summary.median)}, range ${temperatureLabel(summary.min)} to ${temperatureLabel(summary.max)}`}
                      {...handlers(i * 2 + series)} />
                  ))}
                </g>
              )
            })}
          </svg>
          {active != null && (
            <Tooltip title={`${active.label} daily ${activeSeries === 'max' ? 'highs' : 'lows'}`}
              rows={active[activeSeries] == null ? [] : [
                { label: 'Minimum', value: temperatureLabel(active[activeSeries].min) },
                { label: '5th percentile', value: temperatureLabel(active[activeSeries].p05) },
                { label: '25th percentile', value: temperatureLabel(active[activeSeries].p25) },
                { label: 'Median', value: temperatureLabel(active[activeSeries].median) },
                { label: '75th percentile', value: temperatureLabel(active[activeSeries].p75) },
                { label: '95th percentile', value: temperatureLabel(active[activeSeries].p95) },
                { label: 'Maximum', value: temperatureLabel(active[activeSeries].max) },
              ]} />
          )}
        </div>
      )}
    </ChartCard>
  )
}
