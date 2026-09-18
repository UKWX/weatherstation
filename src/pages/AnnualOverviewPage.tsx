import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, ErrorState, ResponsiveChartContainer, Skeleton, TableWrapper } from '@/components/ui'
import { RAINFALL_START_DATE, TEMPERATURE_START_DATE } from '@/config/weather'
import {
  ANNUAL_OVERVIEW_CHART_HEIGHT,
  ANNUAL_OVERVIEW_CHART_WIDTH,
  ANNUAL_OVERVIEW_COLORS,
  buildAnnualOverviewExportSvg,
  buildLinePath,
  buildNormalBandPath,
  createAnnualOverviewChartGeometry,
  downloadAnnualOverviewPng,
  downloadAnnualOverviewSvg,
  getMonthBoundaries,
  getRecordMarkerColor,
  getRecordMarkerY,
  xForDay,
  yForValue,
} from '@/features/annualOverview/chart'
import {
  buildAnnualOverviewDataset,
  buildSelectableYears,
  getAnnualOverviewRecordLabel,
  type AnnualOverviewDay,
  type AnnualOverviewRecordEvent,
  type AnnualOverviewRecordType,
} from '@/features/annualOverview/model'
import { downloadSvgAsPng } from '@/features/customGraphs/png'
import { useCurrentClimateYear } from '@/hooks/useCurrentClimateYear'
import {
  useAnnualClimateQueries,
  useAnnualClimateQuery,
  useClimateArchiveIndexQuery,
} from '@/hooks/usePublicWeatherQueries'
import {
  compareClimateDates,
  daysInMonth,
  formatEuropeLondonDisplay,
  parseIsoClimateDate,
  toClimateDateString,
} from '@/lib/climate'
import type { AnnualClimatePayload, ClimateDateString, ClimateDay } from '@/types/weather'

const YEAR_PARAM_PATTERN = /^\d{4}$/
const TOOLTIP_OFFSET = 14
const RAINFALL_START_YEAR = parseIsoClimateDate(RAINFALL_START_DATE).year

const OVERVIEW_TABS = [
  { id: 'overview', label: 'Temperature overview' },
  { id: 'rainfall', label: 'Rainfall accumulation' },
  { id: 'comparison', label: 'Temperature comparison' },
] as const

const YEAR_LINE_COLORS = [
  '#c22b2b',
  '#2453c9',
  '#00897b',
  '#8e24aa',
  '#f57c00',
  '#5d4037',
  '#d81b60',
  '#3949ab',
  '#2e7d32',
  '#6d4c41',
] as const

type OverviewTabId = (typeof OVERVIEW_TABS)[number]['id']
type ExportScope = 'chart' | 'records' | 'both'
type ChartPointSeries = {
  readonly year: number
  readonly color: string
  readonly values: readonly (number | null)[]
}

export default function AnnualOverviewPage() {
  const currentClimateYear = useCurrentClimateYear()
  const archiveIndexQuery = useClimateArchiveIndexQuery()
  const [searchParams, setSearchParams] = useSearchParams()

  const availableArchiveYears = useMemo(
    () =>
      (archiveIndexQuery.data?.years ?? [])
        .map((entry) => entry.year)
        .sort((left, right) => left - right),
    [archiveIndexQuery.data],
  )
  const selectableYears = useMemo(() => {
    const startYear = parseIsoClimateDate(TEMPERATURE_START_DATE).year
    return buildSelectableYears(startYear, currentClimateYear)
  }, [currentClimateYear])

  const selectedYear = useMemo(() => {
    const yearParam = searchParams.get('year')
    const parsedYear =
      yearParam != null && YEAR_PARAM_PATTERN.test(yearParam) ? Number(yearParam) : null

    if (parsedYear != null && selectableYears.includes(parsedYear)) {
      return parsedYear
    }

    return currentClimateYear
  }, [currentClimateYear, searchParams, selectableYears])

  const selectedYearQuery = useAnnualClimateQuery(selectedYear)
  const historicalQueries = useAnnualClimateQueries(availableArchiveYears)

  const loadedHistoricalPayloads = useMemo(() => {
    const payloads = historicalQueries
      .map((query) => query.data)
      .filter((payload): payload is AnnualClimatePayload => payload != null)

    if (
      selectedYearQuery.data != null &&
      !payloads.some((payload) => payload.year === selectedYearQuery.data?.year)
    ) {
      payloads.push(selectedYearQuery.data)
    }

    return payloads.sort((left, right) => left.year - right.year)
  }, [historicalQueries, selectedYearQuery.data])

  const dataset = useMemo(
    () =>
      buildAnnualOverviewDataset({
        year: selectedYear,
        selectedYearRecords: selectedYearQuery.data?.records ?? [],
        historicalPayloads: loadedHistoricalPayloads,
      }),
    [loadedHistoricalPayloads, selectedYear, selectedYearQuery.data?.records],
  )

  const geometry = useMemo(() => createAnnualOverviewChartGeometry(dataset), [dataset])
  const monthBoundaries = useMemo(() => getMonthBoundaries(dataset), [dataset])
  const historicalPayloadsByYear = useMemo(
    () => new Map(loadedHistoricalPayloads.map((payload) => [payload.year, payload] as const)),
    [loadedHistoricalPayloads],
  )
  const loadedCount = historicalQueries.filter((query) => query.data != null).length

  const [activeTab, setActiveTab] = useState<OverviewTabId>('overview')
  const [exportScope, setExportScope] = useState<ExportScope>('both')
  const [showRecordOutlines, setShowRecordOutlines] = useState(true)
  const [selectedRainfallYears, setSelectedRainfallYears] = useState<readonly number[]>([])
  const [selectedComparisonYears, setSelectedComparisonYears] = useState<readonly number[]>([])
  const [rangeStart, setRangeStart] = useState<ClimateDateString>(
    toClimateDateString(selectedYear, 1, 1),
  )
  const [rangeEnd, setRangeEnd] = useState<ClimateDateString>(
    toClimateDateString(selectedYear, 12, 31),
  )

  const [hoverState, setHoverState] = useState<{
    readonly index: number
    readonly clientX: number
    readonly clientY: number
  } | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const rainfallChartRef = useRef<SVGSVGElement | null>(null)
  const comparisonChartRef = useRef<SVGSVGElement | null>(null)
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({ opacity: 0 })

  const defaultRangeEnd = useMemo<ClimateDateString>(() => {
    if (selectedYearQuery.data?.complete === false && selectedYearQuery.data.through != null) {
      return selectedYearQuery.data.through
    }
    return toClimateDateString(selectedYear, 12, 31)
  }, [selectedYear, selectedYearQuery.data?.complete, selectedYearQuery.data?.through])

  useEffect(() => {
    setRangeStart(toClimateDateString(selectedYear, 1, 1))
    setRangeEnd(defaultRangeEnd)
  }, [defaultRangeEnd, selectedYear])

  useEffect(() => {
    setSelectedComparisonYears((previous) => ensureSelectedYears(previous, selectedYear))
  }, [selectedYear])

  useEffect(() => {
    setSelectedRainfallYears((previous) => {
      const baseYears = availableArchiveYears.filter((year) => year >= RAINFALL_START_YEAR)
      if (baseYears.length === 0) {
        return []
      }
      const fallback = selectedYear >= RAINFALL_START_YEAR ? selectedYear : (baseYears.at(-1) ?? null)
      return ensureSelectedYears(previous, fallback)
    })
  }, [availableArchiveYears, selectedYear])

  useLayoutEffect(() => {
    if (hoverState == null) {
      setTooltipStyle({ opacity: 0 })
      return
    }

    const width = tooltipRef.current?.offsetWidth ?? 260
    const height = tooltipRef.current?.offsetHeight ?? 160
    setTooltipStyle(computeTooltipStyle(hoverState.clientX, hoverState.clientY, width, height))
  }, [hoverState])

  const title = `${selectedYear} Daily Temperature Data for Wakefield, United Kingdom`
  const subtitle = `Daily maximum & minimum vs. the ${dataset.normalPeriodLabel} normal range and all-time daily records`
  const footnote = buildFootnote(
    selectedYear,
    dataset.normalPeriodLabel,
    selectedYearQuery.data?.through ?? dataset.latestObservedDate,
    showRecordOutlines,
  )
  const recordSummary = buildRecordSummary(
    selectedYear,
    dataset.recordEvents.length,
    selectedYearQuery.data?.through ?? dataset.latestObservedDate,
  )

  const bandPath = buildNormalBandPath(dataset, geometry.yMin, geometry.yMax)
  const exportSvgMarkup = buildAnnualOverviewExportSvg({
    year: selectedYear,
    dataset,
    subtitle,
    footnote,
    recordSummary,
    includeChart: exportScope !== 'records',
    includeRecords: exportScope !== 'chart',
    showRecordOutlines,
  })

  const hoveredDay = hoverState != null ? dataset.days[hoverState.index] ?? null : null
  const recordEventsByDate = useMemo(() => {
    const map = new Map<ClimateDateString, AnnualOverviewRecordEvent[]>()
    for (const event of dataset.recordEvents) {
      const existing = map.get(event.date) ?? []
      existing.push(event)
      map.set(event.date, existing)
    }
    return map
  }, [dataset.recordEvents])

  const range = useMemo(() => normalizeDateRange(rangeStart, rangeEnd), [rangeEnd, rangeStart])
  const rangeDays = useMemo(
    () =>
      dataset.days.filter(
        (day) =>
          compareClimateDates(day.date, range.start) >= 0 &&
          compareClimateDates(day.date, range.end) <= 0,
      ),
    [dataset.days, range.end, range.start],
  )
  const rainfallYears = useMemo(
    () => availableArchiveYears.filter((year) => year >= RAINFALL_START_YEAR),
    [availableArchiveYears],
  )
  const comparisonYears = useMemo(
    () => availableArchiveYears.filter((year) => year >= parseIsoClimateDate(TEMPERATURE_START_DATE).year),
    [availableArchiveYears],
  )
  const rainfallSeries = useMemo(
    () =>
      selectedRainfallYears
        .map((year, index) => buildRainfallSeries(year, historicalPayloadsByYear.get(year), rangeDays, index))
        .filter((series): series is ChartPointSeries => series != null),
    [historicalPayloadsByYear, rangeDays, selectedRainfallYears],
  )
  const comparisonSeries = useMemo(
    () =>
      selectedComparisonYears
        .map((year, index) =>
          buildTemperatureSeries(year, historicalPayloadsByYear.get(year), rangeDays, index),
        )
        .filter((series): series is { readonly year: number; readonly color: string; readonly maxValues: readonly (number | null)[]; readonly minValues: readonly (number | null)[] } => series != null),
    [historicalPayloadsByYear, rangeDays, selectedComparisonYears],
  )

  if (archiveIndexQuery.isLoading && archiveIndexQuery.data == null) {
    return (
      <section className="card" aria-live="polite">
        <Skeleton lines={6} />
      </section>
    )
  }

  if (archiveIndexQuery.error != null && archiveIndexQuery.data == null) {
    return (
      <ErrorState
        title="Annual overview unavailable"
        message="Unable to load the weather-station archive index right now."
        onRetry={() => {
          void archiveIndexQuery.refetch()
        }}
      />
    )
  }

  const handleSvgExport = () => {
    if (activeTab === 'overview') {
      downloadAnnualOverviewSvg(
        exportSvgMarkup,
        `wakefield-${selectedYear}-annual-overview-${exportScope}.svg`,
      )
      return
    }

    const svg = activeTab === 'rainfall' ? rainfallChartRef.current : comparisonChartRef.current
    if (svg == null) {
      return
    }
    downloadAnnualOverviewSvg(
      serializeSvgElement(svg),
      `wakefield-${selectedYear}-${activeTab}${buildRangeSlug(range.start, range.end)}.svg`,
    )
  }

  const handlePngExport = async () => {
    if (activeTab === 'overview') {
      await downloadAnnualOverviewPng(
        exportSvgMarkup,
        `wakefield-${selectedYear}-annual-overview-${exportScope}.png`,
      )
      return
    }

    const svg = activeTab === 'rainfall' ? rainfallChartRef.current : comparisonChartRef.current
    if (svg == null) {
      return
    }
    await downloadSvgAsPng(
      svg,
      `wakefield-${selectedYear}-${activeTab}${buildRangeSlug(range.start, range.end)}.png`,
    )
  }

  return (
    <div className="archive-layout annual-overview-layout">
      <section className="card annual-overview-summary-card">
        <div className="archive-card-heading">
          <h2>{currentClimateYear} OVERVIEW</h2>
          <Badge variant={selectedYearQuery.data?.complete === false ? 'provisional' : 'success'}>
            {selectedYearQuery.data?.complete === false ? 'Provisional coverage' : 'Archive available'}
          </Badge>
        </div>
        <p>
          Annual temperature overview, rainfall accumulation overlays, year-to-year temperature
          comparisons, zoomable date ranges, and standalone chart export.
        </p>
      </section>

      <nav aria-label="Annual overview sections">
        <div className="annual-overview-tab-bar" role="tablist">
          {OVERVIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={
                activeTab === tab.id
                  ? 'annual-overview-tab annual-overview-tab--active'
                  : 'annual-overview-tab'
              }
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <section className="card archive-controls annual-overview-controls">
        <div className="archive-controls-row">
          <label className="archive-label" htmlFor="annual-overview-year-select">
            Year
          </label>
          <select
            id="annual-overview-year-select"
            className="archive-select"
            value={selectedYear}
            onChange={(event) => {
              const nextYear = Number(event.target.value)
              setSearchParams((previous) => {
                const next = new URLSearchParams(previous)
                next.set('year', String(nextYear))
                return next
              }, { replace: true })
            }}
          >
            {[...selectableYears].sort((left, right) => right - left).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>

          {activeTab === 'overview' ? (
            <>
              <label className="archive-label" htmlFor="annual-overview-export-scope">
                PNG/SVG content
              </label>
              <select
                id="annual-overview-export-scope"
                className="archive-select"
                value={exportScope}
                onChange={(event) => setExportScope(event.target.value as ExportScope)}
              >
                <option value="chart">Chart only</option>
                <option value="records">Records only</option>
                <option value="both">Chart + records</option>
              </select>
              <label className="archive-toggle-label">
                <input
                  type="checkbox"
                  checked={showRecordOutlines}
                  onChange={(event) => setShowRecordOutlines(event.target.checked)}
                />
                <span>Show record outlines</span>
              </label>
              <span className="annual-overview-baseline-note">
                Normal period: {dataset.normalPeriodLabel}
              </span>
            </>
          ) : (
            <>
              <label className="archive-label" htmlFor="annual-overview-range-start">
                Zoom from
              </label>
              <input
                id="annual-overview-range-start"
                type="date"
                className="archive-select annual-overview-date-input"
                min={toClimateDateString(selectedYear, 1, 1)}
                max={toClimateDateString(selectedYear, 12, 31)}
                value={range.start}
                onChange={(event) => setRangeStart(event.target.value as ClimateDateString)}
              />
              <label className="archive-label" htmlFor="annual-overview-range-end">
                to
              </label>
              <input
                id="annual-overview-range-end"
                type="date"
                className="archive-select annual-overview-date-input"
                min={toClimateDateString(selectedYear, 1, 1)}
                max={toClimateDateString(selectedYear, 12, 31)}
                value={range.end}
                onChange={(event) => setRangeEnd(event.target.value as ClimateDateString)}
              />
              <span className="annual-overview-baseline-note">
                {activeTab === 'rainfall'
                  ? `Rainfall records begin on ${formatEuropeLondonDisplay(RAINFALL_START_DATE)}.`
                  : 'Solid lines show maxima and dashed lines show minima.'}
              </span>
            </>
          )}

          <span className="annual-overview-baseline-note">
            Loaded archive years: {loadedCount}/{availableArchiveYears.length}
          </span>
          <div className="annual-overview-export-actions">
            <button type="button" className="button" onClick={handleSvgExport}>
              Export SVG
            </button>
            <button type="button" className="button button-outline" onClick={() => void handlePngExport()}>
              Export PNG
            </button>
          </div>
        </div>
      </section>

      {activeTab === 'overview' ? (
        <>
          <section className="card annual-overview-chart-card">
            <div className="annual-overview-header">
              <div>
                <h2>{title}</h2>
                <p>{subtitle}</p>
              </div>
              {selectedYearQuery.data?.through != null ? (
                <p className="annual-overview-through">
                  Data available through {formatEuropeLondonDisplay(selectedYearQuery.data.through)}
                </p>
              ) : null}
            </div>

            <div className="annual-overview-legend" aria-label="Annual overview legend">
              <span><i className="annual-overview-swatch annual-overview-swatch--band" />Normal range</span>
              <span><i className="annual-overview-swatch annual-overview-swatch--rolling" />7-day rolling mean</span>
              <span><i className="annual-overview-swatch annual-overview-swatch--max" />Max Temp (°C)</span>
              <span><i className="annual-overview-swatch annual-overview-swatch--min" />Min Temp (°C)</span>
              <span><i className="annual-overview-swatch annual-overview-swatch--record-high" />Absolute max on record</span>
              <span><i className="annual-overview-swatch annual-overview-swatch--record-low" />Absolute min on record</span>
              {showRecordOutlines ? (
                <span><i className="annual-overview-swatch annual-overview-swatch--marker" />Record outline</span>
              ) : null}
            </div>

            <ResponsiveChartContainer size="detail" minWidth={1150}>
              <div className="annual-overview-chart-canvas">
                <svg
                  viewBox={`0 0 ${ANNUAL_OVERVIEW_CHART_WIDTH} ${ANNUAL_OVERVIEW_CHART_HEIGHT}`}
                  className="annual-overview-chart-svg"
                  role="img"
                  aria-label={title}
                >
                  <defs>
                    <linearGradient
                      id="annual-overview-band"
                      x1="0"
                      y1="112"
                      x2="0"
                      y2={ANNUAL_OVERVIEW_CHART_HEIGHT - 82}
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop offset="0%" stopColor="#f2922f" />
                      <stop offset="18%" stopColor="#f2922f" />
                      <stop offset="34%" stopColor="#ffd955" />
                      <stop offset="54%" stopColor="#4caf50" />
                      <stop offset="72%" stopColor="#c3e9b6" />
                      <stop offset="88%" stopColor="#2f7fd6" />
                      <stop offset="100%" stopColor="#0f3f6e" />
                    </linearGradient>
                  </defs>

                  {geometry.yTicks.map((tick) => {
                    const y = yForValue(tick, geometry.yMin, geometry.yMax)
                    return (
                      <g key={tick}>
                        <line
                          x1={72}
                          x2={ANNUAL_OVERVIEW_CHART_WIDTH - 34}
                          y1={y}
                          y2={y}
                          stroke={ANNUAL_OVERVIEW_COLORS.grid}
                          strokeWidth={tick === 0 ? 1.4 : 1}
                        />
                        <text
                          x={64}
                          y={y + 4}
                          textAnchor="end"
                          fontSize="11"
                          fill={ANNUAL_OVERVIEW_COLORS.sub}
                        >
                          {tick}
                        </text>
                      </g>
                    )
                  })}

                  {monthBoundaries.map((month) => {
                    const startX = xForDay(month.startIndex, dataset.days.length)
                    const endX = xForDay(month.endIndex, dataset.days.length)
                    const labelX = (startX + endX) / 2
                    return (
                      <g key={month.month}>
                        <line
                          x1={startX}
                          x2={startX}
                          y1={94}
                          y2={ANNUAL_OVERVIEW_CHART_HEIGHT - 82}
                          stroke={ANNUAL_OVERVIEW_COLORS.monthLine}
                        />
                        <text
                          x={labelX}
                          y={84}
                          textAnchor="middle"
                          fontSize="12.5"
                          fontWeight="700"
                          fill={ANNUAL_OVERVIEW_COLORS.ink}
                        >
                          {month.shortLabel.toUpperCase()}
                        </text>
                      </g>
                    )
                  })}

                  {bandPath != null ? (
                    <path d={bandPath} fill="url(#annual-overview-band)" fillOpacity="0.62" />
                  ) : null}

                  <path
                    d={buildLinePath(dataset, (day) => day.normalMaxC, geometry.yMin, geometry.yMax)}
                    fill="none"
                    stroke={ANNUAL_OVERVIEW_COLORS.bandEdge}
                    strokeWidth="1"
                    opacity="0.55"
                  />
                  <path
                    d={buildLinePath(dataset, (day) => day.normalMinC, geometry.yMin, geometry.yMax)}
                    fill="none"
                    stroke={ANNUAL_OVERVIEW_COLORS.bandEdge}
                    strokeWidth="1"
                    opacity="0.55"
                  />
                  <path
                    d={buildLinePath(dataset, (day) => day.recordHighMaxC, geometry.yMin, geometry.yMax)}
                    fill="none"
                    stroke={ANNUAL_OVERVIEW_COLORS.recordHighMax}
                    strokeWidth="1.4"
                    strokeDasharray="6 4"
                    opacity="0.9"
                  />
                  <path
                    d={buildLinePath(dataset, (day) => day.recordLowMinC, geometry.yMin, geometry.yMax)}
                    fill="none"
                    stroke={ANNUAL_OVERVIEW_COLORS.recordLowMin}
                    strokeWidth="1.4"
                    strokeDasharray="6 4"
                    opacity="0.9"
                  />
                  <path
                    d={buildLinePath(dataset, (day) => day.actualMaxC, geometry.yMin, geometry.yMax)}
                    fill="none"
                    stroke={ANNUAL_OVERVIEW_COLORS.actualMax}
                    strokeWidth="2.4"
                    strokeLinejoin="round"
                  />
                  <path
                    d={buildLinePath(dataset, (day) => day.actualMinC, geometry.yMin, geometry.yMax)}
                    fill="none"
                    stroke={ANNUAL_OVERVIEW_COLORS.actualMin}
                    strokeWidth="2.4"
                    strokeLinejoin="round"
                  />
                  <path
                    d={buildLinePath(dataset, (day) => day.rollingMeanC, geometry.yMin, geometry.yMax)}
                    fill="none"
                    stroke={ANNUAL_OVERVIEW_COLORS.rollingMean}
                    strokeWidth="3.4"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />

                  {showRecordOutlines
                    ? dataset.days.flatMap((day) =>
                        day.recordFlags.map((type) => {
                          const cy = getRecordMarkerY(day, type, geometry.yMin, geometry.yMax)
                          if (cy == null) {
                            return null
                          }
                          return (
                            <circle
                              key={`${day.date}-${type}`}
                              cx={xForDay(day.index, dataset.days.length)}
                              cy={cy}
                              r="6.5"
                              fill="none"
                              stroke={getRecordMarkerColor(type)}
                              strokeWidth="2.4"
                            />
                          )
                        }),
                      )
                    : null}

                  <rect
                    x="72"
                    y="112"
                    width={geometry.plotWidth}
                    height={geometry.plotHeight}
                    fill="none"
                    stroke="#c7ced4"
                  />

                  {monthBoundaries.map((month) => {
                    const day = dataset.days[month.startIndex]
                    if (day == null) {
                      return null
                    }
                    const tickX = xForDay(month.startIndex, dataset.days.length)
                    return (
                      <text
                        key={`tick-${month.month}`}
                        x={tickX}
                        y={ANNUAL_OVERVIEW_CHART_HEIGHT - 24}
                        transform={`rotate(-55 ${tickX} ${ANNUAL_OVERVIEW_CHART_HEIGHT - 24})`}
                        textAnchor="end"
                        fontSize="11"
                        fill={ANNUAL_OVERVIEW_COLORS.sub}
                      >
                        {formatEuropeLondonDisplay(day.date, { day: '2-digit', month: 'short' })}
                      </text>
                    )
                  })}

                  <text
                    x="26"
                    y={112 + geometry.plotHeight / 2}
                    transform={`rotate(-90 26 ${112 + geometry.plotHeight / 2})`}
                    fontSize="12"
                    fill={ANNUAL_OVERVIEW_COLORS.sub}
                  >
                    Temperature (°C)
                  </text>

                  {hoveredDay != null ? (
                    <line
                      x1={xForDay(hoveredDay.index, dataset.days.length)}
                      x2={xForDay(hoveredDay.index, dataset.days.length)}
                      y1="112"
                      y2={112 + geometry.plotHeight}
                      stroke={ANNUAL_OVERVIEW_COLORS.crosshair}
                      strokeWidth="1"
                      strokeDasharray="3 3"
                    />
                  ) : null}

                  <rect
                    x="72"
                    y="112"
                    width={geometry.plotWidth}
                    height={geometry.plotHeight}
                    fill="transparent"
                    onPointerLeave={() => setHoverState(null)}
                    onPointerMove={(event) => {
                      if (dataset.days.length === 0) {
                        return
                      }
                      const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect()
                      if (rect == null) {
                        return
                      }
                      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
                      const index = Math.round(ratio * (dataset.days.length - 1))
                      setHoverState({ index, clientX: event.clientX, clientY: event.clientY })
                    }}
                    style={{ touchAction: 'none' }}
                  />
                </svg>

                {hoveredDay != null ? (
                  <div ref={tooltipRef} className="annual-overview-tooltip" style={tooltipStyle}>
                    <AnnualOverviewTooltip
                      day={hoveredDay}
                      events={recordEventsByDate.get(hoveredDay.date) ?? []}
                    />
                  </div>
                ) : null}
              </div>
            </ResponsiveChartContainer>

            <p className="annual-overview-footnote">{footnote}</p>
          </section>

          <section className="card annual-overview-records-card">
            <h2>New daily records set in {selectedYear}</h2>
            <p>{recordSummary}</p>
            {dataset.recordEvents.length === 0 ? null : (
              <TableWrapper>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Record type</th>
                      <th scope="col">{selectedYear} value</th>
                      <th scope="col">Previous record</th>
                      <th scope="col">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.recordEvents.map((event) => (
                      <tr key={`${event.date}-${event.type}`}>
                        <td>{formatEuropeLondonDisplay(event.date)}</td>
                        <td>
                          <span
                            className="annual-overview-record-tag"
                            style={{ backgroundColor: getRecordMarkerColor(event.type) }}
                          >
                            {getAnnualOverviewRecordLabel(event.type)}
                          </span>
                        </td>
                        <td>{event.currentValueC.toFixed(1)}°C</td>
                        <td>{formatPreviousRecordLabel(event)}</td>
                        <td>+{event.marginC.toFixed(1)}°C</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrapper>
            )}
          </section>
        </>
      ) : null}

      {activeTab === 'rainfall' ? (
        <section className="card annual-overview-chart-card">
          <div className="annual-overview-header">
            <div>
              <h2>Rainfall accumulation by year</h2>
              <p>
                Compare cumulative rainfall since 2020 and export the currently selected zoomed
                view.
              </p>
            </div>
          </div>

          <YearToggleList
            label="Rainfall years"
            years={rainfallYears}
            selectedYears={selectedRainfallYears}
            onToggle={(year, checked) =>
              setSelectedRainfallYears((previous) =>
                toggleSelectedYear(previous, year, checked, rainfallYears.at(-1) ?? null),
              )
            }
          />

          <ResponsiveChartContainer size="detail" minWidth={1150}>
            <RainfallComparisonChart ref={rainfallChartRef} days={rangeDays} series={rainfallSeries} />
          </ResponsiveChartContainer>
        </section>
      ) : null}

      {activeTab === 'comparison' ? (
        <section className="card annual-overview-chart-card">
          <div className="annual-overview-header">
            <div>
              <h2>Temperature comparison by year</h2>
              <p>
                Overlay daily maxima and minima for any archive year since 1995 and zoom into any
                period for like-for-like comparison.
              </p>
            </div>
          </div>

          <YearToggleList
            label="Temperature years"
            years={comparisonYears}
            selectedYears={selectedComparisonYears}
            onToggle={(year, checked) =>
              setSelectedComparisonYears((previous) =>
                toggleSelectedYear(previous, year, checked, selectedYear),
              )
            }
          />

          <ResponsiveChartContainer size="detail" minWidth={1150}>
            <TemperatureComparisonChart
              ref={comparisonChartRef}
              days={rangeDays}
              series={comparisonSeries}
            />
          </ResponsiveChartContainer>
        </section>
      ) : null}
    </div>
  )
}

function AnnualOverviewTooltip({
  day,
  events,
}: {
  readonly day: AnnualOverviewDay
  readonly events: readonly AnnualOverviewRecordEvent[]
}) {
  const recordBits = day.recordFlags.map((flag) => getTooltipRecordLabel(flag))

  return (
    <>
      <div className="annual-overview-tooltip__title">
        {formatEuropeLondonDisplay(day.date, { day: 'numeric', month: 'long', year: 'numeric' })}
      </div>
      <TooltipRow label="Max" value={formatNullableTemperature(day.actualMaxC)} />
      <TooltipRow label="Min" value={formatNullableTemperature(day.actualMinC)} />
      <TooltipRow label="7-day mean" value={formatNullableTemperature(day.rollingMeanC)} />
      <TooltipRow
        label="Normal range"
        value={`${formatNullableTemperature(day.normalMinC, false)}–${formatNullableTemperature(day.normalMaxC, false)}°C`}
      />
      <TooltipRow
        label="Record range"
        value={`${formatNullableTemperature(day.recordLowMinC, false)}–${formatNullableTemperature(day.recordHighMaxC, false)}°C`}
      />
      {recordBits.length > 0 ? (
        <div className="annual-overview-tooltip__record">{recordBits.join(' · ')}</div>
      ) : null}
      {events.map((event) => (
        <div key={`${event.date}-${event.type}`} className="annual-overview-tooltip__detail">
          {getAnnualOverviewRecordLabel(event.type)}: previous {formatPreviousRecordLabel(event)}
        </div>
      ))}
    </>
  )
}

function TooltipRow({
  label,
  value,
}: {
  readonly label: string
  readonly value: string
}) {
  return (
    <div className="annual-overview-tooltip__row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function YearToggleList({
  label,
  years,
  selectedYears,
  onToggle,
}: {
  readonly label: string
  readonly years: readonly number[]
  readonly selectedYears: readonly number[]
  readonly onToggle: (year: number, checked: boolean) => void
}) {
  return (
    <section className="annual-overview-year-selector" aria-label={label}>
      <p className="annual-overview-year-selector__label">{label}</p>
      <div className="annual-overview-year-grid">
        {[...years].sort((left, right) => right - left).map((year) => (
          <label key={year} className="annual-overview-year-pill">
            <input
              type="checkbox"
              checked={selectedYears.includes(year)}
              onChange={(event) => onToggle(year, event.target.checked)}
            />
            <span>{year}</span>
          </label>
        ))}
      </div>
    </section>
  )
}

const RainfallComparisonChart = forwardRef<SVGSVGElement, {
  readonly days: readonly AnnualOverviewDay[]
  readonly series: readonly ChartPointSeries[]
}>(({ days, series }, ref) => {
  const domain = computeChartDomain(series.flatMap((entry) => entry.values), 0, 10)
  const ticks = buildTicks(domain.min, domain.max, Math.max(10, roundStep((domain.max - domain.min) / 5)))
  const monthSections = buildRangeMonthSections(days)

  return (
    <svg
      ref={ref}
      width="100%"
      viewBox={`0 0 ${ANNUAL_OVERVIEW_CHART_WIDTH} ${ANNUAL_OVERVIEW_CHART_HEIGHT}`}
      role="img"
      aria-label="Rainfall accumulation comparison by year"
      className="annual-overview-chart-svg"
    >
      {ticks.map((tick) => {
        const y = yForValue(tick, domain.min, domain.max)
        return (
          <g key={tick}>
            <line
              x1={72}
              x2={ANNUAL_OVERVIEW_CHART_WIDTH - 34}
              y1={y}
              y2={y}
              stroke={ANNUAL_OVERVIEW_COLORS.grid}
              strokeWidth={tick === 0 ? 1.4 : 1}
            />
            <text x={64} y={y + 4} textAnchor="end" fontSize="11" fill={ANNUAL_OVERVIEW_COLORS.sub}>
              {tick}
            </text>
          </g>
        )
      })}

      {monthSections.map((section) => {
        const startX = xForDay(section.startIndex, Math.max(days.length, 1))
        const endX = xForDay(section.endIndex, Math.max(days.length, 1))
        const labelX = (startX + endX) / 2
        return (
          <g key={`${section.month}-${section.startIndex}`}>
            <line
              x1={startX}
              x2={startX}
              y1={94}
              y2={ANNUAL_OVERVIEW_CHART_HEIGHT - 82}
              stroke={ANNUAL_OVERVIEW_COLORS.monthLine}
            />
            <text x={labelX} y={84} textAnchor="middle" fontSize="12.5" fontWeight="700" fill={ANNUAL_OVERVIEW_COLORS.ink}>
              {section.shortLabel.toUpperCase()}
            </text>
          </g>
        )
      })}

      {series.map((entry) => {
        const path = buildValuesPath(entry.values, domain.min, domain.max)
        return path.length > 0 ? (
          <path
            key={entry.year}
            d={path}
            fill="none"
            stroke={entry.color}
            strokeWidth="2.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null
      })}

      <rect x="72" y="112" width={ANNUAL_OVERVIEW_CHART_WIDTH - 106} height={ANNUAL_OVERVIEW_CHART_HEIGHT - 194} fill="none" stroke="#c7ced4" />

      {days.map((day, index) =>
        index === 0 || day.month !== days[index - 1]?.month ? (
          <text
            key={day.date}
            x={xForDay(index, Math.max(days.length, 1))}
            y={ANNUAL_OVERVIEW_CHART_HEIGHT - 24}
            transform={`rotate(-55 ${xForDay(index, Math.max(days.length, 1))} ${ANNUAL_OVERVIEW_CHART_HEIGHT - 24})`}
            textAnchor="end"
            fontSize="11"
            fill={ANNUAL_OVERVIEW_COLORS.sub}
          >
            {formatEuropeLondonDisplay(day.date, { day: '2-digit', month: 'short' })}
          </text>
        ) : null,
      )}

      <text
        x="26"
        y={112 + (ANNUAL_OVERVIEW_CHART_HEIGHT - 194) / 2}
        transform={`rotate(-90 26 ${112 + (ANNUAL_OVERVIEW_CHART_HEIGHT - 194) / 2})`}
        fontSize="12"
        fill={ANNUAL_OVERVIEW_COLORS.sub}
      >
        Rainfall accumulation (mm)
      </text>

      <ChartLegend
        items={series.map((entry) => ({ label: String(entry.year), color: entry.color, dashed: false }))}
        note="Each line shows cumulative rainfall through the selected dates."
      />
      {series.length === 0 ? <EmptyChartMessage message="Select at least one rainfall year." /> : null}
    </svg>
  )
})

const TemperatureComparisonChart = forwardRef<SVGSVGElement, {
  readonly days: readonly AnnualOverviewDay[]
  readonly series: readonly {
    readonly year: number
    readonly color: string
    readonly maxValues: readonly (number | null)[]
    readonly minValues: readonly (number | null)[]
  }[]
}>(({ days, series }, ref) => {
  const values = series.flatMap((entry) => [...entry.maxValues, ...entry.minValues])
  const domain = computeChartDomain(values, -5, 25)
  const ticks = buildTicks(domain.min, domain.max, 5)
  const monthSections = buildRangeMonthSections(days)

  return (
    <svg
      ref={ref}
      width="100%"
      viewBox={`0 0 ${ANNUAL_OVERVIEW_CHART_WIDTH} ${ANNUAL_OVERVIEW_CHART_HEIGHT}`}
      role="img"
      aria-label="Temperature comparison by year"
      className="annual-overview-chart-svg"
    >
      {ticks.map((tick) => {
        const y = yForValue(tick, domain.min, domain.max)
        return (
          <g key={tick}>
            <line
              x1={72}
              x2={ANNUAL_OVERVIEW_CHART_WIDTH - 34}
              y1={y}
              y2={y}
              stroke={ANNUAL_OVERVIEW_COLORS.grid}
              strokeWidth={tick === 0 ? 1.4 : 1}
            />
            <text x={64} y={y + 4} textAnchor="end" fontSize="11" fill={ANNUAL_OVERVIEW_COLORS.sub}>
              {tick}
            </text>
          </g>
        )
      })}

      {monthSections.map((section) => {
        const startX = xForDay(section.startIndex, Math.max(days.length, 1))
        const endX = xForDay(section.endIndex, Math.max(days.length, 1))
        const labelX = (startX + endX) / 2
        return (
          <g key={`${section.month}-${section.startIndex}`}>
            <line
              x1={startX}
              x2={startX}
              y1={94}
              y2={ANNUAL_OVERVIEW_CHART_HEIGHT - 82}
              stroke={ANNUAL_OVERVIEW_COLORS.monthLine}
            />
            <text x={labelX} y={84} textAnchor="middle" fontSize="12.5" fontWeight="700" fill={ANNUAL_OVERVIEW_COLORS.ink}>
              {section.shortLabel.toUpperCase()}
            </text>
          </g>
        )
      })}

      {series.flatMap((entry) => {
        const maxPath = buildValuesPath(entry.maxValues, domain.min, domain.max)
        const minPath = buildValuesPath(entry.minValues, domain.min, domain.max)
        return [
          maxPath.length > 0 ? (
            <path
              key={`${entry.year}-max`}
              d={maxPath}
              fill="none"
              stroke={entry.color}
              strokeWidth="2.4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null,
          minPath.length > 0 ? (
            <path
              key={`${entry.year}-min`}
              d={minPath}
              fill="none"
              stroke={entry.color}
              strokeWidth="2.2"
              strokeDasharray="6 4"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity="0.95"
            />
          ) : null,
        ]
      })}

      <rect x="72" y="112" width={ANNUAL_OVERVIEW_CHART_WIDTH - 106} height={ANNUAL_OVERVIEW_CHART_HEIGHT - 194} fill="none" stroke="#c7ced4" />

      {days.map((day, index) =>
        index === 0 || day.month !== days[index - 1]?.month ? (
          <text
            key={day.date}
            x={xForDay(index, Math.max(days.length, 1))}
            y={ANNUAL_OVERVIEW_CHART_HEIGHT - 24}
            transform={`rotate(-55 ${xForDay(index, Math.max(days.length, 1))} ${ANNUAL_OVERVIEW_CHART_HEIGHT - 24})`}
            textAnchor="end"
            fontSize="11"
            fill={ANNUAL_OVERVIEW_COLORS.sub}
          >
            {formatEuropeLondonDisplay(day.date, { day: '2-digit', month: 'short' })}
          </text>
        ) : null,
      )}

      <text
        x="26"
        y={112 + (ANNUAL_OVERVIEW_CHART_HEIGHT - 194) / 2}
        transform={`rotate(-90 26 ${112 + (ANNUAL_OVERVIEW_CHART_HEIGHT - 194) / 2})`}
        fontSize="12"
        fill={ANNUAL_OVERVIEW_COLORS.sub}
      >
        Temperature (°C)
      </text>

      <ChartLegend
        items={series.map((entry) => ({ label: String(entry.year), color: entry.color, dashed: false }))}
        note="Solid lines show daily maxima and dashed lines show daily minima."
      />
      {series.length === 0 ? <EmptyChartMessage message="Select at least one temperature year." /> : null}
    </svg>
  )
})

function ChartLegend({
  items,
  note,
}: {
  readonly items: readonly { readonly label: string; readonly color: string; readonly dashed: boolean }[]
  readonly note: string
}) {
  return (
    <g transform="translate(84 36)">
      {items.map((item, index) => (
        <g key={item.label} transform={`translate(${index * 104} 0)`}>
          <line
            x1="0"
            x2="24"
            y1="0"
            y2="0"
            stroke={item.color}
            strokeWidth="3"
            strokeDasharray={item.dashed ? '6 4' : undefined}
          />
          <text x="32" y="4" fontSize="12" fill={ANNUAL_OVERVIEW_COLORS.ink}>
            {item.label}
          </text>
        </g>
      ))}
      <text x="0" y="26" fontSize="11.5" fill={ANNUAL_OVERVIEW_COLORS.sub}>
        {note}
      </text>
    </g>
  )
}

function EmptyChartMessage({ message }: { readonly message: string }) {
  return (
    <text
      x={ANNUAL_OVERVIEW_CHART_WIDTH / 2}
      y={ANNUAL_OVERVIEW_CHART_HEIGHT / 2}
      textAnchor="middle"
      fontSize="14"
      fill={ANNUAL_OVERVIEW_COLORS.sub}
    >
      {message}
    </text>
  )
}

function computeTooltipStyle(
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): CSSProperties {
  let left = clientX + TOOLTIP_OFFSET
  let top = clientY + TOOLTIP_OFFSET

  if (left + width + 8 > window.innerWidth) {
    left = clientX - width - TOOLTIP_OFFSET
  }
  if (top + height + 8 > window.innerHeight) {
    top = clientY - height - TOOLTIP_OFFSET
  }

  left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
  top = Math.max(8, Math.min(top, window.innerHeight - height - 8))

  return {
    position: 'fixed',
    left,
    top,
    opacity: 1,
  }
}

function formatNullableTemperature(value: number | null, withUnit = true): string {
  if (value == null) {
    return '—'
  }

  return withUnit ? `${value.toFixed(1)}°C` : value.toFixed(1)
}

function getTooltipRecordLabel(type: AnnualOverviewRecordType): string {
  switch (type) {
    case 'record-high-max':
      return 'New record high (max)'
    case 'record-low-max':
      return 'New record low (max)'
    case 'record-high-min':
      return 'New record high minimum'
    case 'record-low-min':
      return 'New record low (min)'
  }
}

function buildFootnote(
  year: number,
  normalPeriodLabel: string,
  throughDate: string | null | undefined,
  showRecordOutlines: boolean,
): string {
  const throughText =
    throughDate != null ? `Data year to date runs to ${formatEuropeLondonDisplay(throughDate)}.` : ''
  const markerText = showRecordOutlines
    ? `Outlined points are new all-time daily records set in ${year}.`
    : ''
  return `Shaded band shows the ${normalPeriodLabel} normal range between the average daily maximum and minimum, coloured by temperature. Dashed lines mark the all-time daily record maximum and minimum for each calendar day. ${markerText} ${throughText}`.trim()
}

function buildRecordSummary(
  year: number,
  count: number,
  throughDate: string | null | undefined,
): string {
  if (count === 0) {
    return `No new all-time daily records were set in ${year}${
      throughDate != null ? ` through ${formatEuropeLondonDisplay(throughDate)}.` : '.'
    }`
  }

  return `${count} new all-time daily records for Wakefield were set in ${year}${
    throughDate != null ? ` through ${formatEuropeLondonDisplay(throughDate)}.` : '.'
  }`
}

function normalizeDateRange(
  startDate: ClimateDateString,
  endDate: ClimateDateString,
): { readonly start: ClimateDateString; readonly end: ClimateDateString } {
  return compareClimateDates(startDate, endDate) <= 0
    ? { start: startDate, end: endDate }
    : { start: endDate, end: startDate }
}

function ensureSelectedYears(
  years: readonly number[],
  preferredYear: number | null,
): readonly number[] {
  const unique = [...new Set(years)].sort((left, right) => left - right)
  if (preferredYear == null) {
    return unique
  }
  return unique.includes(preferredYear) ? unique : [...unique, preferredYear].sort((left, right) => left - right)
}

function toggleSelectedYear(
  years: readonly number[],
  year: number,
  checked: boolean,
  fallbackYear: number | null,
): readonly number[] {
  if (checked) {
    return ensureSelectedYears(years, year)
  }
  const next = years.filter((value) => value !== year)
  if (next.length > 0) {
    return next
  }
  return fallbackYear == null ? [] : [fallbackYear]
}

function formatPreviousRecordLabel(event: AnnualOverviewRecordEvent): string {
  const years = event.previousRecordYears.join(', ')
  return years.length > 0 ? `${event.previousRecordC.toFixed(1)}°C (${years})` : `${event.previousRecordC.toFixed(1)}°C`
}

function buildRangeSlug(startDate: ClimateDateString, endDate: ClimateDateString): string {
  return `-${startDate.slice(5)}-to-${endDate.slice(5)}`
}

function serializeSvgElement(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(svg.clientWidth || ANNUAL_OVERVIEW_CHART_WIDTH))
  clone.setAttribute('height', String(svg.clientHeight || ANNUAL_OVERVIEW_CHART_HEIGHT))
  return new XMLSerializer().serializeToString(clone)
}

function buildRangeMonthSections(days: readonly AnnualOverviewDay[]) {
  const sections: Array<{
    month: number
    startIndex: number
    endIndex: number
    shortLabel: string
  }> = []

  for (let index = 0; index < days.length; index += 1) {
    const day = days[index]
    if (day == null) {
      continue
    }
    const previous = sections.at(-1)
    if (previous == null || previous.month !== day.month) {
      sections.push({
        month: day.month,
        startIndex: index,
        endIndex: index,
        shortLabel: formatEuropeLondonDisplay(day.date, { month: 'short' }),
      })
      continue
    }
    sections[sections.length - 1]!.endIndex = index
  }

  return sections
}

function buildValuesPath(
  values: readonly (number | null)[],
  yMin: number,
  yMax: number,
): string {
  const segments: string[] = []
  let current: string[] = []

  values.forEach((value, index) => {
    if (value == null) {
      if (current.length > 1) {
        segments.push(current.join(' '))
      }
      current = []
      return
    }

    const x = xForDay(index, values.length)
    const y = yForValue(value, yMin, yMax)
    current.push(`${current.length === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
  })

  if (current.length > 1) {
    segments.push(current.join(' '))
  }

  return segments.join(' ')
}

function computeChartDomain(
  values: readonly (number | null)[],
  fallbackMin: number,
  fallbackMax: number,
): { readonly min: number; readonly max: number } {
  const numeric = values.filter((value): value is number => value != null)
  if (numeric.length === 0) {
    return { min: fallbackMin, max: fallbackMax }
  }
  const rawMin = Math.min(...numeric)
  const rawMax = Math.max(...numeric)
  const span = Math.max(1, rawMax - rawMin)
  const pad = Math.max(2, roundStep(span / 5))
  return {
    min: Math.floor((rawMin - pad) / pad) * pad,
    max: Math.ceil((rawMax + pad) / pad) * pad,
  }
}

function roundStep(value: number): number {
  if (value <= 5) return 5
  if (value <= 10) return 10
  if (value <= 20) return 20
  if (value <= 50) return 50
  return 100
}

function buildTicks(min: number, max: number, step: number): readonly number[] {
  const safeStep = Math.max(1, step)
  const ticks: number[] = []
  for (let value = min; value <= max; value += safeStep) {
    ticks.push(value)
  }
  return ticks
}

function buildRainfallSeries(
  year: number,
  payload: AnnualClimatePayload | undefined,
  days: readonly AnnualOverviewDay[],
  colorIndex: number,
): ChartPointSeries | null {
  if (payload == null) {
    return null
  }

  const cumulativeByKey = new Map<string, number | null>()
  let runningTotal = 0
  const sortedRecords = [...payload.records].sort((left, right) => compareClimateDates(left.date, right.date))
  for (const record of sortedRecords) {
    const { month, day } = parseIsoClimateDate(record.date)
    const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (record.rainfallMm == null) {
      cumulativeByKey.set(key, null)
      continue
    }
    runningTotal += record.rainfallMm
    cumulativeByKey.set(key, runningTotal)
  }

  return {
    year,
    color: YEAR_LINE_COLORS[colorIndex % YEAR_LINE_COLORS.length]!,
    values: days.map((day) => cumulativeByKey.get(day.dateKey) ?? null),
  }
}

function buildTemperatureSeries(
  year: number,
  payload: AnnualClimatePayload | undefined,
  days: readonly AnnualOverviewDay[],
  colorIndex: number,
): {
  readonly year: number
  readonly color: string
  readonly maxValues: readonly (number | null)[]
  readonly minValues: readonly (number | null)[]
} | null {
  if (payload == null) {
    return null
  }

  const recordsByKey = new Map<string, ClimateDay>()
  for (const record of payload.records) {
    const { month, day } = parseIsoClimateDate(record.date)
    recordsByKey.set(`${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, record)
  }

  return {
    year,
    color: YEAR_LINE_COLORS[colorIndex % YEAR_LINE_COLORS.length]!,
    maxValues: days.map((day) => recordsByKey.get(day.dateKey)?.maxTempC ?? null),
    minValues: days.map((day) => recordsByKey.get(day.dateKey)?.minTempC ?? null),
  }
}
