import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { chartTokens } from '@/components/ui/chartTokens'

const SVG_W = 900
const SVG_H = 420
const MARGIN = { top: 18, right: 28, bottom: 62, left: 64 } as const

export interface DateSeriesChartRow {
  readonly timestamp: number
  readonly label: string
  readonly provisional?: boolean
  readonly values: Record<string, number | null>
}

export interface DateSeriesChartSeries {
  readonly key: string
  readonly label: string
  readonly color: string
  readonly dashed?: boolean
}

export interface DateSeriesChartPreset {
  readonly label: string
  readonly start: number
  readonly end: number
}

interface DateSeriesChartProps {
  readonly rows: readonly DateSeriesChartRow[]
  readonly series: readonly DateSeriesChartSeries[]
  readonly unit: string
  readonly ariaLabel: string
  readonly xTickFormatter?: (timestamp: number, spanMs: number) => string
  readonly gapThresholdMs?: number
  readonly presets?: readonly DateSeriesChartPreset[]
  readonly tooltipRenderer?: (
    row: DateSeriesChartRow,
    series: readonly DateSeriesChartSeries[],
    unit: string,
  ) => ReactNode
}

function niceNum(value: number, round: boolean): number {
  if (value === 0) return 0
  const exponent = Math.floor(Math.log10(Math.abs(value)))
  const fraction = Math.abs(value) / 10 ** exponent

  let niceFraction = 1
  if (round) {
    niceFraction =
      fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10
  } else {
    niceFraction =
      fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  }

  return niceFraction * 10 ** exponent
}

function computeYTicks(values: readonly number[]): number[] {
  if (values.length === 0) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) {
    const padding = Math.abs(min) * 0.1 || 1
    return [min - padding, min, max + padding]
  }

  const range = niceNum(max - min, false)
  const step = niceNum(range / 4, true)
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const ticks: number[] = []

  for (let tick = niceMin; tick <= niceMax + step * 0.5; tick += step) {
    ticks.push(Number(tick.toFixed(10)))
  }

  return ticks
}

function findNearestRowIndex(rows: readonly DateSeriesChartRow[], target: number): number {
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY

  for (let index = 0; index < rows.length; index += 1) {
    const distance = Math.abs(rows[index]!.timestamp - target)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }

  return bestIndex
}

export function DateSeriesChart({
  rows,
  series,
  unit,
  ariaLabel,
  xTickFormatter,
  gapThresholdMs = Number.POSITIVE_INFINITY,
  presets = [],
  tooltipRenderer,
}: DateSeriesChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const plotWidth = SVG_W - MARGIN.left - MARGIN.right
  const plotHeight = SVG_H - MARGIN.top - MARGIN.bottom
  const fullDomain = useMemo(
    () =>
      rows.length === 0
        ? null
        : {
            start: rows[0]!.timestamp,
            end: rows[rows.length - 1]!.timestamp,
          },
    [rows],
  )
  const [domain, setDomain] = useState(fullDomain)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [brush, setBrush] = useState<{ startX: number; currentX: number } | null>(null)

  useEffect(() => {
    setDomain(fullDomain)
    setHoveredIndex(null)
    setBrush(null)
  }, [fullDomain])

  const effectiveDomain = domain ?? fullDomain
  const filteredRows = useMemo(() => {
    if (effectiveDomain == null) return []
    return rows.filter(
      (row) =>
        row.timestamp >= effectiveDomain.start && row.timestamp <= effectiveDomain.end,
    )
  }, [effectiveDomain, rows])

  const spanMs =
    effectiveDomain == null ? 0 : Math.max(1, effectiveDomain.end - effectiveDomain.start)
  const values = filteredRows.flatMap((row) =>
    series
      .map((entry) => row.values[entry.key])
      .filter((value): value is number => value != null),
  )
  const yTicks = computeYTicks(values)
  const yMin = yTicks[0] ?? 0
  const yMax = yTicks.at(-1) ?? 1

  const xScale = (timestamp: number) =>
    MARGIN.left + ((timestamp - effectiveDomain!.start) / spanMs) * plotWidth
  const yScale = (value: number) =>
    MARGIN.top + plotHeight - ((value - yMin) / Math.max(1, yMax - yMin)) * plotHeight

  const tickCount = Math.min(6, Math.max(2, filteredRows.length))
  const xTicks = Array.from({ length: tickCount }, (_, index) => {
    const position = index / Math.max(1, tickCount - 1)
    return effectiveDomain == null ? 0 : effectiveDomain.start + spanMs * position
  })
  const formatTick = xTickFormatter ?? ((timestamp: number) => new Date(timestamp).toISOString())

  const hoveredRow =
    hoveredIndex != null && filteredRows[hoveredIndex] != null ? filteredRows[hoveredIndex]! : null
  const hoveredX = hoveredRow != null ? xScale(hoveredRow.timestamp) : null
  const isZoomed =
    domain != null &&
    fullDomain != null &&
    (domain.start !== fullDomain.start || domain.end !== fullDomain.end)

  if (effectiveDomain == null || filteredRows.length === 0 || values.length === 0) {
    return <p className="normals-no-data">No chart data available.</p>
  }

  return (
    <div className="responsive-chart-fill date-series-chart">
      {(presets.length > 0 || isZoomed) && (
        <div className="date-series-chart__controls">
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="button button-ghost date-series-chart__control"
              onClick={() => setDomain({ start: preset.start, end: preset.end })}
            >
              {preset.label}
            </button>
          ))}
          <button
            type="button"
            className="button button-ghost date-series-chart__control"
            onClick={() => setDomain(fullDomain)}
            disabled={!isZoomed}
          >
            Reset zoom
          </button>
        </div>
      )}

      <div className="date-series-chart__canvas">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="date-series-chart__svg"
          role="img"
          aria-label={ariaLabel}
        >
          {yTicks.map((tick) => {
            const y = yScale(tick)
            return (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + plotWidth}
                  y1={y}
                  y2={y}
                  stroke={chartTokens.gridLines}
                />
                <text
                  x={MARGIN.left - 8}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize="11"
                  fill={chartTokens.axisText}
                >
                  {tick % 1 === 0 ? tick.toFixed(0) : tick.toFixed(1)}
                </text>
              </g>
            )
          })}

          <line
            x1={MARGIN.left}
            x2={MARGIN.left}
            y1={MARGIN.top}
            y2={MARGIN.top + plotHeight}
            stroke={chartTokens.gridLines}
          />
          <line
            x1={MARGIN.left}
            x2={MARGIN.left + plotWidth}
            y1={MARGIN.top + plotHeight}
            y2={MARGIN.top + plotHeight}
            stroke={chartTokens.gridLines}
          />

          {series.map((entry) => {
            const segments: string[] = []
            let current: string[] = []
            let lastTimestamp: number | null = null

            for (const row of filteredRows) {
              const value = row.values[entry.key]
              if (value == null) {
                if (current.length > 1) segments.push(current.join(' '))
                current = []
                lastTimestamp = null
                continue
              }

              if (
                lastTimestamp != null &&
                row.timestamp - lastTimestamp > gapThresholdMs &&
                current.length > 1
              ) {
                segments.push(current.join(' '))
                current = []
              }

              current.push(
                `${current.length === 0 ? 'M' : 'L'} ${xScale(row.timestamp).toFixed(2)} ${yScale(
                  value,
                ).toFixed(2)}`,
              )
              lastTimestamp = row.timestamp
            }

            if (current.length > 1) {
              segments.push(current.join(' '))
            }

            return segments.map((segment, index) => (
              <path
                key={`${entry.key}-${index}`}
                d={segment}
                fill="none"
                stroke={entry.color}
                strokeWidth="2"
                strokeDasharray={entry.dashed ? '6 4' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))
          })}

          {xTicks.map((timestamp) => (
            <text
              key={timestamp}
              x={xScale(timestamp)}
              y={SVG_H - 18}
              textAnchor="middle"
              fontSize="11"
              fill={chartTokens.axisText}
            >
              {formatTick(timestamp, spanMs)}
            </text>
          ))}

          {hoveredX != null && (
            <line
              x1={hoveredX}
              x2={hoveredX}
              y1={MARGIN.top}
              y2={MARGIN.top + plotHeight}
              stroke={chartTokens.axisText}
              strokeDasharray="3 3"
            />
          )}

          {brush != null && (
            <rect
              x={Math.min(brush.startX, brush.currentX)}
              y={MARGIN.top}
              width={Math.abs(brush.currentX - brush.startX)}
              height={plotHeight}
              fill={chartTokens.series.reference}
              fillOpacity={0.15}
              stroke={chartTokens.series.reference}
              strokeDasharray="4 4"
            />
          )}

          <rect
            x={MARGIN.left}
            y={MARGIN.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            onPointerDown={(event) => {
              if (svgRef.current == null) return
              const rect = svgRef.current.getBoundingClientRect()
              const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
              const svgX = MARGIN.left + plotWidth * ratio
              setBrush({ startX: svgX, currentX: svgX })
            }}
            onPointerMove={(event) => {
              if (svgRef.current == null) return
              const rect = svgRef.current.getBoundingClientRect()
              const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
              const timestamp = effectiveDomain.start + spanMs * ratio
              setHoveredIndex(findNearestRowIndex(filteredRows, timestamp))
              setBrush((current) =>
                current == null
                  ? null
                  : { ...current, currentX: MARGIN.left + plotWidth * ratio },
              )
            }}
            onPointerLeave={() => {
              setHoveredIndex(null)
            }}
            onPointerUp={() => {
              if (brush == null) return
              const startRatio = (brush.startX - MARGIN.left) / plotWidth
              const endRatio = (brush.currentX - MARGIN.left) / plotWidth
              setBrush(null)
              if (Math.abs(brush.currentX - brush.startX) < 12) {
                return
              }

              const start = effectiveDomain.start + spanMs * Math.max(0, Math.min(startRatio, endRatio))
              const end = effectiveDomain.start + spanMs * Math.min(1, Math.max(startRatio, endRatio))
              if (end - start > 0) {
                setDomain({ start, end })
              }
            }}
            style={{ touchAction: 'none' }}
            aria-hidden="true"
          />
        </svg>

        {hoveredRow != null && (
          <div
            className="date-series-chart__tooltip"
            style={{
              left: `${Math.max(10, Math.min(((hoveredX ?? MARGIN.left) / SVG_W) * 100, 90))}%`,
            }}
          >
            {tooltipRenderer != null ? (
              tooltipRenderer(hoveredRow, series, unit)
            ) : (
              <>
                <strong>{hoveredRow.label}</strong>
                {hoveredRow.provisional ? <div>Provisional</div> : null}
                {series.map((entry) => {
                  const value = hoveredRow.values[entry.key]
                  return (
                    <div key={entry.key} style={{ color: entry.color }}>
                      {entry.label}: {value == null ? 'Missing' : `${value.toFixed(1)} ${unit}`}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
