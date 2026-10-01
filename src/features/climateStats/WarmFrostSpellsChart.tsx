import { useRef } from 'react'
import { ChartCard } from '@/components/charts/ChartCard'
import { chartTheme } from '@/components/charts/chartTheme'
import type { ClimateDay } from '@/types/weather'
import { longestFrostSpell, longestWarmSpell, type Spell } from './spells'
import { legendSwatch, useClimateChartHover } from './climateChartCommon'

const W = chartTheme.exportWidth
const LEFT = 100
const RIGHT = 65
const TOP = 54
const ROW = 35
const WARM = '#d85b2a'
const FROST = '#3478b9'

function describe(spell: Spell | null): string {
  return spell == null ? 'No qualifying days' :
    `${spell.length} ${spell.length === 1 ? 'day' : 'days'} (${spell.startDate} – ${spell.endDate})`
}

export function WarmFrostSpellsChart({ records, currentYear }: {
  readonly records: readonly ClimateDay[]
  readonly currentYear: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { containerRef, hover, handlers, Tooltip } = useClimateChartHover()
  const warmYears = new Map<number, ClimateDay[]>()
  const winters = new Map<number, ClimateDay[]>()
  for (const record of records) {
    const year = Number(record.date.slice(0, 4))
    if (year < 1994 || year > currentYear || !Number.isFinite(year)) continue
    const month = Number(record.date.slice(5, 7))
    const winter = month >= 7 ? year + 1 : year
    if (year >= 1995) warmYears.set(year, [...(warmYears.get(year) ?? []), record])
    if (winter >= 1995) winters.set(winter, [...(winters.get(winter) ?? []), record])
  }
  const rows = [...new Set([...warmYears.keys(), ...winters.keys()])].sort((a, b) => a - b)
    .map((year) => {
      const warmDays = warmYears.get(year) ?? []
      const winterDays = winters.get(year) ?? []
      return {
        year,
        warm: longestWarmSpell(warmDays),
        frost: longestFrostSpell(winterDays),
        hasWarmData: warmDays.some((day) => day.maxTempC != null),
        hasFrostData: winterDays.some((day) => day.minTempC != null),
      }
    })
  const warmTop = rows.filter((row) => row.warm != null)
    .sort((a, b) => (b.warm?.length ?? 0) - (a.warm?.length ?? 0)).slice(0, 5)
  const frostTop = rows.filter((row) => row.frost != null)
    .sort((a, b) => (b.frost?.length ?? 0) - (a.frost?.length ?? 0)).slice(0, 5)
  const longest = Math.max(1, ...rows.flatMap((row) => [row.warm?.length ?? 0, row.frost?.length ?? 0]))
  const scale = (days: number) => days / longest * (W - LEFT - RIGHT)
  const height = TOP + rows.length * ROW + 42
  const active = hover == null ? null : rows[Math.floor(hover.index / 2)]
  const activeWarm = hover?.index != null && hover.index % 2 === 0

  return (
    <ChartCard title="Warm and frost spells"
      subtitle="Longest warm run (≥25 °C high) per calendar year and frost run (<0 °C low) per July–June winter."
      footnote="Winter is labelled by its ending year, so December–January runs stay joined. Missing days break runs; a dash means no observations."
      svgRef={svgRef} svgFilename="warm-frost-spells.svg" pngFilename="warm-frost-spells.png"
      minWidth={710} legend={[
        { label: 'Warm spell', swatch: legendSwatch(WARM) },
        { label: 'Frost spell', swatch: legendSwatch(FROST) },
      ]}>
      {rows.length === 0 ? <p className="normals-no-data">No chart data available.</p> : (<>
        <div ref={containerRef} className="chart-kit-canvas" style={{ position: 'relative' }}>
          <svg ref={svgRef} className="chart-kit-svg" viewBox={`0 0 ${W} ${height}`} role="img"
            aria-label="Longest warm spells by calendar year and frost spells by July to June winter"
            style={{ width: '100%', height: 'auto' }}>
            {Array.from({ length: 6 }, (_, i) => {
              const days = longest * i / 5
              return (
                <g key={i}>
                  <line x1={LEFT + scale(days)} x2={LEFT + scale(days)} y1={TOP - 18}
                    y2={height - 36} stroke={chartTheme.colors.grid} />
                  <text x={LEFT + scale(days)} y={height - 12} textAnchor="middle"
                    fill={chartTheme.colors.sub} fontSize={chartTheme.fontSizes.tick}>
                    {days.toFixed(days < 5 ? 1 : 0)} days
                  </text>
                </g>
              )
            })}
            {rows.map((row, i) => {
              const y = TOP + i * ROW
              return (
                <g key={row.year}>
                  <text x={LEFT - 13} y={y + 7} textAnchor="end" dominantBaseline="middle"
                    fill={chartTheme.colors.sub} fontSize={chartTheme.fontSizes.tick}>{row.year}</text>
                  {([
                    { spell: row.warm, available: row.hasWarmData, color: WARM, label: 'warm' },
                    { spell: row.frost, available: row.hasFrostData, color: FROST, label: 'frost' },
                  ] as const).map((series, j) => (
                    <g key={series.label}>
                      {series.spell != null && (
                        <rect x={LEFT} y={y + j * 15} width={scale(series.spell.length)}
                          height={12} rx={2} fill={series.color} />
                      )}
                      {!series.available && (
                        <text x={LEFT + 4} y={y + j * 15 + 10} fill={chartTheme.colors.sub}
                          fontSize={chartTheme.fontSizes.tick}>—</text>
                      )}
                      <rect x={LEFT} y={y + j * 15 - 1} width={W - LEFT - RIGHT} height={15}
                        fill="transparent" stroke={hover?.index === i * 2 + j ? chartTheme.colors.monthLine : 'none'}
                        aria-label={`${row.year} ${series.label} spell: ${series.available ? describe(series.spell) : 'No observations'}`}
                        {...handlers(i * 2 + j)} />
                    </g>
                  ))}
                </g>
              )
            })}
          </svg>
          {active != null && (
            <Tooltip title={activeWarm ? `${active.year} warm spell` : `Winter ${active.year - 1}–${active.year} frost spell`}
              rows={[{
                label: 'Longest run',
                value: (activeWarm ? active.hasWarmData : active.hasFrostData)
                  ? describe(activeWarm ? active.warm : active.frost) : 'No observations',
                accentColor: activeWarm ? WARM : FROST,
              }]}
              footer={(activeWarm ? active.warm : active.frost)?.ongoing ? 'Continuing at the end of available records' : undefined} />
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', padding: '1rem' }}>
          {([
            { title: 'Five longest annual warm spells', entries: warmTop, key: 'warm' as const },
            { title: 'Five longest winter frost spells', entries: frostTop, key: 'frost' as const },
          ]).map(({ title, entries, key }) => (
            <div key={key}>
              <h3>{title}</h3>
              {entries.length === 0 ? <p>No qualifying spells.</p> : (
                <table>
                  <thead><tr><th scope="col">Year</th><th scope="col">Days</th><th scope="col">Dates</th></tr></thead>
                  <tbody>{entries.map((row) => {
                    const spell = row[key]!
                    return <tr key={row.year}>
                      <th scope="row">{row.year}</th>
                      <td>{spell.length}</td>
                      <td>{spell.startDate} – {spell.endDate}</td>
                    </tr>
                  })}</tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      </>)}
    </ChartCard>
  )
}
