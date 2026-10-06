import { useRef, useState } from 'react'
import { ChartCard } from '@/components/charts/ChartCard'
import { chartTheme, MONTH_SHORT } from '@/components/charts/chartTheme'
import type { ClimateDay } from '@/types/weather'
import { buildRainfallGrid } from './rainfallGrid'
import { buildTemperatureAnomalyGrid } from './temperatureAnomalyGrid'
import {
  clampWarmWetQuadrant,
  RAINFALL_PERCENT_LIMIT,
  TEMPERATURE_ANOMALY_LIMIT_C,
} from './warmWetQuadrant'
import { legendSwatch, useClimateChartHover } from './climateChartCommon'

const W = chartTheme.exportWidth
const H = 690
const LEFT = 114
const RIGHT = 85
const TOP = 55
const BOTTOM = 94
const PW = W - LEFT - RIGHT
const PH = H - TOP - BOTTOM
const BLUE = '#2f5fa8'
const ORANGE = '#c98a3a'

const x = (value: number) =>
  LEFT +
  ((value + TEMPERATURE_ANOMALY_LIMIT_C) / (2 * TEMPERATURE_ANOMALY_LIMIT_C)) *
    PW
const y = (value: number) =>
  TOP + ((RAINFALL_PERCENT_LIMIT - value) / RAINFALL_PERCENT_LIMIT) * PH

export function WarmWetQuadrantChart({
  records,
  currentYear,
}: {
  readonly records: readonly ClimateDay[]
  readonly currentYear: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const { containerRef, hover, handlers, Tooltip } = useClimateChartHover()
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const highlightedYear = selectedYear ?? currentYear
  const years = Array.from(
    { length: Math.max(0, currentYear - 2019) },
    (_, index) => index + 2020,
  )
  const rainfall = buildRainfallGrid(records, 2020, currentYear)
  const temperatures = buildTemperatureAnomalyGrid(records, 2020, currentYear)
  const rainfallByMonth = new Map(
    rainfall.map((cell) => [`${cell.year}-${cell.month}`, cell]),
  )
  const observedDays = new Map<string, Set<string>>()
  const provisionalMonths = new Set<string>()
  const now = new Date()
  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  for (const record of records) {
    const key = `${Number(record.date.slice(0, 4))}-${Number(record.date.slice(5, 7))}`
    if (record.status !== 'finalised') provisionalMonths.add(key)
    if (
      record.rainfallMm == null ||
      !Number.isFinite(record.rainfallMm) ||
      record.status !== 'finalised'
    )
      continue
    if (!observedDays.has(key)) observedDays.set(key, new Set())
    observedDays.get(key)!.add(record.date)
  }
  const points = temperatures.flatMap((cell) => {
    const rainfallCell = rainfallByMonth.get(`${cell.year}-${cell.month}`)
    const rainfallComplete = (
      rainfallCell as
        (typeof rainfallCell & { readonly complete?: boolean }) | undefined
    )?.complete
    const expectedDays = new Date(
      Date.UTC(cell.year, cell.month, 0),
    ).getUTCDate()
    if (
      !cell.complete ||
      cell.anomalyC == null ||
      rainfallCell?.percent == null ||
      rainfallComplete === false ||
      `${cell.year}-${String(cell.month).padStart(2, '0')}` === currentMonth ||
      provisionalMonths.has(`${cell.year}-${cell.month}`) ||
      (observedDays.get(`${cell.year}-${cell.month}`)?.size ?? 0) <
        Math.ceil(expectedDays * 0.9)
    )
      return []
    return [
      {
        year: cell.year,
        month: cell.month,
        anomalyC: cell.anomalyC,
        rainfallMm: rainfallCell.totalMm!,
        rainfallPercent: rainfallCell.percent,
        position: clampWarmWetQuadrant(cell.anomalyC, rainfallCell.percent),
      },
    ]
  })
  const active = hover == null ? null : points[hover.index]

  return (
    <ChartCard
      title="Warm/wet quadrant"
      subtitle={`Temperature since 1995 · rainfall since 2020 · 1991–2020 average. Highlighted year: ${highlightedYear}.`}
      footnote="Only months with at least 90% finalised temperature and rainfall observations are shown. The axes span −6 to +6 °C and 0–500% of normal; values beyond these limits are pinned to the plot edge, with actual values shown in tooltips."
      minWidth={850}
      svgRef={svgRef}
      svgFilename={`wakefield-${currentYear}-warm-wet-quadrant.svg`}
      pngFilename={`wakefield-${currentYear}-warm-wet-quadrant.png`}
      headerAside={
        <label>
          Highlight year{' '}
          <select
            aria-label="Highlight year"
            value={highlightedYear}
            onChange={(event) => setSelectedYear(Number(event.target.value))}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      }
      legend={[
        { label: `${highlightedYear} months`, swatch: legendSwatch(BLUE) },
        { label: 'Other years', swatch: legendSwatch('#aeb8c2') },
        { label: 'Normal (0 °C, 100%)', swatch: legendSwatch(ORANGE) },
      ]}
    >
      {points.length === 0 ? (
        <p className="normals-no-data">
          No complete monthly temperature and rainfall observations available.
        </p>
      ) : (
        <div
          ref={containerRef}
          className="chart-kit-canvas"
          style={{ position: 'relative' }}
        >
          <svg
            ref={svgRef}
            className="chart-kit-svg"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="Monthly temperature anomaly against rainfall percentage of normal"
            style={{ width: '100%', height: 'auto' }}
          >
            <rect
              x={LEFT}
              y={TOP}
              width={PW / 2}
              height={y(100) - TOP}
              fill="#edf3fa"
            />
            <rect
              x={x(0)}
              y={TOP}
              width={PW / 2}
              height={y(100) - TOP}
              fill="#eaf2f5"
            />
            <rect
              x={LEFT}
              y={y(100)}
              width={PW / 2}
              height={TOP + PH - y(100)}
              fill="#f4f4f2"
            />
            <rect
              x={x(0)}
              y={y(100)}
              width={PW / 2}
              height={TOP + PH - y(100)}
              fill="#fdf2e9"
            />
            {[-6, -4, -2, 0, 2, 4, 6].map((tick) => (
              <g key={tick}>
                <line
                  x1={x(tick)}
                  x2={x(tick)}
                  y1={TOP}
                  y2={TOP + PH}
                  stroke={
                    tick === 0
                      ? chartTheme.colors.bandEdge
                      : chartTheme.colors.grid
                  }
                  strokeWidth={tick === 0 ? 2 : 1}
                />
                <text
                  x={x(tick)}
                  y={TOP + PH + 24}
                  textAnchor="middle"
                  fill={chartTheme.colors.sub}
                  fontSize={chartTheme.fontSizes.tick}
                >
                  {tick > 0 ? '+' : ''}
                  {tick}
                </text>
              </g>
            ))}
            {[0, 100, 200, 300, 400, 500].map((tick) => (
              <g key={tick}>
                <line
                  x1={LEFT}
                  x2={LEFT + PW}
                  y1={y(tick)}
                  y2={y(tick)}
                  stroke={
                    tick === 100
                      ? chartTheme.colors.bandEdge
                      : chartTheme.colors.grid
                  }
                  strokeWidth={tick === 100 ? 2 : 1}
                />
                <text
                  x={LEFT - 12}
                  y={y(tick)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill={chartTheme.colors.sub}
                  fontSize={chartTheme.fontSizes.tick}
                >
                  {tick}%
                </text>
              </g>
            ))}
            <text
              x={LEFT + PW / 2}
              y={H - 18}
              textAnchor="middle"
              fill={chartTheme.colors.sub}
              fontSize={chartTheme.fontSizes.axisTitle}
            >
              Temperature anomaly (°C)
            </text>
            <text
              transform={`translate(24 ${TOP + PH / 2}) rotate(-90)`}
              textAnchor="middle"
              fill={chartTheme.colors.sub}
              fontSize={chartTheme.fontSizes.axisTitle}
            >
              Rainfall (% of normal)
            </text>
            <circle cx={x(0)} cy={y(100)} r={5} fill={ORANGE} />
            {points.map((point, index) => {
              const { position } = point
              const selected = point.year === highlightedYear
              return (
                <g key={`${point.year}-${point.month}`}>
                  <circle
                    cx={x(position.x)}
                    cy={y(position.y)}
                    r={selected ? 7 : 4}
                    fill={selected ? BLUE : '#aeb8c2'}
                    opacity={selected ? 1 : 0.55}
                    stroke={
                      hover?.index === index ? chartTheme.colors.ink : '#fff'
                    }
                    strokeWidth={selected ? 2 : 1}
                    pointerEvents="none"
                  />
                  {(position.clampedX || position.clampedY) && (
                    <path
                      d={`M${x(position.x) - 5},${y(position.y) - 10} L${x(position.x) + 5},${y(position.y) - 10} L${x(position.x)},${y(position.y) - 18} Z`}
                      fill={selected ? BLUE : '#8a94a0'}
                      pointerEvents="none"
                    />
                  )}
                  {selected && (
                    <text
                      x={x(position.x) + 11}
                      y={y(position.y) - 8}
                      fill={chartTheme.colors.ink}
                      fontSize={chartTheme.fontSizes.tick}
                      pointerEvents="none"
                    >
                      {MONTH_SHORT[point.month - 1]}
                    </text>
                  )}
                  <rect
                    x={x(position.x) - 11}
                    y={y(position.y) - 11}
                    width={22}
                    height={22}
                    fill="transparent"
                    data-quadrant-point="true"
                    aria-label={`${MONTH_SHORT[point.month - 1]} ${point.year}: ${point.anomalyC.toFixed(1)} °C anomaly, ${point.rainfallPercent.toFixed(0)}% rainfall`}
                    {...handlers(index)}
                    onKeyDown={(event) => {
                      const delta =
                        event.key === 'ArrowLeft' || event.key === 'ArrowUp'
                          ? -1
                          : event.key === 'ArrowRight' ||
                              event.key === 'ArrowDown'
                            ? 1
                            : 0
                      if (!delta) return
                      event.preventDefault()
                      const all =
                        event.currentTarget.ownerSVGElement?.querySelectorAll<SVGRectElement>(
                          '[data-quadrant-point="true"]',
                        )
                      all?.[
                        Math.max(0, Math.min(all.length - 1, index + delta))
                      ]?.focus()
                    }}
                  />
                </g>
              )
            })}
          </svg>
          {active && (
            <Tooltip
              title={`${MONTH_SHORT[active.month - 1]} ${active.year}`}
              rows={[
                {
                  label: 'Temperature anomaly',
                  value: `${active.anomalyC > 0 ? '+' : ''}${active.anomalyC.toFixed(1)} °C`,
                },
                {
                  label: 'Rainfall',
                  value: `${active.rainfallMm.toFixed(1)} mm`,
                },
                {
                  label: 'Of normal',
                  value: `${active.rainfallPercent.toFixed(0)}%`,
                  accentColor: BLUE,
                },
              ]}
              footer={
                active.position.clampedX || active.position.clampedY
                  ? 'Point pinned to plot edge; actual values shown above.'
                  : undefined
              }
            />
          )}
        </div>
      )}
    </ChartCard>
  )
}
