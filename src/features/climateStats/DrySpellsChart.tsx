import { useRef } from 'react'
import { ChartCard } from '@/components/charts/ChartCard'
import { chartTheme, MONTH_SHORT } from '@/components/charts/chartTheme'
import type { ClimateDay } from '@/types/weather'
import { buildDrySpells, type DrySpell } from './drySpells'
import { legendSwatch, useClimateChartHover } from './climateChartCommon'

const W = chartTheme.exportWidth
const LEFT = 98
const RIGHT = 88
const TOP = 66
const ROW = 54
const BAR_HEIGHT = 18
const COLOR = '#c98a3a'
const HIGHLIGHT = '#a35b12'
const DAY_MS = 86_400_000

function dateLabel(date: string): string {
  const [year, month, day] = date.split('-')
  return `${Number(day)} ${MONTH_SHORT[Number(month) - 1]} ${year}`
}

function dayIndex(date: string, year: number): number {
  return (Date.parse(`${date}T00:00:00Z`) - Date.UTC(year, 0, 1)) / DAY_MS
}

interface SpellSegment {
  readonly spell: DrySpell
  readonly year: number
  readonly start: number
  readonly end: number
  readonly days: number
}

export function DrySpellsChart({
  records,
  currentYear,
}: {
  readonly records: readonly ClimateDay[]
  readonly currentYear: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { containerRef, hover, handlers, Tooltip } = useClimateChartHover()
  const years = Array.from(
    { length: Math.max(0, currentYear - 2019) },
    (_, index) => 2020 + index,
  )
  const eligible = records.filter(
    (record) => record.date <= `${currentYear}-12-31`,
  )
  const spells = buildDrySpells(eligible)
  const latest = eligible
    .map((record) => record.date)
    .sort()
    .at(-1)
  const longest = [...spells].sort(
    (a, b) => b.length - a.length || a.startDate.localeCompare(b.startDate),
  )[0]
  const plotWidth = W - LEFT - RIGHT
  const height = TOP + Math.max(years.length, 1) * ROW + 46
  const x = (day: number, daysInYear: number) =>
    LEFT + (day / daysInYear) * plotWidth
  const segments: SpellSegment[] = spells.flatMap((spell) => {
    const first = Math.max(2020, Number(spell.startDate.slice(0, 4)))
    const last = Math.min(currentYear, Number(spell.endDate.slice(0, 4)))
    return Array.from(
      { length: Math.max(0, last - first + 1) },
      (_, offset) => {
        const year = first + offset
        const start = Math.max(0, dayIndex(spell.startDate, year))
        const end = Math.min(
          dayIndex(`${year + 1}-01-01`, year),
          dayIndex(spell.endDate, year) + 1,
        )
        return { spell, year, start, end, days: end - start }
      },
    )
  })
  const longestByYear = new Map<number, SpellSegment>()
  for (const segment of segments) {
    const best = longestByYear.get(segment.year)
    if (best == null || segment.days > best.days) {
      longestByYear.set(segment.year, segment)
    }
  }
  const active = hover == null ? null : segments[hover.index]

  return (
    <ChartCard
      title="Dry spells"
      subtitle="Runs of at least five consecutive dry days, by calendar year · station rainfall since 2020"
      footnote={
        <>
          Dry: less than 0.2 mm rainfall. Missing observations and calendar
          gaps break a run; records begin in May 2020.
          {longest && (
            <>
              {' '}
              Longest overall: {longest.length} days (
              {dateLabel(longest.startDate)}
              {' – '}
              {dateLabel(longest.endDate)}).
            </>
          )}
        </>
      }
      minWidth={850}
      svgRef={svgRef}
      svgFilename={`wakefield-${currentYear}-dry-spells.svg`}
      pngFilename={`wakefield-${currentYear}-dry-spells.png`}
      legend={[
        { label: 'Dry spell', swatch: legendSwatch(COLOR) },
        { label: 'Longest in year', swatch: legendSwatch(HIGHLIGHT) },
      ]}
    >
      {years.length === 0 || !eligible.some((record) => record.rainfallMm != null) ? (
        <p className="normals-no-data">No rainfall observations available.</p>
      ) : (
        <div
          ref={containerRef}
          className="chart-kit-canvas"
          style={{ position: 'relative' }}
        >
          <svg
            ref={svgRef}
            className="chart-kit-svg"
            viewBox={`0 0 ${W} ${height}`}
            role="img"
            aria-label={`Dry spells of at least five days on yearly timelines from 2020 to ${currentYear}`}
            style={{ width: '100%', height: 'auto' }}
          >
            {MONTH_SHORT.map((month, index) => (
              <text
                key={month}
                x={x(
                  (Date.UTC(2025, index, 15) - Date.UTC(2025, 0, 1)) / DAY_MS,
                  365,
                )}
                y={TOP - 24}
                textAnchor="middle"
                fill={chartTheme.colors.sub}
                fontSize={chartTheme.fontSizes.monthHeader}
              >
                {month}
              </text>
            ))}
            {years.map((year, row) => {
              const daysInYear = dayIndex(`${year + 1}-01-01`, year)
              const rowY = TOP + row * ROW
              return (
                <g key={year}>
                  <text
                    x={LEFT - 12}
                    y={rowY + BAR_HEIGHT / 2}
                    textAnchor="end"
                    dominantBaseline="middle"
                    fill={chartTheme.colors.ink}
                    fontSize={chartTheme.fontSizes.tick}
                  >
                    {year}
                  </text>
                  <line
                    x1={LEFT}
                    x2={LEFT + plotWidth}
                    y1={rowY + BAR_HEIGHT / 2}
                    y2={rowY + BAR_HEIGHT / 2}
                    stroke={chartTheme.colors.grid}
                    strokeWidth={BAR_HEIGHT}
                  />
                  {Array.from({ length: 13 }, (_, month) => (
                    <line
                      key={month}
                      x1={x(
                        dayIndex(
                          `${year + Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, '0')}-01`,
                          year,
                        ),
                        daysInYear,
                      )}
                      x2={x(
                        dayIndex(
                          `${year + Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, '0')}-01`,
                          year,
                        ),
                        daysInYear,
                      )}
                      y1={rowY - 4}
                      y2={rowY + BAR_HEIGHT + 4}
                      stroke={chartTheme.colors.monthLine}
                    />
                  ))}
                </g>
              )
            })}
            {segments.map((segment, index) => {
              const daysInYear = dayIndex(
                `${segment.year + 1}-01-01`,
                segment.year,
              )
              const rowY = TOP + (segment.year - 2020) * ROW
              const highlighted = longestByYear.get(segment.year) === segment
              const startX = x(segment.start, daysInYear)
              const endX = x(segment.end, daysInYear)
              const ongoing =
                segment.spell.endDate === latest &&
                segment.year === Number(latest?.slice(0, 4))
              return (
                <g key={`${segment.year}-${segment.spell.startDate}`}>
                  <rect
                    x={startX}
                    y={rowY}
                    width={endX - startX}
                    height={BAR_HEIGHT}
                    rx={2}
                    fill={COLOR}
                    fillOpacity={highlighted ? 0.95 : 0.5}
                    stroke={
                      hover?.index === index ? chartTheme.colors.ink : 'none'
                    }
                    strokeWidth={2}
                    aria-label={`${segment.spell.length} dry days from ${dateLabel(segment.spell.startDate)} to ${dateLabel(segment.spell.endDate)}${ongoing ? ', ongoing' : ''}`}
                    {...handlers(index)}
                  />
                  {highlighted && (
                    <text
                      x={Math.min(endX + 5, W - RIGHT + 6)}
                      y={rowY + BAR_HEIGHT / 2}
                      dominantBaseline="middle"
                      fill={HIGHLIGHT}
                      fontSize={chartTheme.fontSizes.tick}
                      pointerEvents="none"
                    >
                      {segment.spell.length}d
                    </text>
                  )}
                  {ongoing && (
                    <circle
                      cx={endX}
                      cy={rowY + BAR_HEIGHT / 2}
                      r={5}
                      fill={chartTheme.colors.ink}
                      pointerEvents="none"
                    />
                  )}
                </g>
              )
            })}
            <text
              x={LEFT + plotWidth / 2}
              y={height - 14}
              textAnchor="middle"
              fill={chartTheme.colors.sub}
              fontSize={chartTheme.fontSizes.axisTitle}
            >
              Calendar date
            </text>
          </svg>
          {active && (
            <Tooltip
              title={`${active.spell.length} consecutive dry days`}
              rows={[
                { label: 'Start', value: dateLabel(active.spell.startDate) },
                { label: 'End', value: dateLabel(active.spell.endDate) },
                {
                  label: 'Length',
                  value: `${active.spell.length} days`,
                  accentColor: COLOR,
                },
                {
                  label: `${active.year} portion`,
                  value: `${active.days} days`,
                },
              ]}
              footer={[
                longestByYear.get(active.year) === active ? 'Longest of this year' : '',
                active.spell === longest ? 'Longest since 2020' : '',
                active.spell.endDate === latest && active.year === currentYear ? 'Ongoing' : '',
              ].filter(Boolean).join(' · ')}
            />
          )}
        </div>
      )}
    </ChartCard>
  )
}
