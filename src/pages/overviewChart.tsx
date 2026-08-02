import { useCallback, useMemo, useRef, useState, type PointerEvent } from 'react'
import { EUROPE_LONDON_TIMEZONE } from '@/config/weather'
import { ResponsiveChartContainer } from '@/components/ui'
import type { RecentObservation } from '@/types/weather'

export type OverviewChartType = 'line' | 'area' | 'bar' | 'scatter'

export interface OverviewSeriesDef {
  readonly id: string
  readonly label: string
  readonly color: string
  readonly axis: string
  readonly unit: string
  readonly selector: (entry: RecentObservation) => number | null
  readonly defaultOn: boolean
  readonly more: boolean
}

export const OVERVIEW_CHART_SERIES: readonly OverviewSeriesDef[] = [
  {
    id: 'temperature',
    label: 'Temperature',
    color: '#e5484d',
    axis: 'temp',
    unit: '°C',
    selector: (entry) => entry.temperatureC,
    defaultOn: true,
    more: false,
  },
  {
    id: 'pressure',
    label: 'Pressure',
    color: '#1f6ce0',
    axis: 'pressure',
    unit: 'hPa',
    selector: (entry) => entry.pressureHpa,
    defaultOn: true,
    more: false,
  },
  {
    id: 'rain-rate',
    label: 'Rain rate',
    color: '#12a5c0',
    axis: 'rain',
    unit: 'mm/hr',
    selector: (entry) => entry.rainRateMmPerHour,
    defaultOn: true,
    more: false,
  },
  {
    id: 'dew-point',
    label: 'Dew point',
    color: '#7052d7',
    axis: 'temp',
    unit: '°C',
    selector: (entry) => entry.dewpointC,
    defaultOn: false,
    more: true,
  },
  {
    id: 'humidity',
    label: 'Humidity',
    color: '#187451',
    axis: 'humidity',
    unit: '%',
    selector: (entry) => entry.humidityPercent,
    defaultOn: false,
    more: true,
  },
  {
    id: 'wind-speed',
    label: 'Wind speed',
    color: '#b76d12',
    axis: 'wind',
    unit: 'mph',
    selector: (entry) => entry.windSpeedMph,
    defaultOn: false,
    more: true,
  },
]

const AXIS_PRIORITY: Record<string, number> = {
  temp: 0,
  pressure: 1,
  rain: 2,
  humidity: 3,
  wind: 4,
}

const AXIS_UNIT: Record<string, string> = {
  temp: '°C',
  pressure: 'hPa',
  rain: 'mm/hr',
  humidity: '%',
  wind: 'mph',
}

export interface OverviewChartPoint {
  readonly t: number
  readonly values: Record<string, number | null>
}

export function buildChartPoints(
  observations: readonly RecentObservation[],
): OverviewChartPoint[] {
  return [...observations]
    .filter((entry) => Number.isFinite(new Date(entry.observationTimeUtc).valueOf()))
    .sort(
      (left, right) =>
        new Date(left.observationTimeUtc).valueOf() -
        new Date(right.observationTimeUtc).valueOf(),
    )
    .map((entry) => {
      const values: Record<string, number | null> = {}
      for (const series of OVERVIEW_CHART_SERIES) {
        const value = series.selector(entry)
        values[series.id] = Number.isFinite(value as number) ? (value as number) : null
      }
      return { t: new Date(entry.observationTimeUtc).valueOf(), values }
    })
}

export interface SeriesRange {
  readonly id: string
  readonly label: string
  readonly color: string
  readonly unit: string
  readonly min: number | null
  readonly max: number | null
}

export function computeSeriesRanges(
  points: readonly OverviewChartPoint[],
  series: readonly OverviewSeriesDef[],
): SeriesRange[] {
  return series.map((def) => {
    const values = points
      .map((point) => point.values[def.id])
      .filter((value): value is number => value != null && Number.isFinite(value))
    return {
      id: def.id,
      label: def.label,
      color: def.color,
      unit: def.unit,
      min: values.length === 0 ? null : Math.min(...values),
      max: values.length === 0 ? null : Math.max(...values),
    }
  })
}

function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return []
  }
  if (min === max) {
    return [min]
  }
  const step = (max - min) / (count - 1)
  const ticks: number[] = []
  for (let i = 0; i < count; i += 1) {
    ticks.push(min + step * i)
  }
  return ticks
}

function formatTick(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 100) {
    return value.toFixed(0)
  }
  if (abs >= 10) {
    return value.toFixed(0)
  }
  return value.toFixed(1)
}

interface AxisScale {
  readonly axis: string
  readonly min: number
  readonly max: number
  readonly y: (value: number) => number
}

interface OverviewChartProps {
  readonly points: readonly OverviewChartPoint[]
  readonly enabledSeries: readonly OverviewSeriesDef[]
  readonly chartType: OverviewChartType
  readonly height?: number
}

export function OverviewChart({
  points,
  enabledSeries,
  chartType,
  height = 320,
}: OverviewChartProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const enabledAxes = useMemo(() => {
    const axes = Array.from(new Set(enabledSeries.map((series) => series.axis)))
    return axes.sort((left, right) => (AXIS_PRIORITY[left] ?? 9) - (AXIS_PRIORITY[right] ?? 9))
  }, [enabledSeries])

  const rightAxisCount = Math.max(0, enabledAxes.length - 1)

  const SVG_W = 900
  const SVG_H = height
  const margin = {
    top: 18,
    bottom: 36,
    left: 52,
    right: Math.max(20, rightAxisCount * 54),
  }
  const plotW = SVG_W - margin.left - margin.right
  const plotH = SVG_H - margin.top - margin.bottom

  const axisScales = useMemo<Record<string, AxisScale>>(() => {
    const scales: Record<string, AxisScale> = {}
    for (const axis of enabledAxes) {
      const axisSeries = enabledSeries.filter((series) => series.axis === axis)
      const values: number[] = []
      for (const point of points) {
        for (const series of axisSeries) {
          const value = point.values[series.id]
          if (value != null && Number.isFinite(value)) {
            values.push(value)
          }
        }
      }
      let min = values.length === 0 ? 0 : Math.min(...values)
      let max = values.length === 0 ? 1 : Math.max(...values)
      if (axis === 'rain' || axis === 'humidity') {
        min = Math.min(min, 0)
      }
      if (min === max) {
        min -= 1
        max += 1
      } else {
        const pad = (max - min) * 0.08
        min -= pad
        max += pad
      }
      const span = max - min || 1
      scales[axis] = {
        axis,
        min,
        max,
        y: (value: number) => margin.top + plotH - ((value - min) / span) * plotH,
      }
    }
    return scales
  }, [enabledAxes, enabledSeries, points, margin.top, plotH])

  const n = points.length
  const xForIndex = useCallback(
    (index: number) => {
      if (n <= 1) {
        return margin.left + plotW / 2
      }
      return margin.left + (index / (n - 1)) * plotW
    },
    [n, margin.left, plotW],
  )

  const timeSpanMs = n >= 2 ? points[n - 1].t - points[0].t : 0
  const timeFormatter = useMemo(() => {
    const useDate = timeSpanMs > 36 * 60 * 60 * 1000
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: EUROPE_LONDON_TIMEZONE,
      ...(useDate
        ? { day: '2-digit', month: 'short' }
        : { hour: '2-digit', minute: '2-digit' }),
    })
  }, [timeSpanMs])

  const tooltipFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: EUROPE_LONDON_TIMEZONE,
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    [],
  )

  const handlePointerMove = useCallback(
    (event: PointerEvent<SVGRectElement>) => {
      if (svgRef.current == null || n === 0) {
        return
      }
      const rect = svgRef.current.getBoundingClientRect()
      const ratio = (event.clientX - rect.left) / rect.width
      const svgX = ratio * SVG_W
      const relative = n <= 1 ? 0 : (svgX - margin.left) / plotW
      const index = Math.round(relative * (n - 1))
      setHoveredIndex(Math.max(0, Math.min(n - 1, index)))
    },
    [n, margin.left, plotW],
  )

  const handlePointerLeave = useCallback(() => setHoveredIndex(null), [])

  if (points.length === 0 || enabledSeries.length === 0) {
    return (
      <ResponsiveChartContainer size="page">
        <div className="chart-frame">
          <p>No observations available for the selected range and series.</p>
        </div>
      </ResponsiveChartContainer>
    )
  }

  const xTickIndices = computeXTickIndices(n)
  const leftAxis = enabledAxes[0]
  const leftScale = leftAxis != null ? axisScales[leftAxis] : undefined
  const leftTicks = leftScale != null ? niceTicks(leftScale.min, leftScale.max) : []

  const hoveredX = hoveredIndex != null ? xForIndex(hoveredIndex) : null
  const hoveredPoint = hoveredIndex != null ? points[hoveredIndex] : null

  return (
    <ResponsiveChartContainer size="page">
      <svg
        ref={svgRef}
        className="overview-chart-svg"
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        role="img"
        aria-label="Overview weather chart"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Horizontal grid lines + left axis ticks */}
        {leftScale != null
          ? leftTicks.map((tick) => {
              const y = leftScale.y(tick)
              return (
                <g key={`grid-${tick}`}>
                  <line
                    className="overview-chart-grid-line"
                    x1={margin.left}
                    y1={y}
                    x2={margin.left + plotW}
                    y2={y}
                  />
                  <text
                    className="overview-chart-axis-label"
                    x={margin.left - 6}
                    y={y + 3}
                    textAnchor="end"
                  >
                    {formatTick(tick)}
                  </text>
                </g>
              )
            })
          : null}

        {/* Left axis unit */}
        {leftAxis != null ? (
          <text
            className="overview-chart-axis-label"
            x={margin.left - 6}
            y={margin.top - 6}
            textAnchor="end"
          >
            {AXIS_UNIT[leftAxis]}
          </text>
        ) : null}

        {/* Right axes */}
        {enabledAxes.slice(1).map((axis, axisIndex) => {
          const scale = axisScales[axis]
          if (scale == null) {
            return null
          }
          const axisX = margin.left + plotW + axisIndex * 54 + 6
          const ticks = niceTicks(scale.min, scale.max)
          return (
            <g key={`axis-${axis}`}>
              <text
                className="overview-chart-axis-label"
                x={axisX}
                y={margin.top - 6}
                textAnchor="start"
              >
                {AXIS_UNIT[axis]}
              </text>
              {ticks.map((tick) => (
                <text
                  key={`axis-${axis}-${tick}`}
                  className="overview-chart-axis-label"
                  x={axisX}
                  y={scale.y(tick) + 3}
                  textAnchor="start"
                >
                  {formatTick(tick)}
                </text>
              ))}
            </g>
          )
        })}

        {/* X axis line */}
        <line
          className="overview-chart-grid-line"
          x1={margin.left}
          y1={margin.top + plotH}
          x2={margin.left + plotW}
          y2={margin.top + plotH}
        />

        {/* X axis labels */}
        {xTickIndices.map((index) => (
          <text
            key={`x-${index}`}
            className="overview-chart-axis-label"
            x={xForIndex(index)}
            y={margin.top + plotH + 16}
            textAnchor="middle"
          >
            {timeFormatter.format(points[index].t)}
          </text>
        ))}

        {/* Series */}
        {enabledSeries.map((series) => {
          const scale = axisScales[series.axis]
          if (scale == null) {
            return null
          }
          return (
            <SeriesShape
              key={series.id}
              series={series}
              chartType={chartType}
              points={points}
              scale={scale}
              xForIndex={xForIndex}
              baselineY={margin.top + plotH}
            />
          )
        })}

        {/* Hover guide + tooltip */}
        {hoveredX != null && hoveredPoint != null ? (
          <>
            <line
              className="overview-chart-guide"
              x1={hoveredX}
              y1={margin.top}
              x2={hoveredX}
              y2={margin.top + plotH}
            />
            <ChartTooltip
              x={hoveredX}
              plotLeft={margin.left}
              plotRight={margin.left + plotW}
              top={margin.top}
              timeLabel={tooltipFormatter.format(hoveredPoint.t)}
              rows={enabledSeries.map((series) => ({
                label: series.label,
                color: series.color,
                value: hoveredPoint.values[series.id],
                unit: series.unit,
              }))}
            />
          </>
        ) : null}

        {/* Pointer capture */}
        <rect
          x={margin.left}
          y={margin.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          style={{ touchAction: 'none' }}
        />
      </svg>
    </ResponsiveChartContainer>
  )
}

function computeXTickIndices(n: number): number[] {
  if (n <= 1) {
    return n === 1 ? [0] : []
  }
  const desired = Math.min(6, n)
  const step = (n - 1) / (desired - 1)
  const indices = new Set<number>()
  for (let i = 0; i < desired; i += 1) {
    indices.add(Math.round(i * step))
  }
  return Array.from(indices).sort((a, b) => a - b)
}

function SeriesShape({
  series,
  chartType,
  points,
  scale,
  xForIndex,
  baselineY,
}: {
  readonly series: OverviewSeriesDef
  readonly chartType: OverviewChartType
  readonly points: readonly OverviewChartPoint[]
  readonly scale: AxisScale
  readonly xForIndex: (index: number) => number
  readonly baselineY: number
}) {
  const coords = points.map((point, index) => {
    const value = point.values[series.id]
    if (value == null || !Number.isFinite(value)) {
      return null
    }
    return { x: xForIndex(index), y: scale.y(value) }
  })

  if (chartType === 'scatter') {
    return (
      <g>
        {coords.map((coord, index) =>
          coord == null ? null : (
            <circle key={index} cx={coord.x} cy={coord.y} r={2.4} fill={series.color} />
          ),
        )}
      </g>
    )
  }

  if (chartType === 'bar') {
    const width = points.length > 1 ? Math.max(1.5, (xForIndex(1) - xForIndex(0)) * 0.5) : 8
    return (
      <g>
        {coords.map((coord, index) =>
          coord == null ? null : (
            <rect
              key={index}
              x={coord.x - width / 2}
              y={Math.min(coord.y, baselineY)}
              width={width}
              height={Math.abs(baselineY - coord.y)}
              fill={series.color}
              opacity={0.75}
            />
          ),
        )}
      </g>
    )
  }

  const segments = buildLineSegments(coords)

  return (
    <g>
      {chartType === 'area'
        ? segments.map((segment, index) => (
            <path
              key={`area-${index}`}
              d={buildAreaPath(segment, baselineY)}
              fill={series.color}
              opacity={0.12}
            />
          ))
        : null}
      {segments.map((segment, index) => (
        <path
          key={`line-${index}`}
          d={buildLinePath(segment)}
          fill="none"
          stroke={series.color}
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </g>
  )
}

function buildLineSegments(
  coords: readonly ({ x: number; y: number } | null)[],
): Array<Array<{ x: number; y: number }>> {
  const segments: Array<Array<{ x: number; y: number }>> = []
  let current: Array<{ x: number; y: number }> = []
  for (const coord of coords) {
    if (coord == null) {
      if (current.length > 0) {
        segments.push(current)
        current = []
      }
      continue
    }
    current.push(coord)
  }
  if (current.length > 0) {
    segments.push(current)
  }
  return segments
}

function buildLinePath(points: readonly { x: number; y: number }[]): string {
  if (points.length === 1) {
    const point = points[0]
    return `M ${point.x.toFixed(2)} ${point.y.toFixed(2)} L ${(point.x + 0.1).toFixed(2)} ${point.y.toFixed(2)}`
  }
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
}

function buildAreaPath(
  points: readonly { x: number; y: number }[],
  baselineY: number,
): string {
  if (points.length === 0) {
    return ''
  }
  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ')
  const first = points[0]
  const last = points[points.length - 1]
  return `${line} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`
}

function ChartTooltip({
  x,
  plotLeft,
  plotRight,
  top,
  timeLabel,
  rows,
}: {
  readonly x: number
  readonly plotLeft: number
  readonly plotRight: number
  readonly top: number
  readonly timeLabel: string
  readonly rows: ReadonlyArray<{
    label: string
    color: string
    value: number | null
    unit: string
  }>
}) {
  const boxWidth = 168
  const rowHeight = 15
  const boxHeight = 20 + rows.length * rowHeight
  const preferRight = x + 12 + boxWidth <= plotRight
  const boxX = preferRight ? x + 12 : Math.max(plotLeft, x - 12 - boxWidth)
  const boxY = top + 6

  return (
    <g pointerEvents="none">
      <rect
        x={boxX}
        y={boxY}
        width={boxWidth}
        height={boxHeight}
        rx={6}
        fill="var(--chart-tooltip-background)"
        stroke="var(--chart-tooltip-border)"
      />
      <text
        x={boxX + 8}
        y={boxY + 15}
        fill="var(--chart-tooltip-text)"
        fontSize={11}
        fontWeight={700}
      >
        {timeLabel}
      </text>
      {rows.map((row, index) => {
        const rowY = boxY + 20 + (index + 1) * rowHeight - 4
        return (
          <g key={row.label}>
            <circle cx={boxX + 12} cy={rowY - 4} r={3.5} fill={row.color} />
            <text
              x={boxX + 20}
              y={rowY}
              fill="var(--chart-tooltip-text)"
              fontSize={10.5}
            >
              {row.label}
            </text>
            <text
              x={boxX + boxWidth - 8}
              y={rowY}
              fill="var(--chart-tooltip-text)"
              fontSize={10.5}
              fontWeight={700}
              textAnchor="end"
            >
              {row.value == null ? '—' : `${row.value.toFixed(1)} ${row.unit}`}
            </text>
          </g>
        )
      })}
    </g>
  )
}
