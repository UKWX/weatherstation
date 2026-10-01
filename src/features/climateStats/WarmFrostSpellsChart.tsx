import { useRef } from 'react'
import { ChartCard } from '@/components/charts/ChartCard'
import { chartTheme } from '@/components/charts/chartTheme'
import type { ClimateDay } from '@/types/weather'
import { frostSpells, longestFrostSpell, longestWarmSpell, warmSpells, type Spell } from './spells'
import { legendSwatch, useClimateChartHover } from './climateChartCommon'

const W = chartTheme.exportWidth
const H = 650
const LEFT = 80
const RIGHT = 38
const TOP = 44
const ZERO = 309
const RADIUS = 235
const WARM = chartTheme.colors.actualMax
const FROST = chartTheme.colors.actualMin

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
  const rows = Array.from({ length: Math.max(0, currentYear - 1994) + (winters.has(currentYear + 1) ? 1 : 0) }, (_, index) => 1995 + index)
    .map((year) => {
      const warmDays = warmYears.get(year) ?? []
      const winterDays = winters.get(year) ?? []
      return {
        year,
        warm: longestWarmSpell(warmDays),
        frost: longestFrostSpell(winterDays),
        warmDays,
        winterDays,
        hasWarmData: warmDays.some((day) => day.maxTempC != null),
        hasFrostData: winterDays.some((day) => day.minTempC != null),
      }
    })
  const warmTop = [...warmYears].flatMap(([year, days]) =>
    warmSpells(days).map((spell) => ({ year, spell })))
    .sort((a, b) => b.spell.length - a.spell.length).slice(0, 5)
  const frostTop = [...winters].flatMap(([year, days]) =>
    frostSpells(days).map((spell) => ({ year, spell })))
    .sort((a, b) => b.spell.length - a.spell.length).slice(0, 5)
  const longest = Math.max(1, ...rows.flatMap((row) => [row.warm?.length ?? 0, row.frost?.length ?? 0]))
  const scale = (days: number) => days / longest * RADIUS
  const col = (W - LEFT - RIGHT) / Math.max(1, rows.length)
  const active = hover == null ? null : rows[Math.floor(hover.index / 2)]
  const activeWarm = hover?.index != null && hover.index % 2 === 0
  const activeSpell = activeWarm ? active?.warm : active?.frost
  const spellDays = active == null || activeSpell == null ? [] :
    (activeWarm ? active.warmDays : active.winterDays)
      .filter((record) => record.date >= activeSpell.startDate && record.date <= activeSpell.endDate)
  const peak = spellDays.map((record) => record.maxTempC)
    .filter((value): value is number => value != null && Number.isFinite(value))
  const lowest = spellDays.map((record) => record.minTempC)
    .filter((value): value is number => value != null && Number.isFinite(value))

  return (
    <ChartCard title="Warm and frost spells"
      subtitle={`Wakefield daily temperatures, 1995–${currentYear}: longest warm run (≥25 °C high) per calendar year and frost run (<0 °C low) per July–June winter.`}
      footnote="Winter is labelled by its ending year, so December–January runs stay joined. Missing days break runs; a dash means no observations."
      svgRef={svgRef} svgFilename={`wakefield-${currentYear}-warm-frost-spells.svg`}
      pngFilename={`wakefield-${currentYear}-warm-frost-spells.png`}
      minWidth={710} legend={[
        { label: 'Warm spell', swatch: legendSwatch(WARM) },
        { label: 'Frost spell', swatch: legendSwatch(FROST) },
      ]}>
      {!records.some((record) => record.maxTempC != null || record.minTempC != null) ? <p className="normals-no-data">No chart data available.</p> : (<>
        <div ref={containerRef} className="chart-kit-canvas" style={{ position: 'relative' }}>
          <svg ref={svgRef} className="chart-kit-svg" viewBox={`0 0 ${W} ${H}`} role="img"
            aria-label="Mirrored warm spell lengths above zero and winter frost spell lengths below zero by year"
            style={{ width: '100%', height: 'auto' }}>
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
              const days = longest * fraction
              return (
                <g key={fraction}>
                  {[1, -1].map((direction) => (
                    <g key={direction}>
                      <line x1={LEFT} x2={W - RIGHT}
                        y1={ZERO - direction * scale(days)} y2={ZERO - direction * scale(days)}
                        stroke={fraction === 0 ? chartTheme.colors.ink : chartTheme.colors.grid}
                        strokeWidth={fraction === 0 ? 2 : 1} />
                      {fraction !== 0 && <text x={LEFT - 9} y={ZERO - direction * scale(days)}
                        textAnchor="end" dominantBaseline="middle" fill={chartTheme.colors.sub}
                        fontSize={chartTheme.fontSizes.tick}>{days.toFixed(days < 5 ? 1 : 0)} d</text>}
                    </g>
                  ))}
                  {fraction === 0 && <text x={LEFT - 9} y={ZERO} textAnchor="end"
                    dominantBaseline="middle" fill={chartTheme.colors.ink}
                    fontSize={chartTheme.fontSizes.tick}>0</text>}
                </g>
              )
            })}
            <text x={LEFT + 8} y={TOP - 8} fill={WARM} fontSize={chartTheme.fontSizes.axisTitle}>
              ▲ Longest warm spell (days ≥ 25°C)
            </text>
            <text x={LEFT + 8} y={ZERO + RADIUS + 20} fill={FROST} fontSize={chartTheme.fontSizes.axisTitle}>
              ▼ Longest frost spell (consecutive air frosts)
            </text>
            {rows.map((row, i) => {
              const x = LEFT + (i + 0.5) * col
              const barWidth = Math.max(5, Math.min(24, col * 0.58))
              return (
                <g key={row.year}>
                  {(i % Math.max(1, Math.ceil(rows.length / 12)) === 0 || i === rows.length - 1) &&
                    <text x={x} y={H - 15} textAnchor="middle"
                      fill={row.year === currentYear ? chartTheme.colors.ink : chartTheme.colors.sub}
                      fontWeight={row.year === currentYear ? 700 : undefined}
                      fontSize={chartTheme.fontSizes.tick}>{row.year}</text>}
                  {([
                    { spell: row.warm, available: row.hasWarmData, color: WARM, label: 'warm', direction: -1 },
                    { spell: row.frost, available: row.hasFrostData, color: FROST, label: 'frost', direction: 1 },
                  ] as const).map((series, j) => (
                    <g key={series.label}>
                      {series.spell != null && (
                        <rect x={x - barWidth / 2}
                          y={series.direction === -1 ? ZERO - scale(series.spell.length) : ZERO}
                          width={barWidth} height={scale(series.spell.length)} rx={2}
                          fill={series.color}
                          fillOpacity={row.year === (j === 0 ? currentYear : currentYear + 1) ? 1 : 0.75} />
                      )}
                      {!series.available && (
                        <text x={x} y={ZERO + (j === 0 ? -8 : 17)} textAnchor="middle"
                          fill={chartTheme.colors.sub} fontSize={chartTheme.fontSizes.tick}>—</text>
                      )}
                      <rect x={LEFT + i * col} y={j === 0 ? ZERO - RADIUS : ZERO}
                        width={col} height={RADIUS}
                        fill="transparent" stroke={hover?.index === i * 2 + j ? chartTheme.colors.monthLine : 'none'}
                        aria-label={`${j === 0 ? row.year : `Winter ${row.year - 1}–${row.year}`} ${series.label} spell: ${series.available ? describe(series.spell) : 'No observations'}`}
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
              }, ...(activeSpell == null ? [] : [{
                label: activeWarm ? 'Peak high' : 'Lowest low',
                value: `${(activeWarm ? Math.max(...peak) : Math.min(...lowest)).toFixed(1)} °C`,
              }])]}
              footer={activeSpell?.ongoing && active.year === (activeWarm ? currentYear : currentYear + 1) ? 'Ongoing at the end of available records' : undefined} />
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem', padding: '1rem' }}>
          {([
            { title: 'Five longest warm spells', entries: warmTop },
            { title: 'Five longest frost spells', entries: frostTop },
          ]).map(({ title, entries }) => (
            <div key={title}>
              <h3>{title}</h3>
              {entries.length === 0 ? <p>No qualifying spells.</p> : (
                <table>
                  <thead><tr><th scope="col">Year</th><th scope="col">Days</th><th scope="col">Dates</th></tr></thead>
                  <tbody>{entries.map(({ year, spell }) => {
                    return <tr key={`${year}-${spell.startDate}`}>
                      <th scope="row">{year}</th>
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
