import { useRef, useState } from 'react'
import { ChartCard, ChartTooltip, positionTooltip } from '@/components/charts'
import { ANNUAL_RAIN_NORMAL_MM, normalToDate, RAIN_MONTHLY_NORMALS_MM } from '@/features/normals/rainfallNormals'
import { buildRainfallGrid } from './rainfallGrid'
import type { ClimateDay } from '@/types/weather'

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const W = 1010
const cellWidth = 69
const rowHeight = 39
function blend(color: string, intensity: number): string {
  const rgb = color.match(/\w\w/g)?.map((part) => parseInt(part, 16)) ?? [255, 255, 255]
  return `rgb(${rgb.map((channel) => Math.round(245 + (channel - 245) * Math.min(1, intensity))).join(',')})`
}
export function RainfallGridChart({ records, currentYear }: { readonly records: readonly ClimateDay[]; readonly currentYear: number }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<{ year: number; month: number; x: number; y: number } | null>(null)
  const years = Array.from({ length: Math.max(0, currentYear - 2019) }, (_, i) => i + 2020)
  const cells = buildRainfallGrid(records, 2020, currentYear)
  const height = 100 + years.length * rowHeight
  const selected = active && active.month < 13 ? cells.find((cell) => cell.year === active.year && cell.month === active.month) : null
  const latest = records.filter((record) => record.rainfallMm != null && record.date.startsWith(String(currentYear))).map((record) => record.date).sort().at(-1)
  function paint(percent: number | null): string { return percent == null ? '#f5f7f9' : blend(percent >= 100 ? '#2f5fa8' : '#c98a3a', percent >= 100 ? (percent - 100) / 150 : (100 - percent) / 100) }
  return <div ref={containerRef} style={{ position: 'relative', minWidth: 0 }}>
    <ChartCard title="Rainfall grid" subtitle="Station rainfall since 2020 · 1991–2020 average" footnote="Drier / Wetter than the 1991–2020 average. 2020 rainfall begins in May." minWidth={W}
      legend={[{ label: 'Drier', swatch: <span style={{ color: '#c98a3a' }}>■</span> }, { label: 'Average', swatch: <span style={{ color: '#f5f7f9' }}>■</span> }, { label: 'Wetter', swatch: <span style={{ color: '#2f5fa8' }}>■</span> }]}
      svgRef={svgRef} svgFilename={`wakefield-${currentYear}-rainfall-grid.svg`} pngFilename={`wakefield-${currentYear}-rainfall-grid.png`}>
      {cells.some((cell) => cell.totalMm != null) ? <svg ref={svgRef} viewBox={`0 0 ${W} ${height}`} width={W} height={height} role="grid" aria-label="Rainfall percentage of average by month and year">
        {months.concat('Year').map((label, month) => <text key={label} x={78 + month * cellWidth + 30} y={29} fontSize="13" textAnchor="middle" fill="#555b61">{label}</text>)}
        {years.map((year, index) => {
          const yearCells = cells.filter((cell) => cell.year === year)
          const sum = yearCells.reduce((total, cell) => total + (cell.totalMm ?? 0), 0)
          const yearPercent = sum / (year === currentYear && latest ? normalToDate(currentYear, latest) : ANNUAL_RAIN_NORMAL_MM) * 100
          return <g key={year}><text x={65} y={58 + index * rowHeight} textAnchor="end" fontSize="13" fill="#1c2530">{year}</text>
            {Array.from({ length: 13 }, (_, m) => {
              const cell = yearCells[m]
              const pct = m === 12 ? (sum > 0 ? yearPercent : null) : cell?.percent ?? null
              const x = 78 + m * cellWidth
              const y = 39 + index * rowHeight
              const observations = records.filter((row) => row.date.startsWith(`${year}-${String(m + 1).padStart(2, '0')}`) && row.rainfallMm != null).length
              const totalDays = new Date(Date.UTC(year, m + 1, 0)).getUTCDate()
              const partial = m !== 12 && (year === currentYear && m + 1 === Number(latest?.slice(5, 7)) || observations < Math.ceil(totalDays * .9))
              return <g key={m} opacity={partial ? .4 : 1}>
                <rect x={x} y={y} width={cellWidth - 4} height={rowHeight - 5} rx="5" fill={paint(pct)} stroke="#e4e8ec" tabIndex={0} role="gridcell" aria-label={`${months[m] ?? 'Year'} ${year}: ${pct == null ? 'unavailable' : `${Math.round(pct)}%`}`}
                  onPointerEnter={(event) => setActive({ year, month: m + 1, x: event.clientX, y: event.clientY })} onPointerMove={(event) => setActive({ year, month: m + 1, x: event.clientX, y: event.clientY })} onPointerLeave={() => setActive(null)}
                  onFocus={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); setActive({ year, month: m + 1, x: bounds.left, y: bounds.top }) }} onBlur={() => setActive(null)}
                  onKeyDown={(event) => { if (event.key.startsWith('Arrow')) { event.preventDefault(); const items = Array.from(event.currentTarget.closest('svg')?.querySelectorAll<SVGRectElement>('[role="gridcell"]') ?? []); const at = items.indexOf(event.currentTarget); items[Math.max(0, Math.min(items.length - 1, at + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -13 : 13)))]?.focus() } }} />
                {pct != null && <text x={x + 31} y={y + 22} fontSize="12" textAnchor="middle" pointerEvents="none" fill="#1c2530">{Math.round(pct)}%{m === 12 && year === currentYear ? ' YTD' : ''}</text>}
              </g>
            })}
          </g>
        })}
      </svg> : <p>No rainfall observations available.</p>}
    </ChartCard>
    {active && containerRef.current ? <ChartTooltip title={`${months[active.month - 1] ?? 'Year'} ${active.year}`} rows={[
      { label: 'Rainfall', value: `${selected?.totalMm.toFixed(1) ?? '—'} mm` },
      { label: '1991–2020 average', value: `${RAIN_MONTHLY_NORMALS_MM[active.month - 1] ?? ANNUAL_RAIN_NORMAL_MM} mm` },
      { label: 'Of average', value: `${Math.round(selected?.percent ?? 0)}%` },
      { label: 'Rain days', value: selected?.rainDays ?? '—' },
    ]} style={{ position: 'absolute', ...positionTooltip(active.x, active.y, 230, 160, containerRef.current.getBoundingClientRect()) }} /> : null}
  </div>
}
