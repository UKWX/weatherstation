import { useRef, useState } from 'react'
import { ChartCard } from '@/components/charts/ChartCard'
import { chartTheme, MONTH_SHORT } from '@/components/charts/chartTheme'
import { TEMP_MONTHLY_NORMALS_C } from '@/features/normals/temperatureNormals'
import type { ClimateDay } from '@/types/weather'
import { buildOnThisDayRows, rankOnThisDay } from './onThisDay'
import { legendSwatch, temperatureLabel, useClimateChartHover } from './climateChartCommon'

const W = chartTheme.exportWidth
const H = 570
const LEFT = 83
const RIGHT = 36
const TOP = 50
const BOTTOM = 70
const MAX_COLOR = chartTheme.colors.actualMax
const MIN_COLOR = chartTheme.colors.actualMin

export function TodayEveryYearChart({
  records, month, day, currentYear,
}: {
  readonly records: readonly ClimateDay[]
  readonly month: number
  readonly day: number
  readonly currentYear: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { containerRef, hover, handlers, Tooltip } = useClimateChartHover()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const rows = buildOnThisDayRows(records, month, day).filter((row) => row.year <= currentYear)
  const byDate = new Map<string, ClimateDay>(records.map((record) => [record.date, record]))
  const highs = rows.map((row) => row.maxC).filter((value): value is number => value != null)
  const lows = rows.map((row) => row.minC).filter((value): value is number => value != null)
  const maxNormal = TEMP_MONTHLY_NORMALS_C.max[month - 1]
  const minNormal = TEMP_MONTHLY_NORMALS_C.min[month - 1]
  const values = [...highs, ...lows, maxNormal, minNormal].filter((value): value is number => value != null)
  const lower = Math.floor(Math.min(...values, 0) / 5) * 5 - 5
  const upper = Math.ceil(Math.max(...values, 5) / 5) * 5 + 5
  const firstYear = rows[0]?.year ?? currentYear
  const span = Math.max(1, currentYear - firstYear)
  const x = (year: number) => LEFT + (year - firstYear) / span * (W - LEFT - RIGHT)
  const y = (temp: number) => TOP + (upper - temp) / (upper - lower) * (H - TOP - BOTTOM)
  const active = hover == null ? null : rows[hover.index]
  const dateLabel = `${MONTH_SHORT[month - 1] ?? 'Month'} ${day}`
  const highlightedYear = Math.min(selectedYear, currentYear)
  const todayRecord = active == null ? null :
    byDate.get(`${active.year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)

  return (
    <ChartCard title="Today vs every year"
      subtitle={`${dateLabel}: daily highs and lows, compared across years since 1995.`}
      footnote={month === 2 && day === 29 ? '29 February appears only in leap years.' :
        'Dashed reference lines show monthly normals; hollow points mark provisional observations.'}
      headerAside={
        <label>Highlight year{' '}
          <select value={highlightedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
            {Array.from({ length: Math.max(1, currentYear - 1994) }, (_, i) => 1995 + i).map((year) =>
              <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      }
      svgRef={svgRef} svgFilename={`today-every-year-${month}-${day}.svg`}
      pngFilename={`today-every-year-${month}-${day}.png`} minWidth={730}
      legend={[
        { label: 'Daily high', swatch: legendSwatch(MAX_COLOR) },
        { label: 'Daily low', swatch: legendSwatch(MIN_COLOR) },
        { label: 'Monthly normals', swatch: <span className="chart-kit-swatch" style={{ borderStyle: 'dashed', borderColor: chartTheme.colors.bandEdge }} /> },
      ]}>
      {highs.length + lows.length === 0 ? <p className="normals-no-data">No chart data available for this date.</p> : (
        <div ref={containerRef} className="chart-kit-canvas" style={{ position: 'relative' }}>
          <svg ref={svgRef} className="chart-kit-svg" viewBox={`0 0 ${W} ${H}`}
            role="img" aria-label={`Daily maximum and minimum temperatures on ${dateLabel} by year`}
            style={{ width: '100%', height: 'auto' }}>
            {Array.from({ length: 6 }, (_, i) => {
              const value = lower + (upper - lower) * i / 5
              return <g key={i}>
                <line x1={LEFT} x2={W - RIGHT} y1={y(value)} y2={y(value)}
                  stroke={chartTheme.colors.grid} />
                <text x={LEFT - 8} y={y(value)} dominantBaseline="middle" textAnchor="end"
                  fill={chartTheme.colors.sub} fontSize={chartTheme.fontSizes.tick}>{value.toFixed(0)} °C</text>
              </g>
            })}
            {[
              { value: maxNormal, color: MAX_COLOR },
              { value: minNormal, color: MIN_COLOR },
            ].map(({ value, color }, i) => value == null ? null : (
              <line key={i} x1={LEFT} x2={W - RIGHT} y1={y(value)} y2={y(value)}
                stroke={color} strokeDasharray="6 5" strokeWidth={chartTheme.strokeWidths.thin} />
            ))}
            {rows.filter((row) => row.year === highlightedYear).map((row) =>
              <line key={row.year} x1={x(row.year)} x2={x(row.year)} y1={TOP} y2={H - BOTTOM}
                stroke={chartTheme.colors.monthLine} strokeDasharray="3 3" />)}
            {rows.map((row, index) => {
              const provisional = byDate.get(`${row.year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)?.status !== 'finalised'
              return <g key={row.year}>
                {([
                  { value: row.maxC, color: MAX_COLOR },
                  { value: row.minC, color: MIN_COLOR },
                ] as const).map(({ value, color }, series) => value == null ? null : (
                  <circle key={series} cx={x(row.year)} cy={y(value)}
                    r={row.year === highlightedYear ? 6 : 4}
                    fill={provisional ? '#fff' : color} stroke={color}
                    strokeWidth={row.year === highlightedYear ? 2.8 : 1.5} />
                ))}
                <rect x={x(row.year) - 10} y={TOP} width={20} height={H - TOP - BOTTOM}
                  fill="transparent" aria-label={`${row.year}: high ${temperatureLabel(row.maxC)}, low ${temperatureLabel(row.minC)}`}
                  {...handlers(index)} />
              </g>
            })}
            {Array.from({ length: Math.min(7, currentYear - firstYear + 1) }, (_, i) => {
              const year = Math.round(firstYear + span * i / Math.max(1, Math.min(6, currentYear - firstYear)))
              return <text key={i} x={x(year)} y={H - 27} textAnchor="middle"
                fill={chartTheme.colors.sub} fontSize={chartTheme.fontSizes.tick}>{year}</text>
            })}
          </svg>
          {active != null && <Tooltip title={`${dateLabel}, ${active.year}`} rows={[
            { label: 'High', value: temperatureLabel(active.maxC), accentColor: MAX_COLOR },
            { label: 'Low', value: temperatureLabel(active.minC), accentColor: MIN_COLOR },
            ...(active.maxC == null ? [] : [{ label: 'High rank (warmest first)', value: `#${rankOnThisDay(highs, active.maxC)}` }]),
            ...(active.minC == null ? [] : [{ label: 'Low rank (coldest first)', value: `#${rankOnThisDay(lows, active.minC, false)}` }]),
          ]} footer={todayRecord?.status !== 'finalised' ? 'Provisional; equal values share a rank.' : 'Equal values share a rank.'} />}
        </div>
      )}
    </ChartCard>
  )
}
