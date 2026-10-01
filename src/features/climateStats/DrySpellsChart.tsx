import { useRef } from 'react'
import { ChartCard } from '@/components/charts/ChartCard'
import { chartTheme } from '@/components/charts/chartTheme'
import type { ClimateDay } from '@/types/weather'
import { buildDrySpells } from './drySpells'
import { legendSwatch, useClimateChartHover } from './climateChartCommon'

const W = chartTheme.exportWidth
const LEFT = 230
const RIGHT = 90
const TOP = 62
const ROW = 34
const LIMIT = 20
const COLOR = '#c98a3a'

function dateLabel(date: string): string {
  const [year, month, day] = date.split('-')
  return `${day} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(month) - 1]} ${year}`
}

export function DrySpellsChart({ records, currentYear }: {
  readonly records: readonly ClimateDay[]
  readonly currentYear: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { containerRef, hover, handlers, Tooltip } = useClimateChartHover()
  const spells = buildDrySpells(records.filter((record) => record.date <= `${currentYear}-12-31`))
    .sort((a, b) => b.length - a.length || b.startDate.localeCompare(a.startDate))
    .slice(0, LIMIT)
  const max = Math.max(5, ...spells.map((spell) => spell.length))
  const ceiling = Math.ceil(max / 5) * 5
  const plot = W - LEFT - RIGHT
  const height = TOP + Math.max(1, spells.length) * ROW + 46
  const active = hover == null ? null : spells[hover.index]

  return (
    <ChartCard title="Dry spells" subtitle="Longest runs of at least five consecutive dry days"
      footnote="A dry day has no more than 0.1 mm of rainfall. Missing observations and calendar gaps break a spell; rainfall records begin in May 2020."
      minWidth={850} svgRef={svgRef}
      svgFilename={`wakefield-${currentYear}-dry-spells.svg`}
      pngFilename={`wakefield-${currentYear}-dry-spells.png`}
      legend={[{ label: 'Consecutive dry days', swatch: legendSwatch(COLOR) }]}>
      {spells.length === 0 ? <p className="normals-no-data">No dry spells of at least five days available.</p> : (
        <div ref={containerRef} className="chart-kit-canvas" style={{ position: 'relative' }}>
          <svg ref={svgRef} className="chart-kit-svg" viewBox={`0 0 ${W} ${height}`} role="img"
            aria-label={`Longest dry spells through ${currentYear}, in days`}
            style={{ width: '100%', height: 'auto' }}>
            {Array.from({ length: Math.floor(ceiling / 5) + 1 }, (_, i) => i * 5).map((value) => {
              const x = LEFT + value / ceiling * plot
              return <g key={value}>
                <line x1={x} x2={x} y1={TOP - 8} y2={TOP + spells.length * ROW}
                  stroke={chartTheme.colors.grid} />
                <text x={x} y={height - 16} textAnchor="middle" fill={chartTheme.colors.sub}
                  fontSize={chartTheme.fontSizes.tick}>{value}</text>
              </g>
            })}
            {spells.map((spell, index) => {
              const y = TOP + index * ROW
              return <g key={`${spell.startDate}-${spell.endDate}`}>
                <text x={LEFT - 12} y={y + ROW / 2} textAnchor="end" dominantBaseline="middle"
                  fill={chartTheme.colors.ink} fontSize={chartTheme.fontSizes.tick}>
                  {dateLabel(spell.startDate)}
                </text>
                <rect x={LEFT} y={y + 4} width={spell.length / ceiling * plot} height={ROW - 8}
                  rx={3} fill={COLOR} stroke={hover?.index === index ? chartTheme.colors.ink : 'none'}
                  strokeWidth={2} aria-label={`${spell.length} dry days, ${dateLabel(spell.startDate)} to ${dateLabel(spell.endDate)}`}
                  {...handlers(index)} />
                <text x={LEFT + spell.length / ceiling * plot + 7} y={y + ROW / 2}
                  dominantBaseline="middle" fill={chartTheme.colors.ink}
                  fontSize={chartTheme.fontSizes.tick} pointerEvents="none">{spell.length}</text>
              </g>
            })}
            <text x={LEFT + plot / 2} y={height - 1} textAnchor="middle"
              fill={chartTheme.colors.sub} fontSize={chartTheme.fontSizes.axisTitle}>Days</text>
          </svg>
          {active && <Tooltip title={`${active.length} consecutive dry days`}
            rows={[
              { label: 'Start', value: dateLabel(active.startDate) },
              { label: 'End', value: dateLabel(active.endDate) },
              { label: 'Length', value: `${active.length} days`, accentColor: COLOR },
            ]} />}
        </div>
      )}
    </ChartCard>
  )
}
