import { useCallback, useRef, useState } from 'react'
import { EUROPE_LONDON_TIMEZONE } from '@/config/weather'
import { ResponsiveChartContainer, chartTokens } from '@/components/ui'

// ---------- SVG layout constants ----------
const SVG_W = 600
const SVG_H = 260
const M = { t: 18, r: 20, b: 40, l: 54 } as const
const PLOT_W = SVG_W - M.l - M.r // 526
const PLOT_H = SVG_H - M.t - M.b // 142

// ---------- public types ----------
export interface ChartDataPoint {
  timestamp: number // ms since epoch (UTC)
  value: number | null
}

export interface ChartSeries {
  label: string
  color: string
  points: ChartDataPoint[]
}

interface LiveLineChartProps {
  readonly title: string
  readonly unit: string
  readonly tMin: number // ms since epoch
  readonly tMax: number // ms since epoch
  readonly primary: ChartSeries
  readonly secondary?: ChartSeries
}

// ---------- helpers ----------
function niceNum(x: number, round: boolean): number {
  if (x === 0) return 0
  const exp = Math.floor(Math.log10(Math.abs(x)))
  const f = Math.abs(x) / Math.pow(10, exp)
  let nf: number
  if (round) {
    if (f < 1.5) nf = 1
    else if (f < 3) nf = 2
    else if (f < 7) nf = 5
    else nf = 10
  } else {
    if (f <= 1) nf = 1
    else if (f <= 2) nf = 2
    else if (f <= 5) nf = 5
    else nf = 10
  }
  return nf * Math.pow(10, exp)
}

function computeYTicks(values: readonly number[], targetCount = 5): number[] {
  if (values.length === 0) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) {
    const half = Math.abs(min) * 0.1 || 1
    return [min - half, min, max + half]
  }
  const range = niceNum(max - min, false)
  const step = niceNum(range / (targetCount - 1), true)
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) {
    ticks.push(parseFloat(v.toFixed(10)))
  }
  return ticks
}

const TIME_FMT_SHORT = new Intl.DateTimeFormat('en-GB', {
  timeZone: EUROPE_LONDON_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
})

const TIME_FMT_LONG = new Intl.DateTimeFormat('en-GB', {
  timeZone: EUROPE_LONDON_TIMEZONE,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function fmtTime(t: number): string {
  try {
    return TIME_FMT_SHORT.format(new Date(t))
  } catch {
    return ''
  }
}

function fmtTimeDetailed(t: number): string {
  try {
    return TIME_FMT_LONG.format(new Date(t))
  } catch {
    return ''
  }
}

function xScale(t: number, tMin: number, tMax: number): number {
  if (tMax === tMin) return M.l + PLOT_W / 2
  return M.l + ((t - tMin) / (tMax - tMin)) * PLOT_W
}

function yScale(v: number, yMin: number, yMax: number): number {
  if (yMax === yMin) return M.t + PLOT_H / 2
  return M.t + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H
}

function buildPaths(
  points: readonly ChartDataPoint[],
  toX: (t: number) => number,
  toY: (v: number) => number,
): string[] {
  const paths: string[] = []
  let seg: string[] = []
  for (const pt of points) {
    if (pt.value == null) {
      if (seg.length > 1) paths.push(seg.join(' '))
      seg = []
    } else {
      const x = toX(pt.timestamp).toFixed(2)
      const y = toY(pt.value).toFixed(2)
      seg.push(`${seg.length === 0 ? 'M' : 'L'} ${x} ${y}`)
    }
  }
  if (seg.length > 1) paths.push(seg.join(' '))
  return paths
}

/** Return cx/cy for isolated single non-null points (flanked by nulls or edges). */
function buildDots(
  points: readonly ChartDataPoint[],
  toX: (t: number) => number,
  toY: (v: number) => number,
): { cx: number; cy: number }[] {
  const dots: { cx: number; cy: number }[] = []
  for (let i = 0; i < points.length; i++) {
    const pt = points[i]
    if (pt.value == null) continue
    const prevNull = i === 0 || points[i - 1]!.value == null
    const nextNull = i === points.length - 1 || points[i + 1]!.value == null
    if (prevNull && nextNull) {
      dots.push({ cx: toX(pt.timestamp), cy: toY(pt.value) })
    }
  }
  return dots
}

function computeXTicks(tMin: number, tMax: number, rangeMs: number): number[] {
  const oneHour = 3_600_000
  const twoHours = 7_200_000
  const fourHours = 14_400_000
  const thirtyMin = 1_800_000
  const fifteenMin = 900_000
  const intervalMs =
    rangeMs <= 1.5 * oneHour
      ? fifteenMin
      : rangeMs <= 3.5 * oneHour
        ? thirtyMin
        : rangeMs <= 8 * oneHour
          ? oneHour
          : rangeMs <= 16 * oneHour
            ? twoHours
            : fourHours
  const firstTick = Math.ceil(tMin / intervalMs) * intervalMs
  const ticks: number[] = []
  for (let t = firstTick; t <= tMax; t += intervalMs) {
    ticks.push(t)
  }
  return ticks
}

function findNearestIndex(
  allPoints: readonly { timestamp: number }[],
  targetT: number,
): number {
  let best = 0
  let bestDiff = Infinity
  for (let i = 0; i < allPoints.length; i++) {
    const diff = Math.abs(allPoints[i]!.timestamp - targetT)
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  }
  return best
}

// ---------- component ----------
export function LiveLineChart({
  title,
  unit,
  tMin,
  tMax,
  primary,
  secondary,
}: LiveLineChartProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  // Collect all non-null values for Y scale
  const allValues: number[] = []
  for (const pt of primary.points) if (pt.value != null) allValues.push(pt.value)
  if (secondary) {
    for (const pt of secondary.points) if (pt.value != null) allValues.push(pt.value)
  }

  const hasData = allValues.length > 0

  const yTicks = computeYTicks(allValues)
  const yMin = yTicks.length > 0 ? yTicks[0]! : 0
  const yMax = yTicks.at(-1) ?? 1

  const toX = useCallback((t: number) => xScale(t, tMin, tMax), [tMin, tMax])
  const toY = useCallback((v: number) => yScale(v, yMin, yMax), [yMin, yMax])

  const primaryPaths = buildPaths(primary.points, toX, toY)
  const primaryDots = buildDots(primary.points, toX, toY)
  const secondaryPaths = secondary ? buildPaths(secondary.points, toX, toY) : []
  const secondaryDots = secondary ? buildDots(secondary.points, toX, toY) : []

  const rangeMs = tMax - tMin
  const xTicks = computeXTicks(tMin, tMax, rangeMs)

  // Merged sorted timestamps for tooltip seeking
  const allTimestamps = [
    ...primary.points.map((pt) => pt.timestamp),
    ...(secondary ? secondary.points.map((pt) => pt.timestamp) : []),
  ]
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .sort((a, b) => a - b)
    .map((t) => ({ timestamp: t }))

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      if (!svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const svgXRatio = (e.clientX - rect.left) / rect.width
      const svgX = svgXRatio * SVG_W
      const t = tMin + ((svgX - M.l) / PLOT_W) * (tMax - tMin)
      if (allTimestamps.length === 0) return
      setHoveredIndex(findNearestIndex(allTimestamps, t))
    },
    [tMin, tMax, allTimestamps],
  )

  const handlePointerLeave = useCallback(() => setHoveredIndex(null), [])

  const hoveredTimestamp =
    hoveredIndex != null ? allTimestamps[hoveredIndex]?.timestamp : null
  const hoveredX = hoveredTimestamp != null ? toX(hoveredTimestamp) : null

  // Determine displayed values for the data panel
  const displayTimestamp: number | null =
    hoveredTimestamp ??
    (primary.points.findLast((pt) => pt.value != null)?.timestamp ?? null)

  const getPanelValue = (series: ChartSeries, t: number | null): number | null => {
    if (t == null) return null
    const pt = series.points.find((p) => p.timestamp === t)
    return pt?.value ?? null
  }

  const panelPrimaryValue = getPanelValue(primary, displayTimestamp)
  const panelSecondaryValue = secondary ? getPanelValue(secondary, displayTimestamp) : null

  const panelTimeLabel =
    displayTimestamp != null
      ? hoveredTimestamp != null
        ? fmtTimeDetailed(displayTimestamp)
        : `Latest (${fmtTime(displayTimestamp)})`
      : null

  function fmtVal(v: number | null): string {
    if (v == null) return '—'
    return `${v.toFixed(1)} ${unit}`
  }

  if (!hasData) {
    return (
      <article className="card live-chart-card">
        <h3 className="live-chart-title">{title}</h3>
        <p className="live-chart-no-data">No observations in this range.</p>
      </article>
    )
  }

  return (
    <article className="card live-chart-card">
      <h3 className="live-chart-title">{title}</h3>

      {/* Legend */}
      <div className="live-chart-legend" aria-hidden="true">
        <span className="live-chart-legend-dot" style={{ background: primary.color }} />
        <span>{primary.label}</span>
        {secondary && (
          <>
            <span
              className="live-chart-legend-dot live-chart-legend-dot--dashed"
              style={{ borderColor: secondary.color, background: 'transparent' }}
            />
            <span>{secondary.label}</span>
          </>
        )}
      </div>

      {/* SVG chart */}
      <ResponsiveChartContainer size="compact" minWidth={280} className="live-chart-svg-wrapper">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="live-chart-svg"
          role="img"
          aria-label={`${title} chart from ${fmtTimeDetailed(tMin)} to ${fmtTimeDetailed(tMax)}`}
        >
          {/* Horizontal grid lines + Y labels */}
          {yTicks.map((tick) => {
            const y = toY(tick)
            return (
              <g key={tick}>
                <line
                  x1={M.l}
                  y1={y}
                  x2={M.l + PLOT_W}
                  y2={y}
                  stroke={chartTokens.gridLines}
                  strokeWidth="1"
                />
                <text
                  x={M.l - 6}
                  y={y}
                  dominantBaseline="middle"
                  textAnchor="end"
                  fontSize="11"
                  fill={chartTokens.axisText}
                >
                  {tick % 1 === 0 ? tick.toFixed(0) : tick.toFixed(1)}
                </text>
              </g>
            )
          })}

          {/* X axis time labels */}
          {xTicks.map((tick) => {
            const x = toX(tick)
            if (x < M.l || x > M.l + PLOT_W) return null
            return (
              <text
                key={tick}
                x={x}
                y={SVG_H - M.b + 14}
                textAnchor="middle"
                fontSize="11"
                fill={chartTokens.axisText}
              >
                {fmtTime(tick)}
              </text>
            )
          })}

          {/* Axis border lines */}
          <line
            x1={M.l}
            y1={M.t}
            x2={M.l}
            y2={M.t + PLOT_H}
            stroke={chartTokens.gridLines}
            strokeWidth="1"
          />
          <line
            x1={M.l}
            y1={M.t + PLOT_H}
            x2={M.l + PLOT_W}
            y2={M.t + PLOT_H}
            stroke={chartTokens.gridLines}
            strokeWidth="1"
          />

          {/* Secondary series */}
          {secondaryPaths.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={secondary!.color}
              strokeWidth="1.5"
              strokeDasharray="5,3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {secondaryDots.map((dot, i) => (
            <circle key={i} cx={dot.cx} cy={dot.cy} r="3" fill={secondary!.color} />
          ))}

          {/* Primary series */}
          {primaryPaths.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={primary.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
          {primaryDots.map((dot, i) => (
            <circle key={i} cx={dot.cx} cy={dot.cy} r="3" fill={primary.color} />
          ))}

          {/* Crosshair */}
          {hoveredX != null && (
            <line
              x1={hoveredX}
              y1={M.t}
              x2={hoveredX}
              y2={M.t + PLOT_H}
              stroke={chartTokens.axisText}
              strokeWidth="1"
              strokeDasharray="3,3"
            />
          )}

          {/* Transparent interaction overlay */}
          <rect
            x={M.l}
            y={M.t}
            width={PLOT_W}
            height={PLOT_H}
            fill="transparent"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
            style={{ touchAction: 'none' }}
            aria-hidden="true"
          />
        </svg>
      </ResponsiveChartContainer>

      {/* Data panel – rendered below chart, never clips on mobile */}
      <div className="live-chart-data-panel" aria-live="polite" aria-atomic="true">
        {panelTimeLabel != null && (
          <>
            <span className="live-chart-data-time">{panelTimeLabel}</span>
            <span className="live-chart-data-value" style={{ color: primary.color }}>
              {primary.label}: {fmtVal(panelPrimaryValue)}
            </span>
            {secondary && (
              <span className="live-chart-data-value" style={{ color: secondary.color }}>
                {secondary.label}: {fmtVal(panelSecondaryValue)}
              </span>
            )}
          </>
        )}
      </div>
    </article>
  )
}
