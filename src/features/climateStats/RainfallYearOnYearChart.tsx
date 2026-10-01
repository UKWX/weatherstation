import { useMemo, useRef, useState } from 'react'
import { ChartCard, ChartTooltip, chartTheme, positionTooltip, useChartHover } from '@/components/charts'
import { dailyCumulativeNormal } from '@/features/normals/rainfallNormals'
import { buildCumulativeRainfall } from './rainfallYearOnYear'
import type { ClimateDay } from '@/types/weather'

const W = 1400
const H = 520
const L = 66
const R = 165
const T = 35
const B = 60
const x = (day: number) => L + (day / 364) * (W - L - R)
const y = (amount: number, top: number) => H - B - amount / top * (H - T - B)
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const { rainfallPast, rainfallCurrent, rainfallNormal } = chartTheme.colors

export function RainfallYearOnYearChart({ records, currentYear }: { readonly records: readonly ClimateDay[]; readonly currentYear: number }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hidden, setHidden] = useState<ReadonlySet<number>>(new Set())
  const hover = useChartHover({ count: 365, containerRef })
  const years = useMemo(() => Array.from({ length: Math.max(0, currentYear - 2019) }, (_, index) => 2020 + index), [currentYear])
  const series = useMemo(() => years.map((year) => {
    const points = buildCumulativeRainfall(records, year).map((point) => {
      const month = Number(point.date.slice(5, 7))
      const day = Number(point.date.slice(8, 10))
      const index = Math.round((Date.UTC(2025, month - 1, Math.min(day, month === 2 ? 28 : day)) - Date.UTC(2025, 0, 1)) / 86400000)
      return { ...point, index }
    })
    const aligned = new Map<number, number>()
    points.forEach((point) => aligned.set(point.index, point.totalMm))
    return { year, points: [...aligned].map(([index, totalMm]) => ({ index, totalMm })).sort((a, b) => a.index - b.index) }
  }), [records, years])
  const normal = useMemo(() => dailyCumulativeNormal(2025), [])
  const max = Math.max(750, ...series.flatMap((item) => item.points.map((point) => point.totalMm))) * 1.08
  const visible = series.filter((item) => !hidden.has(item.year))
  const active = hover.activeIndex
  const tooltipRows = active == null ? [] : visible.flatMap((item) => {
    const point = item.points.find((entry) => entry.index === active)
    return point == null ? [] : [{ label: String(item.year), value: `${point.totalMm.toFixed(1)} mm`, accentColor: item.year === currentYear ? '#2f5fa8' : '#8a94a0', amount: point.totalMm }]
  }).sort((a, b) => b.amount - a.amount)
  const day = active == null ? null : new Date(Date.UTC(2025, 0, active + 1))
  return (
    <div ref={containerRef} style={{ position: 'relative', minWidth: 0 }}>
      <ChartCard title="Rainfall year on year" subtitle={`Station rainfall since 2020 · 1991–2020 average · visible years: ${visible.map((item) => item.year).join(', ') || 'none'}`} footnote="Leap-day rainfall is added to 28 February. The 2020 record begins in May." minWidth={W}
        legend={[{ label: 'Current year', swatch: <span style={{ color: rainfallCurrent }}>━</span> }, { label: 'Past years', swatch: <span style={{ color: rainfallPast }}>━</span> }, { label: '1991–2020 average', swatch: <span style={{ color: rainfallNormal }}>┄</span> }]}
        svgRef={svgRef} svgFilename={`wakefield-${currentYear}-rainfall-year-on-year.svg`} pngFilename={`wakefield-${currentYear}-rainfall-year-on-year.png`}>
        {series.some((item) => item.points.length) ? <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Cumulative rainfall by year">
          {[0, 200, 400, 600, 800].filter((value) => value <= max).map((value) => <g key={value}><line x1={L} x2={W - R} y1={y(value, max)} y2={y(value, max)} stroke="#e4e8ec" /><text x={L - 8} y={y(value, max) + 4} textAnchor="end" fill="#5b6773" fontSize="12">{value} mm</text></g>)}
          {months.map((month, index) => <text key={month} x={x(Math.round((Date.UTC(2025, index, 15) - Date.UTC(2025, 0, 1)) / 86400000))} y={H - 20} textAnchor="middle" fill="#5b6773" fontSize="12">{month}</text>)}
          <polyline fill="none" stroke={rainfallNormal} strokeWidth="2.2" strokeDasharray="6 5" points={normal.map((value, index) => `${x(index)},${y(value, max)}`).join(' ')} />
          <text x={W - R + 6} y={y(normal.at(-1)!, max)} fill={rainfallNormal} fontSize="12">1991–2020 average (657 mm)</text>
          {visible.map((item) => <g key={item.year}><polyline fill="none" stroke={item.year === currentYear ? rainfallCurrent : rainfallPast} strokeWidth={item.year === currentYear ? 3 : 1.3} opacity={item.year === currentYear ? 1 : .6} points={item.points.map((point) => `${x(point.index)},${y(point.totalMm, max)}`).join(' ')} />
            {item.points.length ? <text x={W - R + 6} y={y(item.points.at(-1)!.totalMm, max) + (item.year - 2020) * 2} fill={item.year === currentYear ? rainfallCurrent : rainfallPast} fontSize="11">{item.year}{item.year === 2020 ? ' (partial)' : ''}: {item.points.at(-1)!.totalMm.toFixed(0)} mm</text> : null}</g>)}
          {active != null ? <line x1={x(active)} x2={x(active)} y1={T} y2={H - B} stroke="#8a94a0" data-export-ignore="true" /> : null}
          <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" {...hover.overlayProps} aria-label="Explore rainfall by date" data-export-ignore="true" />
        </svg> : <p>No rainfall observations available.</p>}
      </ChartCard>
      <div className="chart-kit-legend" aria-label="Toggle rainfall years">{years.map((year) => <label key={year} style={{ marginRight: 12 }}><input type="checkbox" checked={!hidden.has(year)} onChange={() => setHidden((current) => { const next = new Set(current); if (next.has(year)) next.delete(year); else next.add(year); return next })} /> {year}</label>)}</div>
      {day && hover.clientX != null && hover.clientY != null && containerRef.current ? <ChartTooltip title={`${day.getUTCDate()} ${months[day.getUTCMonth()]}`} rows={[...tooltipRows, { label: '1991–2020 average', value: `${normal[active!]!.toFixed(1)} mm`, accentColor: '#555b61' }]} style={{ position: 'absolute', ...positionTooltip(hover.clientX, hover.clientY, 260, 220, containerRef.current.getBoundingClientRect()) }} /> : null}
    </div>
  )
}
