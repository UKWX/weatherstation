import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import {
  ErrorState,
  IncompleteDataWarning,
  ResponsiveChartContainer,
  Skeleton,
  VisuallyHidden,
} from '@/components/ui'
import { chartTokens } from '@/components/ui/chartTokens'
import { useAnnualClimateQueries, useDailyNormalsQuery, useMonthlyNormalsQuery } from '@/hooks/usePublicWeatherQueries'
import { downloadCsvBlob } from '@/features/climateArchive/csv'
import {
  availableVariablesForResolution,
  buildCustomGraphResult,
  defaultChartTypeForVariables,
  defaultVariablesForResolution,
} from '@/features/customGraphs/aggregation'
import { loadMinuteArchiveRange } from '@/features/customGraphs/archive'
import { buildCustomGraphCsv } from '@/features/customGraphs/csv'
import { MinuteArchiveParserCancelledError } from '@/features/customGraphs/parser'
import { downloadSvgAsPng } from '@/features/customGraphs/png'
import {
  MINUTE_ARCHIVE_MAX_DAYS,
  buildRequestPlan,
  createPresetRange,
  formatLondonDateTimeDisplay,
  validateMinuteArchiveLimit,
  type PresetKey,
} from '@/features/customGraphs/time'
import type {
  CustomGraphChartType,
  CustomGraphFormState,
  CustomGraphSeries,
  CustomGraphSeriesPoint,
  MinuteArchiveObservation,
  TemperatureRangeSeries,
  VariableGroup,
} from '@/features/customGraphs/types'

const PRESET_BUTTONS: ReadonlyArray<{ key: PresetKey; label: string }> = [
  { key: 'last-hour', label: 'Last hour' },
  { key: 'last-3-hours', label: 'Last 3 hours' },
  { key: 'last-6-hours', label: 'Last 6 hours' },
  { key: 'today', label: 'Today' },
  { key: 'last-7-days', label: 'Last 7 days' },
  { key: 'month-to-date', label: 'Month to date' },
  { key: 'year-to-date', label: 'Year to date' },
] as const

const SVG_W = 900
const SVG_H = 360
const CHART_MARGIN = { top: 18, right: 20, bottom: 52, left: 64 } as const

type MinuteState = {
  status: 'idle' | 'loading' | 'success' | 'cancelled' | 'error'
  observations: readonly MinuteArchiveObservation[]
  malformedLineCount: number
  warningMessages: string[]
  loadedFiles: number
  totalFiles: number
  processedLines: number
  error: string | null
}

const EMPTY_MINUTE_STATE: MinuteState = {
  status: 'idle',
  observations: [],
  malformedLineCount: 0,
  warningMessages: [],
  loadedFiles: 0,
  totalFiles: 0,
  processedLines: 0,
  error: null,
}

function createInitialFormState(): CustomGraphFormState {
  const resolution = 'daily'
  const variables = defaultVariablesForResolution(resolution)
  return {
    ...createPresetRange('last-7-days'),
    resolution,
    variables,
    aggregation: 'mean',
    chartType: defaultChartTypeForVariables(variables),
    comparisonMode: 'none',
    normalOverlay: true,
    runningMean: false,
    runningMeanWindow: 3,
    cumulativeRainfall: false,
    temperatureRangeShading: false,
  }
}

function niceStep(value: number): number {
  if (value <= 0) return 1
  const exponent = Math.floor(Math.log10(value))
  const fraction = value / 10 ** exponent
  if (fraction <= 1) return 1 * 10 ** exponent
  if (fraction <= 2) return 2 * 10 ** exponent
  if (fraction <= 5) return 5 * 10 ** exponent
  return 10 * 10 ** exponent
}

function computeYTicks(values: readonly number[]): number[] {
  if (values.length === 0) {
    return [0, 1]
  }

  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) {
    const padding = Math.abs(min) * 0.1 || 1
    return [min - padding, min, min + padding]
  }

  const range = max - min
  const step = niceStep(range / 4)
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let value = start; value <= end + step / 2; value += step) {
    ticks.push(Number(value.toFixed(6)))
  }
  return ticks
}

function buildLineSegments(
  points: readonly CustomGraphSeriesPoint[],
  xScale: (timestamp: number) => number,
  yScale: (value: number) => number,
): string[] {
  const segments: string[] = []
  let currentSegment: string[] = []

  for (const point of points) {
    if (point.value == null) {
      if (currentSegment.length > 1) {
        segments.push(currentSegment.join(' '))
      }
      currentSegment = []
      continue
    }

    const command = currentSegment.length === 0 ? 'M' : 'L'
    currentSegment.push(`${command} ${xScale(point.timestamp).toFixed(2)} ${yScale(point.value).toFixed(2)}`)
  }

  if (currentSegment.length > 1) {
    segments.push(currentSegment.join(' '))
  }

  return segments
}

function buildAreaSegments(
  points: readonly CustomGraphSeriesPoint[],
  xScale: (timestamp: number) => number,
  yScale: (value: number) => number,
  baselineY: number,
): string[] {
  const segments: string[] = []
  let activePoints: CustomGraphSeriesPoint[] = []

  const flush = () => {
    if (activePoints.length < 2) {
      activePoints = []
      return
    }
    const top = activePoints
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xScale(point.timestamp).toFixed(2)} ${yScale(point.value!).toFixed(2)}`)
      .join(' ')
    const bottom = [...activePoints]
      .reverse()
      .map((point) => `L ${xScale(point.timestamp).toFixed(2)} ${baselineY.toFixed(2)}`)
      .join(' ')
    segments.push(`${top} ${bottom} Z`)
    activePoints = []
  }

  for (const point of points) {
    if (point.value == null) {
      flush()
      continue
    }
    activePoints.push(point)
  }
  flush()

  return segments
}

function buildRangeAreaPath(
  range: TemperatureRangeSeries['points'],
  xScale: (timestamp: number) => number,
  yScale: (value: number) => number,
): string | null {
  const validPoints = range.filter((point) => point.min != null && point.max != null)
  if (validPoints.length < 2) {
    return null
  }

  const upper = validPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xScale(point.timestamp).toFixed(2)} ${yScale(point.max!).toFixed(2)}`)
    .join(' ')
  const lower = [...validPoints]
    .reverse()
    .map((point) => `L ${xScale(point.timestamp).toFixed(2)} ${yScale(point.min!).toFixed(2)}`)
    .join(' ')
  return `${upper} ${lower} Z`
}

function buildXAxisTicks(points: readonly CustomGraphSeriesPoint[]): CustomGraphSeriesPoint[] {
  if (points.length <= 6) {
    return [...points]
  }

  const step = Math.max(1, Math.floor(points.length / 5))
  const ticks = points.filter((_, index) => index % step === 0)
  const lastPoint = points.at(-1)
  if (lastPoint != null && ticks.at(-1)?.timestamp !== lastPoint.timestamp) {
    ticks.push(lastPoint)
  }
  return ticks
}

function groupKey(series: Pick<CustomGraphSeries, 'group' | 'unit'>): string {
  return `${series.group}:${series.unit}`
}

function chartTitle(group: VariableGroup): string {
  switch (group) {
    case 'temperature':
      return 'Temperature'
    case 'humidity':
      return 'Humidity'
    case 'pressure':
      return 'Pressure'
    case 'wind':
      return 'Wind'
    case 'rainfall':
      return 'Rainfall'
  }
}

function formatTickValue(value: number): string {
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1)
}

function GraphPanel({
  title,
  subtitle,
  series,
  ranges,
  domain,
  onDownloadPng,
}: {
  readonly title: string
  readonly subtitle: string
  readonly series: readonly CustomGraphSeries[]
  readonly ranges: readonly TemperatureRangeSeries[]
  readonly domain: { start: number; end: number }
  readonly onDownloadPng: (svg: SVGSVGElement) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const visibleSeries = series.filter((entry) => !entry.hidden)
  const filteredSeries = visibleSeries
    .map((entry) => ({
      ...entry,
      points: entry.points.filter(
        (point) => point.timestamp >= domain.start && point.timestamp <= domain.end,
      ),
    }))
    .filter((entry) => entry.points.length > 0)
  const filteredRanges = ranges
    .map((range) => ({
      ...range,
      points: range.points.filter(
        (point) => point.timestamp >= domain.start && point.timestamp <= domain.end,
      ),
    }))
    .filter((range) => range.points.length > 0)

  const plotWidth = SVG_W - CHART_MARGIN.left - CHART_MARGIN.right
  const plotHeight = SVG_H - CHART_MARGIN.top - CHART_MARGIN.bottom
  const valueDomain = useMemo(() => {
    const values = filteredSeries.flatMap((entry) => entry.points.map((point) => point.value).filter((value): value is number => value != null))
    for (const range of filteredRanges) {
      for (const point of range.points) {
        if (point.min != null) values.push(point.min)
        if (point.max != null) values.push(point.max)
      }
    }
    return values
  }, [filteredRanges, filteredSeries])

  if (filteredSeries.length === 0 || valueDomain.length === 0) {
    return (
      <section className="card custom-graphs-chart-card">
        <div className="custom-graphs-chart-header">
          <div>
            <h3>{title}</h3>
            <p>{subtitle}</p>
          </div>
        </div>
        <p className="custom-graphs-empty">No visible data points remain in the current zoom window.</p>
      </section>
    )
  }

  const yTicks = computeYTicks(valueDomain)
  const yMin = yTicks[0]!
  const yMax = yTicks.at(-1)!
  const xScale = (timestamp: number) =>
    CHART_MARGIN.left + ((timestamp - domain.start) / Math.max(1, domain.end - domain.start)) * plotWidth
  const yScale = (value: number) =>
    CHART_MARGIN.top + plotHeight - ((value - yMin) / Math.max(1, yMax - yMin)) * plotHeight
  const xTickPoints = buildXAxisTicks(filteredSeries[0]!.points)
  const zeroY = yScale(Math.max(0, yMin))

  return (
    <section className="card custom-graphs-chart-card">
      <div className="custom-graphs-chart-header">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <button
          type="button"
          className="button button-ghost"
          onClick={() => {
            if (svgRef.current != null) {
              onDownloadPng(svgRef.current)
            }
          }}
        >
          Export PNG
        </button>
      </div>
      <ResponsiveChartContainer>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="custom-graphs-svg"
          role="img"
          aria-label={`${title} chart. ${subtitle}`}
        >
          {yTicks.map((tick) => {
            const y = yScale(tick)
            return (
              <g key={tick}>
                <line
                  x1={CHART_MARGIN.left}
                  x2={SVG_W - CHART_MARGIN.right}
                  y1={y}
                  y2={y}
                  stroke={chartTokens.gridLines}
                  strokeWidth="1"
                />
                <text
                  x={CHART_MARGIN.left - 8}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize="11"
                  fill={chartTokens.axisText}
                >
                  {formatTickValue(tick)}
                </text>
              </g>
            )
          })}
          <line
            x1={CHART_MARGIN.left}
            x2={CHART_MARGIN.left}
            y1={CHART_MARGIN.top}
            y2={CHART_MARGIN.top + plotHeight}
            stroke={chartTokens.gridLines}
          />
          <line
            x1={CHART_MARGIN.left}
            x2={CHART_MARGIN.left + plotWidth}
            y1={CHART_MARGIN.top + plotHeight}
            y2={CHART_MARGIN.top + plotHeight}
            stroke={chartTokens.gridLines}
          />
          {filteredRanges.map((range) => {
            const path = buildRangeAreaPath(range.points, xScale, yScale)
            if (path == null) return null
            return (
              <path
                key={range.id}
                d={path}
                fill={range.color}
                fillOpacity={range.dashed ? 0.08 : 0.14}
                stroke="none"
              />
            )
          })}
          {filteredSeries.map((entry) => {
            if (entry.chartType === 'bar') {
              const visibleValues = entry.points.filter((point) => point.value != null)
              const barWidth = Math.max(4, plotWidth / Math.max(visibleValues.length * 1.8, 8))
              return visibleValues.map((point) => {
                const x = xScale(point.timestamp) - barWidth / 2
                const y = yScale(point.value!)
                return (
                  <rect
                    key={`${entry.id}-${point.timestamp}`}
                    x={x}
                    y={Math.min(y, zeroY)}
                    width={barWidth}
                    height={Math.abs(zeroY - y)}
                    fill={entry.color}
                    opacity={entry.dashed ? 0.45 : 0.85}
                  />
                )
              })
            }

            if (entry.chartType === 'area') {
              return buildAreaSegments(entry.points, xScale, yScale, zeroY).map((segment, index) => (
                <path
                  key={`${entry.id}-area-${index}`}
                  d={segment}
                  fill={entry.color}
                  fillOpacity={0.16}
                  stroke="none"
                />
              ))
            }

            return null
          })}
          {filteredSeries.map((entry) =>
            buildLineSegments(entry.points, xScale, yScale).map((segment, index) => (
              <path
                key={`${entry.id}-${index}`}
                d={segment}
                fill="none"
                stroke={entry.color}
                strokeWidth={entry.chartType === 'bar' ? 1 : 2}
                strokeDasharray={entry.dashed ? '6 4' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )),
          )}
          {xTickPoints.map((point) => (
            <text
              key={point.timestamp}
              x={xScale(point.timestamp)}
              y={SVG_H - 16}
              textAnchor="middle"
              fontSize="11"
              fill={chartTokens.axisText}
            >
              {point.label}
            </text>
          ))}
        </svg>
      </ResponsiveChartContainer>
      <ul className="custom-graphs-inline-legend" aria-label={`${title} visible series`}>
        {visibleSeries.map((entry) => (
          <li key={entry.id}>
            <span
              className={`custom-graphs-inline-legend-swatch${entry.dashed ? ' custom-graphs-inline-legend-swatch--dashed' : ''}`}
              style={{ background: entry.dashed ? 'transparent' : entry.color, borderColor: entry.color }}
              aria-hidden="true"
            />
            {entry.label}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function CustomGraphsPage() {
  const [formState, setFormState] = useState<CustomGraphFormState>(() => createInitialFormState())
  const [appliedState, setAppliedState] = useState<CustomGraphFormState>(() => createInitialFormState())
  const [minuteState, setMinuteState] = useState<MinuteState>(EMPTY_MINUTE_STATE)
  const [hiddenSeriesIds, setHiddenSeriesIds] = useState<Set<string>>(new Set())
  const [zoomDomain, setZoomDomain] = useState<{ start: number; end: number } | null>(null)
  const minuteAbortControllerRef = useRef<AbortController | null>(null)

  const draftPlan = useMemo(() => {
    try {
      return buildRequestPlan(formState, formState.resolution, formState.comparisonMode)
    } catch {
      return null
    }
  }, [formState])

  const appliedPlan = useMemo(() => {
    try {
      return buildRequestPlan(appliedState, appliedState.resolution, appliedState.comparisonMode)
    } catch {
      return null
    }
  }, [appliedState])

  const annualYearsToLoad = useMemo(() => {
    if (appliedPlan == null || appliedPlan.usesMinuteArchive) {
      return []
    }
    return [...new Set([...appliedPlan.annualYears, ...appliedPlan.comparisonAnnualYears])].sort((a, b) => a - b)
  }, [appliedPlan])

  const annualQueries = useAnnualClimateQueries(annualYearsToLoad)
  const dailyNormalsQuery = useDailyNormalsQuery()
  const monthlyNormalsQuery = useMonthlyNormalsQuery()

  useEffect(() => {
    if (appliedPlan == null || !appliedPlan.usesMinuteArchive) {
      minuteAbortControllerRef.current?.abort()
      minuteAbortControllerRef.current = null
      setMinuteState(EMPTY_MINUTE_STATE)
      return
    }

    if (!validateMinuteArchiveLimit(appliedPlan.minuteArchiveDates)) {
      setMinuteState({
        ...EMPTY_MINUTE_STATE,
        status: 'error',
        error: `Minute and hourly graphs are limited to ${MINUTE_ARCHIVE_MAX_DAYS} archive day files per primary range.`,
      })
      return
    }

    const allDates = [
      ...appliedPlan.minuteArchiveDates,
      ...appliedPlan.comparisonMinuteArchiveDates,
    ]
    const controller = new AbortController()
    minuteAbortControllerRef.current = controller
    setMinuteState({
      ...EMPTY_MINUTE_STATE,
      status: 'loading',
      totalFiles: allDates.length,
    })

    void loadMinuteArchiveRange(allDates, {
      signal: controller.signal,
      onChunk: (chunk) => {
        setMinuteState((previous) => ({
          ...previous,
          observations: [...previous.observations, ...chunk.observations],
          malformedLineCount: chunk.malformedLineCount,
          processedLines: chunk.processedLineCount,
        }))
      },
      onFileLoaded: () => {
        setMinuteState((previous) => ({
          ...previous,
          loadedFiles: previous.loadedFiles + 1,
        }))
      },
    })
      .then((payload) => {
        setMinuteState((previous) => ({
          ...previous,
          status: 'success',
          observations: payload.observations,
          malformedLineCount: payload.malformedLineCount,
          warningMessages: [...previous.warningMessages, ...payload.warningMessages],
          error: null,
        }))
      })
      .catch((error: unknown) => {
        if (error instanceof MinuteArchiveParserCancelledError || controller.signal.aborted) {
          setMinuteState((previous) => ({
            ...previous,
            status: 'cancelled',
            warningMessages: [
              ...previous.warningMessages,
              'Minute archive loading was cancelled. Any rows parsed so far remain visible.',
            ],
            error: null,
          }))
          return
        }

        setMinuteState((previous) => ({
          ...previous,
          status: 'error',
          warningMessages:
            previous.observations.length > 0
              ? [...previous.warningMessages, 'Some archive files loaded before the request stopped. Showing partial results.']
              : previous.warningMessages,
          error: error instanceof Error ? error.message : 'Unable to load archive files.',
        }))
      })

    return () => {
      controller.abort()
    }
  }, [appliedPlan])

  useEffect(() => {
    setHiddenSeriesIds(new Set())
    setZoomDomain(null)
  }, [appliedState, minuteState.status])

  const availableVariables = useMemo(
    () => availableVariablesForResolution(formState.resolution),
    [formState.resolution],
  )

  const climateRecords = useMemo(
    () => annualQueries.flatMap((query) => query.data?.records ?? []),
    [annualQueries],
  )

  const annualQueriesLoading = annualQueries.some((query) => query.isLoading)
  const annualQueriesError = annualQueries.find((query) => query.error != null)?.error ?? null

  const rawResult = useMemo(() => {
    if (appliedPlan == null) {
      return null
    }

    return buildCustomGraphResult(
      appliedState,
      {
        minuteObservations: minuteState.observations,
        climateRecords,
        dailyNormals: dailyNormalsQuery.data?.records ?? [],
        monthlyNormals: monthlyNormalsQuery.data?.months ?? [],
      },
      appliedPlan.primaryRange,
      appliedPlan.comparisonRange,
    )
  }, [appliedPlan, appliedState, climateRecords, dailyNormalsQuery.data, minuteState.observations, monthlyNormalsQuery.data])

  const result = useMemo(() => {
    if (rawResult == null) {
      return null
    }

    return {
      ...rawResult,
      series: rawResult.series.map((entry) => ({
        ...entry,
        hidden: hiddenSeriesIds.has(entry.id),
      })),
      warnings: [
        ...rawResult.warnings,
        ...minuteState.warningMessages.map((message) => ({
          code: 'PARTIAL_SUCCESS' as const,
          message,
        })),
        ...(minuteState.malformedLineCount > 0
          ? [
              {
                code: 'MALFORMED_LINES' as const,
                message: `${minuteState.malformedLineCount} malformed JSONL line${minuteState.malformedLineCount === 1 ? '' : 's'} were ignored.`,
              },
            ]
          : []),
      ],
      malformedLineCount: minuteState.malformedLineCount,
    }
  }, [hiddenSeriesIds, minuteState.malformedLineCount, minuteState.warningMessages, rawResult])

  const groupedSeries = useMemo(() => {
    if (result == null) {
      return []
    }

    const map = new Map<string, { title: string; unit: string; series: CustomGraphSeries[]; ranges: TemperatureRangeSeries[] }>()
    for (const entry of result.series) {
      const key = groupKey(entry)
      const existing = map.get(key)
      if (existing == null) {
        map.set(key, {
          title: chartTitle(entry.group),
          unit: entry.unit,
          series: [entry],
          ranges: [],
        })
      } else {
        existing.series.push(entry)
      }
    }

    for (const range of result.temperatureRanges) {
      const temperatureEntry = [...map.values()].find((entry) => entry.title === 'Temperature')
      if (temperatureEntry != null) {
        temperatureEntry.ranges.push(range)
      }
    }

    return [...map.values()]
  }, [result])

  const fullDomain = useMemo(() => {
    const points = groupedSeries.flatMap((entry) => entry.series.flatMap((series) => series.points))
    if (points.length === 0) {
      return null
    }
    return {
      start: Math.min(...points.map((point) => point.timestamp)),
      end: Math.max(...points.map((point) => point.timestamp)),
    }
  }, [groupedSeries])

  const effectiveDomain = zoomDomain ?? fullDomain

  const submitDisabled =
    draftPlan == null ||
    (draftPlan.usesMinuteArchive && !validateMinuteArchiveLimit(draftPlan.minuteArchiveDates)) ||
    formState.variables.length === 0

  const handlePreset = useCallback((preset: PresetKey) => {
    const range = createPresetRange(preset)
    const nextResolution =
      preset === 'last-hour' || preset === 'last-3-hours' || preset === 'last-6-hours'
        ? 'hourly'
        : preset === 'year-to-date'
          ? 'monthly'
          : formState.resolution
    const nextVariables =
      nextResolution === formState.resolution
        ? formState.variables.filter((variable) =>
            availableVariablesForResolution(nextResolution).some((entry) => entry.key === variable),
          )
        : defaultVariablesForResolution(nextResolution)

    setFormState((previous) => ({
      ...previous,
      ...range,
      resolution: nextResolution,
      variables: nextVariables.length > 0 ? nextVariables : defaultVariablesForResolution(nextResolution),
      chartType:
        nextResolution === previous.resolution
          ? previous.chartType
          : defaultChartTypeForVariables(nextVariables),
    }))
  }, [formState.resolution, formState.variables])

  const handleResolutionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextResolution = event.target.value as CustomGraphFormState['resolution']
    const supportedVariables = availableVariablesForResolution(nextResolution)
    const filteredVariables = formState.variables.filter((variable) =>
      supportedVariables.some((entry) => entry.key === variable),
    )
    const nextVariables = filteredVariables.length > 0 ? filteredVariables : defaultVariablesForResolution(nextResolution)
    setFormState((previous) => ({
      ...previous,
      resolution: nextResolution,
      variables: nextVariables,
      chartType: defaultChartTypeForVariables(nextVariables),
      normalOverlay: nextResolution === 'minute' || nextResolution === 'hourly' ? false : previous.normalOverlay,
    }))
  }

  const toggleVariable = (variableKey: string) => {
    setFormState((previous) => {
      const present = previous.variables.includes(variableKey as never)
      const nextVariables = present
        ? previous.variables.filter((variable) => variable !== variableKey)
        : [...previous.variables, variableKey as never]
      return {
        ...previous,
        variables: nextVariables,
        chartType: defaultChartTypeForVariables(nextVariables),
      }
    })
  }

  const toggleLegendSeries = (seriesId: string) => {
    setHiddenSeriesIds((previous) => {
      const next = new Set(previous)
      if (next.has(seriesId)) {
        next.delete(seriesId)
      } else {
        next.add(seriesId)
      }
      return next
    })
  }

  const zoom = (factor: number) => {
    if (fullDomain == null) {
      return
    }

    const current = effectiveDomain ?? fullDomain
    const center = (current.start + current.end) / 2
    const halfRange = ((current.end - current.start) / 2) / factor
    const nextStart = Math.max(fullDomain.start, center - halfRange)
    const nextEnd = Math.min(fullDomain.end, center + halfRange)
    if (nextEnd - nextStart < 60_000) {
      return
    }
    setZoomDomain({ start: nextStart, end: nextEnd })
  }

  const handleSubmit = () => {
    setAppliedState(formState)
  }

  const handleCancelMinuteLoad = () => {
    minuteAbortControllerRef.current?.abort()
  }

  const handleCsvDownload = () => {
    if (result == null) {
      return
    }
    downloadCsvBlob(buildCustomGraphCsv(result.series), 'custom-graph-export.csv')
  }

  const handlePngDownload = async (svg: SVGSVGElement) => {
    await downloadSvgAsPng(svg, 'custom-graph-export.png')
  }

  const loadingClimate =
    appliedPlan != null && !appliedPlan.usesMinuteArchive && (annualQueriesLoading || dailyNormalsQuery.isLoading || monthlyNormalsQuery.isLoading)
  const climateError = annualQueriesError ?? dailyNormalsQuery.error ?? monthlyNormalsQuery.error ?? null

  return (
    <div className="custom-graphs-layout">
      <section className="card custom-graphs-controls-card">
        <div className="custom-graphs-controls-header">
          <div>
            <h2>Custom Graphs</h2>
            <p>
              Build interactive weather charts with Europe/London aggregation, archive-aware loading,
              exports and accessibility summaries.
            </p>
          </div>
          <div className="custom-graphs-export-row">
            <button type="button" className="button button-ghost" onClick={handleCsvDownload} disabled={result == null}>
              Export CSV
            </button>
          </div>
        </div>

        <p className="custom-graphs-note">
          Minute and hourly resolutions use archive JSONL day files and are limited to {MINUTE_ARCHIVE_MAX_DAYS} local
          day files per primary request so the complete minute archive is never fetched.
        </p>

        <div className="custom-graphs-preset-row" role="group" aria-label="Quick presets">
          {PRESET_BUTTONS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className="button button-ghost custom-graphs-preset-button"
              onClick={() => handlePreset(preset.key)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="custom-graphs-form-grid">
          <label className="custom-graphs-field">
            <span>Start date and time</span>
            <input
              type="datetime-local"
              value={formState.startDateTime}
              onChange={(event) => setFormState((previous) => ({ ...previous, startDateTime: event.target.value }))}
            />
          </label>
          <label className="custom-graphs-field">
            <span>End date and time</span>
            <input
              type="datetime-local"
              value={formState.endDateTime}
              onChange={(event) => setFormState((previous) => ({ ...previous, endDateTime: event.target.value }))}
            />
          </label>
          <label className="custom-graphs-field">
            <span>Resolution</span>
            <select value={formState.resolution} onChange={handleResolutionChange}>
              <option value="minute">Minute</option>
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="monthly">Monthly</option>
              <option value="annual">Annual</option>
            </select>
          </label>
          <label className="custom-graphs-field">
            <span>Aggregation</span>
            <select
              value={formState.aggregation}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  aggregation: event.target.value as CustomGraphFormState['aggregation'],
                }))
              }
            >
              <option value="mean">Mean</option>
              <option value="max">Max</option>
              <option value="min">Min</option>
              <option value="total">Total</option>
            </select>
          </label>
          <label className="custom-graphs-field">
            <span>Chart type</span>
            <select
              value={formState.chartType}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  chartType: event.target.value as CustomGraphChartType,
                }))
              }
            >
              <option value="line">Line</option>
              <option value="bar">Bar</option>
              <option value="area">Area</option>
              <option value="range">Range</option>
            </select>
          </label>
          <label className="custom-graphs-field">
            <span>Comparison series</span>
            <select
              value={formState.comparisonMode}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  comparisonMode: event.target.value as CustomGraphFormState['comparisonMode'],
                }))
              }
            >
              <option value="none">None</option>
              <option value="previous-period">Previous period</option>
              <option value="previous-year">Previous year</option>
            </select>
          </label>
        </div>

        <fieldset className="custom-graphs-variable-fieldset">
          <legend>Variables</legend>
          <div className="custom-graphs-variable-grid">
            {availableVariables.map((variable) => (
              <label key={variable.key} className="custom-graphs-checkbox">
                <input
                  type="checkbox"
                  checked={formState.variables.includes(variable.key)}
                  onChange={() => toggleVariable(variable.key)}
                />
                <span>{variable.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="custom-graphs-option-grid">
          <label className="custom-graphs-checkbox">
            <input
              type="checkbox"
              checked={formState.normalOverlay}
              disabled={formState.resolution === 'minute' || formState.resolution === 'hourly'}
              onChange={(event) => setFormState((previous) => ({ ...previous, normalOverlay: event.target.checked }))}
            />
            <span>Normal overlay</span>
          </label>
          <label className="custom-graphs-checkbox">
            <input
              type="checkbox"
              checked={formState.runningMean}
              onChange={(event) => setFormState((previous) => ({ ...previous, runningMean: event.target.checked }))}
            />
            <span>Running mean</span>
          </label>
          <label className="custom-graphs-checkbox">
            <input
              type="checkbox"
              checked={formState.cumulativeRainfall}
              onChange={(event) => setFormState((previous) => ({ ...previous, cumulativeRainfall: event.target.checked }))}
            />
            <span>Cumulative rainfall</span>
          </label>
          <label className="custom-graphs-checkbox">
            <input
              type="checkbox"
              checked={formState.temperatureRangeShading}
              disabled={formState.resolution === 'minute' || formState.resolution === 'hourly'}
              onChange={(event) => setFormState((previous) => ({ ...previous, temperatureRangeShading: event.target.checked }))}
            />
            <span>Temperature-range shading</span>
          </label>
          <label className="custom-graphs-field custom-graphs-field--compact">
            <span>Running mean window</span>
            <input
              type="number"
              min={2}
              max={24}
              value={formState.runningMeanWindow}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  runningMeanWindow: Math.min(24, Math.max(2, Number(event.target.value) || 2)),
                }))
              }
            />
          </label>
        </div>

        <div className="custom-graphs-plan-row">
          <div>
            {draftPlan == null ? (
              <IncompleteDataWarning message="Choose a valid Europe/London start/end range before generating a graph." />
            ) : draftPlan.usesMinuteArchive ? (
              <p>
                Estimated archive files: <strong>{draftPlan.minuteFileCountEstimate}</strong> ({draftPlan.minuteArchiveDates.length}{' '}
                primary{draftPlan.comparisonMinuteArchiveDates.length > 0 ? ` + ${draftPlan.comparisonMinuteArchiveDates.length} comparison` : ''}).
              </p>
            ) : (
              <p>
                Annual climate files required: <strong>{annualYearsToLoad.length || draftPlan.annualYears.length}</strong>.
              </p>
            )}
          </div>
          <div className="custom-graphs-action-row">
            {minuteState.status === 'loading' ? (
              <button type="button" className="button button-ghost" onClick={handleCancelMinuteLoad}>
                Cancel request
              </button>
            ) : null}
            <button type="button" className="button" onClick={handleSubmit} disabled={submitDisabled}>
              Generate graph
            </button>
          </div>
        </div>

        {draftPlan?.usesMinuteArchive && !validateMinuteArchiveLimit(draftPlan.minuteArchiveDates) ? (
          <IncompleteDataWarning
            message={`Minute and hourly requests may span at most ${MINUTE_ARCHIVE_MAX_DAYS} local day files. Narrow the primary range before fetching.`}
          />
        ) : null}
      </section>

      {loadingClimate || minuteState.status === 'loading' ? (
        <section className="card">
          <Skeleton lines={4} />
          <VisuallyHidden>Loading custom graph data</VisuallyHidden>
          {minuteState.status === 'loading' ? (
            <p className="custom-graphs-progress" role="status">
              Loading {minuteState.loadedFiles}/{minuteState.totalFiles} archive files and {minuteState.processedLines} parsed rows so far.
            </p>
          ) : null}
        </section>
      ) : null}

      {climateError != null ? (
        <ErrorState
          title="Custom graph data unavailable"
          message={climateError instanceof Error ? climateError.message : 'Unable to load custom graph data.'}
          onRetry={() => setAppliedState((previous) => ({ ...previous }))}
        />
      ) : null}

      {minuteState.status === 'error' && minuteState.error != null ? (
        <ErrorState title="Minute archive request failed" message={minuteState.error} />
      ) : null}

      {result != null ? (
        <>
          <section className="card custom-graphs-summary-card">
            <div className="custom-graphs-summary-header">
              <div>
                <h2>Selection summary</h2>
                <p>{result.summary}</p>
              </div>
              <div className="custom-graphs-action-row">
                <button type="button" className="button button-ghost" onClick={() => zoom(2)} disabled={effectiveDomain == null}>
                  Zoom in
                </button>
                <button type="button" className="button button-ghost" onClick={() => zoom(0.5)} disabled={effectiveDomain == null}>
                  Zoom out
                </button>
                <button type="button" className="button button-ghost" onClick={() => setZoomDomain(null)} disabled={zoomDomain == null}>
                  Reset zoom
                </button>
              </div>
            </div>
            <p className="custom-graphs-summary-meta">
              Source: {result.fromMinuteArchive ? 'Minute archive JSONL' : 'Annual climate JSON'} · Visible period:{' '}
              {appliedPlan != null
                ? `${formatLondonDateTimeDisplay(appliedPlan.primaryRange.startMs)} to ${formatLondonDateTimeDisplay(appliedPlan.primaryRange.endMs)}`
                : '—'}
            </p>
            {result.warnings.map((warning, index) => (
              <IncompleteDataWarning key={`${warning.code}-${index}`} message={warning.message} />
            ))}
          </section>

          <section className="card custom-graphs-legend-card">
            <h2>Legend controls</h2>
            <div className="custom-graphs-variable-grid">
              {result.series.map((entry) => (
                <label key={entry.id} className="custom-graphs-checkbox">
                  <input
                    type="checkbox"
                    checked={!entry.hidden}
                    onChange={() => toggleLegendSeries(entry.id)}
                  />
                  <span>
                    {entry.label}
                    {entry.dashed ? ' (overlay)' : ''}
                  </span>
                </label>
              ))}
            </div>
          </section>

          {effectiveDomain != null
            ? groupedSeries.map((entry) => (
                <GraphPanel
                  key={`${entry.title}-${entry.unit}`}
                  title={`${entry.title} (${entry.unit})`}
                  subtitle={`${entry.series.filter((series) => !series.hidden).length} visible series in the current graph group.`}
                  series={entry.series}
                  ranges={entry.ranges}
                  domain={effectiveDomain}
                  onDownloadPng={handlePngDownload}
                />
              ))
            : null}
        </>
      ) : null}
    </div>
  )
}
