import { useRef, useState } from 'react'
import { ChartCard } from '@/components/charts/ChartCard'
import { chartTheme, MONTH_SHORT } from '@/components/charts/chartTheme'
import { MONTHLY_NORMAL_BASELINE } from '@/config/weather'
import { TEMP_MONTHLY_NORMALS_C } from '@/features/normals/temperatureNormals'
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
const HIGH = chartTheme.colors.actualMax
const LOW = chartTheme.colors.actualMin

export function MonthlySpreadChart({ records, currentYear }: {
  readonly records: readonly ClimateDay[]
  readonly currentYear: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [useMin, setUseMin] = useState(false)
  const [activeDot, setActiveDot] = useState<ClimateDay | null>(null)
  const { containerRef, hover, handlers, Tooltip } = useClimateChartHover()
  const eligible = records.filter((record) => {
    const year = Number(record.date.slice(0, 4))
    return year >= 1995 && year <= currentYear
  })
  const color = useMin ? LOW : HIGH
  const mode = useMin ? 'Min' : 'Max'
  const groups = MONTH_SHORT.map((label, index) => {
    const month = index + 1
    const summary = summarizeMonthlySpread(eligible, month, useMin)
    const monthlyDays = eligible.filter((record) => Number(record.date.slice(5, 7)) === month)
    const value = (record: ClimateDay) => useMin ? record.minTempC : record.maxTempC
    return {
      label, month, summary,
      normal: (useMin ? TEMP_MONTHLY_NORMALS_C.min : TEMP_MONTHLY_NORMALS_C.max)[index],
      selected: monthlyDays.filter((record) => Number(record.date.slice(0, 4)) === selectedYear &&
        value(record) != null && Number.isFinite(value(record))),
      lowDates: monthlyDays.filter((record) => summary != null && value(record) === summary.min).map((record) => record.date),
      highDates: monthlyDays.filter((record) => summary != null && value(record) === summary.max).map((record) => record.date),
    }
  })
  const values = groups.flatMap(({ summary, normal }) => [summary?.min, summary?.max, normal])
    .filter((value): value is number => value != null && Number.isFinite(value))
  const lower = values.length ? Math.floor(Math.min(...values) / 5) * 5 - 5 : 0
  const upper = values.length ? Math.ceil(Math.max(...values) / 5) * 5 + 5 : 5
  const y = (value: number) => TOP + (upper - value) / (upper - lower) * PLOT_H
  const active = hover == null ? null : groups[hover.index]
  const activeSummary = active?.summary

  function box(summary: PercentileSummary, x: number) {
    return <g stroke={color} pointerEvents="none">
      <line x1={x} x2={x} y1={y(summary.p05)} y2={y(summary.p95)} strokeWidth={2} />
      {[summary.p05, summary.p95].map((value, index) =>
        <line key={index} x1={x - 12} x2={x + 12} y1={y(value)} y2={y(value)} strokeWidth={2} />)}
      <rect x={x - 23} y={y(summary.p75)} width={46}
        height={Math.max(1, y(summary.p25) - y(summary.p75))}
        fill={color} fillOpacity={0.25} strokeWidth={2} />
      <line x1={x - 23} x2={x + 23} y1={y(summary.median)} y2={y(summary.median)} strokeWidth={3} />
      <circle cx={x} cy={y(summary.min)} r={4} fill={color} />
      <circle cx={x} cy={y(summary.max)} r={4} fill={color} />
    </g>
  }

  const filename = `wakefield-${currentYear}-monthly-spread-${useMin ? 'min' : 'max'}`

  return (
    <ChartCard title="Monthly spread"
      subtitle={`Wakefield daily ${mode.toLowerCase()} temperatures, 1995–${currentYear}; ${MONTHLY_NORMAL_BASELINE} monthly normals. Selected year: ${selectedYear}.`}
      footnote="Boxes: 25th–75th percentiles; centre: median; whiskers: 5th–95th percentiles; large dots: record extremes. Hollow selected-year dots are provisional."
      headerAside={<div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <label>Temperature{' '}
          <select value={mode} onChange={(event) => setUseMin(event.target.value === 'Min')}>
            <option value="Max">Max</option>
            <option value="Min">Min</option>
          </select>
        </label>
        <label>Compare year{' '}
          <select aria-label="Historical comparison" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
            {Array.from({ length: Math.max(1, currentYear - 1994) }, (_, i) => 1995 + i).map((year) =>
              <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </div>}
      svgRef={svgRef} svgFilename={`${filename}.svg`} pngFilename={`${filename}.png`}
      minWidth={800} legend={[
        { label: `Daily ${mode.toLowerCase()} distribution`, swatch: legendSwatch(color) },
        { label: `${MONTHLY_NORMAL_BASELINE} normal`, swatch: <span className="chart-kit-swatch"
          style={{ borderColor: chartTheme.colors.bandEdge, borderStyle: 'dashed' }} /> },
        { label: `${selectedYear} daily observations`, swatch: legendSwatch(chartTheme.colors.ink) },
      ]}>
      {groups.every((group) => group.summary == null) ? <p className="normals-no-data">No chart data available.</p> : (
        <div ref={containerRef} className="chart-kit-canvas" style={{ position: 'relative' }}>
          <svg ref={svgRef} className="chart-kit-svg" viewBox={`0 0 ${W} ${H}`}
            role="img" aria-label={`Monthly spread of daily ${mode.toLowerCase()} temperatures`}
            style={{ width: '100%', height: 'auto' }}>
            {Array.from({ length: 6 }, (_, i) => {
              const tick = lower + (upper - lower) * i / 5
              return <g key={i}>
                <line x1={LEFT} x2={W - 35} y1={y(tick)} y2={y(tick)} stroke={chartTheme.colors.grid} />
                <text x={LEFT - 12} y={y(tick)} dominantBaseline="middle" textAnchor="end"
                  fill={chartTheme.colors.sub} fontSize={chartTheme.fontSizes.tick}>{tick.toFixed(0)} °C</text>
              </g>
            })}
            {groups.map((group, i) => {
              const center = LEFT + (i + 0.5) * COL
              return <g key={group.label}>
                <text x={center} y={H - 24} textAnchor="middle" fill={chartTheme.colors.sub}
                  fontSize={chartTheme.fontSizes.monthHeader}>{group.label}</text>
                {group.normal != null && <line x1={center - 34} x2={center + 34}
                  y1={y(group.normal)} y2={y(group.normal)} stroke={chartTheme.colors.bandEdge}
                  strokeWidth={2} strokeDasharray="5 4" pointerEvents="none" />}
                {group.summary != null && box(group.summary, center)}
                {group.summary != null && <rect x={center - COL / 2 + 2} y={TOP}
                  width={COL - 4} height={PLOT_H} fill="transparent"
                  stroke={hover?.index === i ? chartTheme.colors.monthLine : 'none'}
                  aria-label={`${group.label} ${mode.toLowerCase()} median ${temperatureLabel(group.summary.median)}; record ${temperatureLabel(group.summary.min)} to ${temperatureLabel(group.summary.max)}`}
                  {...handlers(i)} onPointerMove={(event) => { setActiveDot(null); handlers(i).onPointerMove(event) }} />}
                {group.selected.map((record) => {
                  const reading = useMin ? record.minTempC : record.maxTempC
                  if (reading == null) return null
                  const day = Number(record.date.slice(8, 10))
                  const jitter = ((day * 17 + group.month * 11) % 37 - 18) * 0.8
                  return <circle key={record.date} cx={center + jitter} cy={y(reading)} r={4}
                    fill={record.status === 'finalised' ? color : '#fff'} stroke={color}
                    strokeWidth={1.3} aria-label={`${record.date}: ${reading.toFixed(1)} °C`}
                    {...handlers(i)} onPointerMove={(event) => { setActiveDot(record); handlers(i).onPointerMove(event) }}
                    onFocus={(event) => { setActiveDot(record); handlers(i).onFocus(event) }}
                    onBlur={() => setActiveDot(null)} />
                })}
              </g>
            })}
          </svg>
          {active != null && activeSummary != null && (activeDot != null ?
            <Tooltip title={activeDot.date} rows={[
              { label: mode, value: temperatureLabel(useMin ? activeDot.minTempC : activeDot.maxTempC) },
              { label: 'Warmer than', value: `${Math.round(100 * eligible.filter((record) => Number(record.date.slice(5, 7)) === active.month && (useMin ? record.minTempC : record.maxTempC) != null && (useMin ? record.minTempC! : record.maxTempC!) < (useMin ? activeDot.minTempC! : activeDot.maxTempC!)).length / Math.max(1, eligible.filter((record) => Number(record.date.slice(5, 7)) === active.month && (useMin ? record.minTempC : record.maxTempC) != null).length))}% of ${active.label} days since 1995` },
            ]} /> :
            <Tooltip title={`${active.label} daily ${mode.toLowerCase()} temperatures`}
            rows={[
              { label: 'Record low', value: `${temperatureLabel(activeSummary.min)} · ${active.lowDates.join(', ')}` },
              { label: '5th percentile', value: temperatureLabel(activeSummary.p05) },
              { label: '25th percentile', value: temperatureLabel(activeSummary.p25) },
              { label: 'Median', value: temperatureLabel(activeSummary.median) },
              { label: '75th percentile', value: temperatureLabel(activeSummary.p75) },
              { label: '95th percentile', value: temperatureLabel(activeSummary.p95) },
              { label: 'Record high', value: `${temperatureLabel(activeSummary.max)} · ${active.highDates.join(', ')}` },
              { label: `${MONTHLY_NORMAL_BASELINE} normal`, value: temperatureLabel(active.normal) },
            ]} footer={`${selectedYear}: ${active.selected.length} daily observations overlaid.`} />)}
        </div>
      )}
    </ChartCard>
  )
}
