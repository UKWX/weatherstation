import {
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
import { AnnualOverviewRecordsCard } from '@/features/annualOverview/AnnualOverviewRecordsCard'
import { AnnualOverviewMonthlyRecordsCard } from '@/features/annualOverview/AnnualOverviewMonthlyRecordsCard'
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
  ChartCard,
  ChartTooltip,
  chartTheme,
  positionTooltip,
  useChartHover,
} from '@/components/charts'
import { buildAnnualOverviewMonthlyRecordsCardModel } from '@/features/annualOverview/monthlyRecords'
import { formatAnnualOverviewPreviousRecordLabel } from '@/features/annualOverview/recordsCard'
import {
  buildAnnualOverviewDataset,
  buildSelectableYears,
  getAnnualOverviewRecordLabel,
  type AnnualOverviewDay,
  type AnnualOverviewRecordEvent,
  type AnnualOverviewRecordType,
} from '@/features/annualOverview/model'
import { useCurrentClimateYear } from '@/hooks/useCurrentClimateYear'
import {
  useAnnualClimateQueries,
  useAnnualClimateQuery,
  useClimateArchiveIndexQuery,
} from '@/hooks/usePublicWeatherQueries'
import {
  compareClimateDates,
  formatEuropeLondonDisplay,
  parseIsoClimateDate,
  toClimateDateString,
} from '@/lib/climate'
import {
  ANNUAL_RAIN_NORMAL_MM,
  dailyCumulativeNormal,
  monthNormal,
  RAIN_NORMAL_PERIOD,
} from '@/features/normals/rainfallNormals'
import type { AnnualClimatePayload, ClimateDateString, ClimateDay } from '@/types/weather'

const YEAR_PARAM_PATTERN = /^\d{4}$/
const TOOLTIP_OFFSET = 14

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

const MONTH_SHORT_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

type OverviewTabId = (typeof OVERVIEW_TABS)[number]['id']
type ExportScope = 'chart' | 'records' | 'both'

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
  const dailyRecordDates = useMemo(
    () => new Set(dataset.recordEvents.map((event) => event.date)),
    [dataset.recordEvents],
  )
  const monthlyRecordsModel = useMemo(
    () =>
      buildAnnualOverviewMonthlyRecordsCardModel({
        year: selectedYear,
        selectedYearRecords: selectedYearQuery.data?.records ?? [],
        historicalPayloads: loadedHistoricalPayloads,
        linkedDailyRecordDates: dailyRecordDates,
      }),
    [dailyRecordDates, loadedHistoricalPayloads, selectedYear, selectedYearQuery.data?.records],
  )

  const bandPath = buildNormalBandPath(dataset, geometry.yMin, geometry.yMax)
  const exportSvgMarkup = buildAnnualOverviewExportSvg({
    year: selectedYear,
    dataset,
    monthlyRecords: monthlyRecordsModel,
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
  const comparisonYears = useMemo(
    () => availableArchiveYears.filter((year) => year >= parseIsoClimateDate(TEMPERATURE_START_DATE).year),
    [availableArchiveYears],
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
    downloadAnnualOverviewSvg(
      exportSvgMarkup,
      `wakefield-${selectedYear}-annual-overview-${exportScope}.svg`,
    )
  }

  const handlePngExport = async () => {
    await downloadAnnualOverviewPng(
      exportSvgMarkup,
      `wakefield-${selectedYear}-annual-overview-${exportScope}.png`,
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
          ) : activeTab === 'comparison' ? (
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
                Solid lines show maxima and dashed lines show minima.
              </span>
            </>
          ) : (
            <span className="annual-overview-baseline-note">
              Rainfall records begin on {formatEuropeLondonDisplay(RAINFALL_START_DATE)}.
            </span>
          )}

          <span className="annual-overview-baseline-note">
            Loaded archive years: {loadedCount}/{availableArchiveYears.length}
          </span>
          {activeTab === 'overview' ? (
            <div className="annual-overview-export-actions">
              <button type="button" className="button" onClick={handleSvgExport}>
              Export SVG
              </button>
              <button type="button" className="button button-outline" onClick={() => void handlePngExport()}>
              Export PNG
              </button>
            </div>
          ) : null}
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
                              r="3.25"
                              fill="none"
                              stroke={getRecordMarkerColor(type)}
                              strokeWidth="1.2"
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
                      const rect = event.currentTarget.getBoundingClientRect()
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

          <AnnualOverviewRecordsCard
            year={selectedYear}
            rows={dataset.recordEvents}
            latestObservedDate={dataset.latestObservedDate}
            linkedMonthlyRecordMonthsByDate={monthlyRecordsModel.linkedDailyRecordMonthsByDate}
          />
          <AnnualOverviewMonthlyRecordsCard model={monthlyRecordsModel} />
        </>
      ) : null}

      {activeTab === 'rainfall' ? (
        <RainfallAccumulationCard
          year={selectedYear}
          days={dataset.days}
          payload={selectedYearQuery.data}
        />
      ) : null}

      {activeTab === 'comparison' ? (
        <>
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
          <TemperatureComparisonCard
            year={selectedYear}
            days={rangeDays}
            series={comparisonSeries}
          />
        </>
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
          {getAnnualOverviewRecordLabel(event.type)}: previous{' '}
          {formatAnnualOverviewPreviousRecordLabel(event)}
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

type RainfallChartPoint = {
  readonly date: ClimateDateString
  readonly month: number
  readonly day: number
  readonly dailyRainMm: number | null
  readonly cumulativeRainMm: number | null
  readonly normalCumulativeMm: number
  readonly monthToDateMm: number | null
}

type RainfallSummaryTile = {
  readonly label: string
  readonly value: string
}

type RainfallMonthlyRow = {
  readonly monthLabel: string
  readonly normalMm: number
  readonly actualMm: number | null
}

type RainfallChartModel = {
  readonly points: readonly RainfallChartPoint[]
  readonly lastDataIndex: number
  readonly lastDataDate: ClimateDateString | null
  readonly leftAxisMax: number
  readonly rightAxisMax: number
  readonly summaryTiles: readonly RainfallSummaryTile[]
  readonly monthlyRows: readonly RainfallMonthlyRow[]
}

function RainfallAccumulationCard({
  year,
  days,
  payload,
}: {
  readonly year: number
  readonly days: readonly AnnualOverviewDay[]
  readonly payload: AnnualClimatePayload | null | undefined
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({ opacity: 0 })
  const hover = useChartHover({ count: days.length, containerRef: canvasRef })
  const model = useMemo(() => buildRainfallChartModel(year, days, payload), [days, payload, year])
  const monthSections = useMemo(() => buildRangeMonthSections(days), [days])
  const plotWidth = ANNUAL_OVERVIEW_CHART_WIDTH - chartTheme.margins.left - chartTheme.margins.right
  const plotHeight = ANNUAL_OVERVIEW_CHART_HEIGHT - chartTheme.margins.top - chartTheme.margins.bottom
  const hoveredPoint =
    hover.activeIndex != null && model.points[hover.activeIndex] != null ? model.points[hover.activeIndex]! : null
  const hoveredX = hover.activeIndex != null ? xForDay(hover.activeIndex, Math.max(days.length, 1)) : null
  const rightTicks = useMemo(() => buildTicks(0, model.rightAxisMax, 100), [model.rightAxisMax])
  const leftTicks = useMemo(() => buildTicks(0, model.leftAxisMax, model.leftAxisMax <= 50 ? 5 : 10), [model.leftAxisMax])
  const shadingSegments = useMemo(
    () => buildRainfallDifferenceSegments(model.points, model.lastDataIndex, model.rightAxisMax, days.length),
    [days.length, model.lastDataIndex, model.points, model.rightAxisMax],
  )
  const currentPath = useMemo(
    () => buildRainfallValuePath(model.points.map((point) => point.cumulativeRainMm), days.length, (value) => rainfallRightAxisY(value, model.rightAxisMax)),
    [days.length, model.points, model.rightAxisMax],
  )
  const normalPath = useMemo(
    () => buildRainfallValuePath(model.points.map((point) => point.normalCumulativeMm), days.length, (value) => rainfallRightAxisY(value, model.rightAxisMax)),
    [days.length, model.points, model.rightAxisMax],
  )

  useLayoutEffect(() => {
    if (
      hover.activeIndex == null ||
      hover.clientX == null ||
      hover.clientY == null ||
      canvasRef.current == null ||
      tooltipRef.current == null
    ) {
      setTooltipStyle({ opacity: 0 })
      return
    }

    const position = positionTooltip(
      hover.clientX,
      hover.clientY,
      tooltipRef.current.offsetWidth,
      tooltipRef.current.offsetHeight,
      canvasRef.current.getBoundingClientRect(),
    )
    setTooltipStyle({ left: position.left, top: position.top, opacity: 1 })
  }, [hover.activeIndex, hover.clientX, hover.clientY])

  const hoveredSummary =
    hoveredPoint == null
      ? null
      : hoveredPoint.cumulativeRainMm == null
        ? `${formatEuropeLondonDisplay(hoveredPoint.date, { day: 'numeric', month: 'long', year: 'numeric' })}. Average to date: ${formatRainfall(hoveredPoint.normalCumulativeMm)}. No ${year} data yet.`
        : `${formatEuropeLondonDisplay(hoveredPoint.date, { day: 'numeric', month: 'long', year: 'numeric' })}. Rain this day: ${formatRainfall(hoveredPoint.dailyRainMm)}. ${year} total to date: ${formatRainfall(hoveredPoint.cumulativeRainMm)}. Average to date: ${formatRainfall(hoveredPoint.normalCumulativeMm)}.`

  const footnote = `Blue line is the ${year} running total; grey line is the ${RAIN_NORMAL_PERIOD} average running total. Shading shows where ${year} is wetter (blue) or drier (amber) than average. Bars are daily rainfall (left axis). Data to ${model.lastDataDate != null ? formatEuropeLondonDisplay(model.lastDataDate) : 'date unavailable'}.`

  return (
    <ChartCard
      title="Rainfall accumulation"
      subtitle={`Running rainfall total for ${year} against the ${RAIN_NORMAL_PERIOD} average.`}
      minWidth={1150}
      svgRef={svgRef}
      svgFilename={`wakefield-${year}-rainfall-accumulation.svg`}
      pngFilename={`wakefield-${year}-rainfall-accumulation.png`}
      legend={[
        {
          label: 'Wetter than average',
          swatch: <span className="chart-kit-swatch" style={{ background: chartTheme.colors.wetter, borderColor: chartTheme.colors.wetter }} aria-hidden="true" />,
        },
        {
          label: 'Drier than average',
          swatch: <span className="chart-kit-swatch" style={{ background: chartTheme.colors.drier, borderColor: chartTheme.colors.drier }} aria-hidden="true" />,
        },
        {
          label: 'Daily rainfall',
          swatch: <span className="chart-kit-swatch" style={{ background: chartTheme.colors.rainfallBar, borderColor: chartTheme.colors.rainfallBar }} aria-hidden="true" />,
        },
        {
          label: `Average total (${RAIN_NORMAL_PERIOD})`,
          swatch: <span className="chart-kit-swatch" style={{ background: 'transparent', borderColor: chartTheme.colors.rainfallNormal }} aria-hidden="true" />,
        },
        {
          label: `${year} total`,
          swatch: <span className="chart-kit-swatch" style={{ background: 'transparent', borderColor: chartTheme.colors.rainfallCurrent }} aria-hidden="true" />,
        },
      ]}
      footnote={footnote}
    >
      <div ref={canvasRef} className="chart-kit-canvas">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${ANNUAL_OVERVIEW_CHART_WIDTH} ${ANNUAL_OVERVIEW_CHART_HEIGHT}`}
          className="chart-kit-svg annual-overview-chart-svg"
          role="img"
          aria-label={`Rainfall accumulation for ${year}`}
        >
          {rightTicks.map((tick) => {
            const y = rainfallRightAxisY(tick, model.rightAxisMax)
            return (
              <g key={`right-${tick}`}>
                <line
                  x1={chartTheme.margins.left}
                  x2={ANNUAL_OVERVIEW_CHART_WIDTH - chartTheme.margins.right}
                  y1={y}
                  y2={y}
                  stroke={chartTheme.colors.grid}
                  strokeWidth={tick === 0 ? chartTheme.strokeWidths.gridMajor : chartTheme.strokeWidths.gridMinor}
                />
                <text x={chartTheme.margins.left - 8} y={y + 4} textAnchor="end" fontSize={chartTheme.fontSizes.tick} fill={chartTheme.colors.sub}>
                  {tick}
                </text>
              </g>
            )
          })}

          {leftTicks.map((tick) => (
            <text
              key={`left-${tick}`}
              x={ANNUAL_OVERVIEW_CHART_WIDTH - chartTheme.margins.right + 8}
              y={rainfallLeftAxisY(tick, model.leftAxisMax) + 4}
              fontSize={chartTheme.fontSizes.tick}
              fill={chartTheme.colors.sub}
            >
              {tick}
            </text>
          ))}

          {monthSections.map((section) => {
            const startX = xForDay(section.startIndex, Math.max(days.length, 1))
            const endX = xForDay(section.endIndex, Math.max(days.length, 1))
            return (
              <g key={`${section.month}-${section.startIndex}`}>
                <line
                  x1={startX}
                  x2={startX}
                  y1={chartTheme.margins.top - 18}
                  y2={ANNUAL_OVERVIEW_CHART_HEIGHT - chartTheme.margins.bottom}
                  stroke={chartTheme.colors.monthLine}
                />
                <text
                  x={(startX + endX) / 2}
                  y={chartTheme.margins.top - 28}
                  textAnchor="middle"
                  fontSize={chartTheme.fontSizes.monthHeader}
                  fontWeight="700"
                  fill={chartTheme.colors.ink}
                >
                  {section.shortLabel.toUpperCase()}
                </text>
              </g>
            )
          })}

          {shadingSegments.map((segment, index) => (
            <path key={`shade-${index}`} d={segment.path} fill={segment.color} />
          ))}

          {model.points.map((point, index) => {
            if (point.dailyRainMm == null) {
              return null
            }
            const x = xForDay(index, Math.max(days.length, 1))
            const y = rainfallLeftAxisY(point.dailyRainMm, model.leftAxisMax)
            const zeroY = rainfallLeftAxisY(0, model.leftAxisMax)
            return (
              <line
                key={point.date}
                x1={x}
                x2={x}
                y1={y}
                y2={zeroY}
                stroke={chartTheme.colors.rainfallBar}
                strokeWidth={chartTheme.strokeWidths.bars}
                opacity="0.8"
              />
            )
          })}

          <path d={normalPath} fill="none" stroke={chartTheme.colors.rainfallNormal} strokeWidth={chartTheme.strokeWidths.standard} strokeLinejoin="round" strokeLinecap="round" />
          <path d={currentPath} fill="none" stroke={chartTheme.colors.rainfallCurrent} strokeWidth={chartTheme.strokeWidths.standard} strokeLinejoin="round" strokeLinecap="round" />

          <rect
            x={chartTheme.margins.left}
            y={chartTheme.margins.top}
            width={plotWidth}
            height={plotHeight}
            fill="none"
            stroke="#c7ced4"
          />

          {days.map((day, index) =>
            index === 0 || day.month !== days[index - 1]?.month ? (
              <text
                key={day.date}
                x={xForDay(index, Math.max(days.length, 1))}
                y={ANNUAL_OVERVIEW_CHART_HEIGHT - 24}
                transform={`rotate(-55 ${xForDay(index, Math.max(days.length, 1))} ${ANNUAL_OVERVIEW_CHART_HEIGHT - 24})`}
                textAnchor="end"
                fontSize={chartTheme.fontSizes.tick}
                fill={chartTheme.colors.sub}
              >
                {formatEuropeLondonDisplay(day.date, { day: '2-digit', month: 'short' })}
              </text>
            ) : null,
          )}

          <text
            x="28"
            y={chartTheme.margins.top + plotHeight / 2}
            transform={`rotate(-90 28 ${chartTheme.margins.top + plotHeight / 2})`}
            fontSize={chartTheme.fontSizes.axisTitle}
            fill={chartTheme.colors.sub}
          >
            Annual rainfall total (mm)
          </text>
          <text
            x={ANNUAL_OVERVIEW_CHART_WIDTH - 8}
            y={chartTheme.margins.top + plotHeight / 2}
            transform={`rotate(-90 ${ANNUAL_OVERVIEW_CHART_WIDTH - 8} ${chartTheme.margins.top + plotHeight / 2})`}
            fontSize={chartTheme.fontSizes.axisTitle}
            fill={chartTheme.colors.sub}
          >
            Daily rainfall (mm)
          </text>

          {hoveredPoint != null && hoveredX != null ? (
            <>
              <line
                data-export-ignore="true"
                x1={hoveredX}
                x2={hoveredX}
                y1={chartTheme.margins.top}
                y2={ANNUAL_OVERVIEW_CHART_HEIGHT - chartTheme.margins.bottom}
                stroke={chartTheme.colors.crosshair}
                strokeDasharray="3 3"
              />
              <circle
                data-export-ignore="true"
                cx={hoveredX}
                cy={rainfallRightAxisY(hoveredPoint.normalCumulativeMm, model.rightAxisMax)}
                r="4"
                fill={chartTheme.colors.rainfallNormal}
              />
              {hoveredPoint.cumulativeRainMm != null ? (
                <circle
                  data-export-ignore="true"
                  cx={hoveredX}
                  cy={rainfallRightAxisY(hoveredPoint.cumulativeRainMm, model.rightAxisMax)}
                  r="4"
                  fill={chartTheme.colors.rainfallCurrent}
                />
              ) : null}
            </>
          ) : null}

          <rect
            data-export-ignore="true"
            x={chartTheme.margins.left}
            y={chartTheme.margins.top}
            width={plotWidth}
            height={plotHeight}
            fill="transparent"
            onPointerMove={hover.overlayProps.onPointerMove}
            onPointerDown={hover.overlayProps.onPointerDown}
            onPointerLeave={hover.overlayProps.onPointerLeave}
            style={hover.overlayProps.style}
            tabIndex={hover.overlayProps.tabIndex}
            onKeyDown={hover.overlayProps.onKeyDown}
            onFocus={hover.overlayProps.onFocus}
            onBlur={hover.overlayProps.onBlur}
          />
        </svg>

        {hoveredPoint != null ? (
          <div ref={tooltipRef} style={tooltipStyle}>
            <ChartTooltip
              title={formatEuropeLondonDisplay(hoveredPoint.date, { day: 'numeric', month: 'long', year: 'numeric' })}
              rows={
                hoveredPoint.cumulativeRainMm == null
                  ? [
                      {
                        label: 'Average to date',
                        value: formatRainfall(hoveredPoint.normalCumulativeMm),
                      },
                      {
                        label: String(year),
                        value: 'No data yet',
                      },
                    ]
                  : buildRainfallTooltipRows(year, hoveredPoint)
              }
            />
          </div>
        ) : null}
        {hoveredSummary != null ? (
          <span className="visually-hidden" aria-live="polite">
            {hoveredSummary}
          </span>
        ) : null}
      </div>

      <div className="annual-overview-records-tiles annual-overview-rainfall-tiles" role="list" aria-label="Rainfall summary">
        {model.summaryTiles.map((tile) => (
          <div key={tile.label} className="annual-overview-records-tile" role="listitem">
            <div className="annual-overview-records-tile__label">
              <span>{tile.label}</span>
            </div>
            <div className="annual-overview-records-tile__value">{tile.value}</div>
          </div>
        ))}
      </div>

      <div className="annual-overview-rainfall-table">
        <h3>Monthly rainfall vs. the {RAIN_NORMAL_PERIOD} average</h3>
        <TableWrapper>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>{RAIN_NORMAL_PERIOD} average</th>
                <th>{year}</th>
                <th>Difference</th>
                <th>% of average</th>
              </tr>
            </thead>
            <tbody>
              {model.monthlyRows.map((row) => {
                const difference = row.actualMm == null ? null : row.actualMm - row.normalMm
                const percent = row.actualMm == null || row.normalMm === 0 ? null : (row.actualMm / row.normalMm) * 100
                return (
                  <tr key={row.monthLabel}>
                    <td>{row.monthLabel}</td>
                    <td>{formatRainfall(row.normalMm)}</td>
                    <td>{row.actualMm == null ? '—' : formatRainfall(row.actualMm)}</td>
                    <td>{difference == null ? '—' : formatSignedRainfall(difference)}</td>
                    <td>{percent == null ? '—' : `${percent.toFixed(0)}%`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableWrapper>
      </div>
    </ChartCard>
  )
}

function TemperatureComparisonCard({
  year,
  days,
  series,
}: {
  readonly year: number
  readonly days: readonly AnnualOverviewDay[]
  readonly series: readonly {
    readonly year: number
    readonly color: string
    readonly maxValues: readonly (number | null)[]
    readonly minValues: readonly (number | null)[]
  }[]
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({ opacity: 0 })
  const hover = useChartHover({ count: days.length, containerRef: canvasRef })
  const monthSections = useMemo(() => buildRangeMonthSections(days), [days])
  const values = series.flatMap((entry) => [...entry.maxValues, ...entry.minValues]).filter((value): value is number => value != null)
  const domain = computeChartDomain(values, -5, 25)
  const ticks = buildTicks(domain.min, domain.max, 5)
  const hoveredDay = hover.activeIndex != null ? days[hover.activeIndex] ?? null : null
  const hoveredX = hover.activeIndex != null ? xForDay(hover.activeIndex, Math.max(days.length, 1)) : null
  const activeIndex = hover.activeIndex

  useLayoutEffect(() => {
    if (
      hover.activeIndex == null ||
      hover.clientX == null ||
      hover.clientY == null ||
      canvasRef.current == null ||
      tooltipRef.current == null
    ) {
      setTooltipStyle({ opacity: 0 })
      return
    }
    const position = positionTooltip(
      hover.clientX,
      hover.clientY,
      tooltipRef.current.offsetWidth,
      tooltipRef.current.offsetHeight,
      canvasRef.current.getBoundingClientRect(),
    )
    setTooltipStyle({ left: position.left, top: position.top, opacity: 1 })
  }, [hover.activeIndex, hover.clientX, hover.clientY])

  const hoveredSummary =
    hoveredDay == null || activeIndex == null
      ? null
      : [
          formatEuropeLondonDisplay(hoveredDay.date, { day: 'numeric', month: 'long', year: 'numeric' }),
          ...series.flatMap((entry) => [
            `${entry.year} max: ${entry.maxValues[activeIndex] == null ? 'Missing' : `${entry.maxValues[activeIndex]!.toFixed(1)}°C`}`,
            `${entry.year} min: ${entry.minValues[activeIndex] == null ? 'Missing' : `${entry.minValues[activeIndex]!.toFixed(1)}°C`}`,
          ]),
        ].join('. ')

  return (
    <ChartCard
      title="Temperature comparison by year"
      subtitle={`Overlay daily maxima and minima for selected years against ${year}'s calendar.`}
      minWidth={1150}
      svgRef={svgRef}
      svgFilename={`wakefield-${year}-temperature-comparison.svg`}
      pngFilename={`wakefield-${year}-temperature-comparison.png`}
      legend={series.map((entry) => ({
        label: String(entry.year),
        swatch: <span className="chart-kit-swatch" style={{ background: 'transparent', borderColor: entry.color }} aria-hidden="true" />,
      }))}
      footnote="Solid lines show daily maxima and dashed lines show daily minima."
    >
      <div ref={canvasRef} className="chart-kit-canvas">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${ANNUAL_OVERVIEW_CHART_WIDTH} ${ANNUAL_OVERVIEW_CHART_HEIGHT}`}
          className="chart-kit-svg annual-overview-chart-svg"
          role="img"
          aria-label="Temperature comparison by year"
        >
          {ticks.map((tick) => {
            const y = yForValue(tick, domain.min, domain.max)
            return (
              <g key={tick}>
                <line
                  x1={chartTheme.margins.left}
                  x2={ANNUAL_OVERVIEW_CHART_WIDTH - chartTheme.margins.right}
                  y1={y}
                  y2={y}
                  stroke={chartTheme.colors.grid}
                  strokeWidth={tick === 0 ? chartTheme.strokeWidths.gridMajor : chartTheme.strokeWidths.gridMinor}
                />
                <text x={chartTheme.margins.left - 8} y={y + 4} textAnchor="end" fontSize={chartTheme.fontSizes.tick} fill={chartTheme.colors.sub}>
                  {tick}
                </text>
              </g>
            )
          })}

          {monthSections.map((section) => {
            const startX = xForDay(section.startIndex, Math.max(days.length, 1))
            const endX = xForDay(section.endIndex, Math.max(days.length, 1))
            return (
              <g key={`${section.month}-${section.startIndex}`}>
                <line x1={startX} x2={startX} y1={chartTheme.margins.top - 18} y2={ANNUAL_OVERVIEW_CHART_HEIGHT - chartTheme.margins.bottom} stroke={chartTheme.colors.monthLine} />
                <text x={(startX + endX) / 2} y={chartTheme.margins.top - 28} textAnchor="middle" fontSize={chartTheme.fontSizes.monthHeader} fontWeight="700" fill={chartTheme.colors.ink}>
                  {section.shortLabel.toUpperCase()}
                </text>
              </g>
            )
          })}

          {series.flatMap((entry) => {
            const maxPath = buildRainfallValuePath(entry.maxValues, days.length, (value) => yForValue(value, domain.min, domain.max))
            const minPath = buildRainfallValuePath(entry.minValues, days.length, (value) => yForValue(value, domain.min, domain.max))
            return [
              maxPath.length > 0 ? (
                <path key={`${entry.year}-max`} d={maxPath} fill="none" stroke={entry.color} strokeWidth={chartTheme.strokeWidths.standard} strokeLinejoin="round" strokeLinecap="round" />
              ) : null,
              minPath.length > 0 ? (
                <path key={`${entry.year}-min`} d={minPath} fill="none" stroke={entry.color} strokeWidth={2.2} strokeDasharray="6 4" strokeLinejoin="round" strokeLinecap="round" opacity="0.95" />
              ) : null,
            ]
          })}

          <rect
            x={chartTheme.margins.left}
            y={chartTheme.margins.top}
            width={ANNUAL_OVERVIEW_CHART_WIDTH - chartTheme.margins.left - chartTheme.margins.right}
            height={ANNUAL_OVERVIEW_CHART_HEIGHT - chartTheme.margins.top - chartTheme.margins.bottom}
            fill="none"
            stroke="#c7ced4"
          />

          {days.map((day, index) =>
            index === 0 || day.month !== days[index - 1]?.month ? (
              <text
                key={day.date}
                x={xForDay(index, Math.max(days.length, 1))}
                y={ANNUAL_OVERVIEW_CHART_HEIGHT - 24}
                transform={`rotate(-55 ${xForDay(index, Math.max(days.length, 1))} ${ANNUAL_OVERVIEW_CHART_HEIGHT - 24})`}
                textAnchor="end"
                fontSize={chartTheme.fontSizes.tick}
                fill={chartTheme.colors.sub}
              >
                {formatEuropeLondonDisplay(day.date, { day: '2-digit', month: 'short' })}
              </text>
            ) : null,
          )}

          <text
            x="28"
            y={chartTheme.margins.top + (ANNUAL_OVERVIEW_CHART_HEIGHT - chartTheme.margins.top - chartTheme.margins.bottom) / 2}
            transform={`rotate(-90 28 ${chartTheme.margins.top + (ANNUAL_OVERVIEW_CHART_HEIGHT - chartTheme.margins.top - chartTheme.margins.bottom) / 2})`}
            fontSize={chartTheme.fontSizes.axisTitle}
            fill={chartTheme.colors.sub}
          >
            Temperature (°C)
          </text>

          {hoveredDay != null && hoveredX != null ? (
            <>
              <line
                data-export-ignore="true"
                x1={hoveredX}
                x2={hoveredX}
                y1={chartTheme.margins.top}
                y2={ANNUAL_OVERVIEW_CHART_HEIGHT - chartTheme.margins.bottom}
                stroke={chartTheme.colors.crosshair}
                strokeDasharray="3 3"
              />
              {series.flatMap((entry) => {
                const index = hover.activeIndex!
                const maxValue = entry.maxValues[index]
                const minValue = entry.minValues[index]
                return [
                  maxValue == null ? null : (
                    <circle key={`${entry.year}-max-dot`} data-export-ignore="true" cx={hoveredX} cy={yForValue(maxValue, domain.min, domain.max)} r="4" fill={entry.color} />
                  ),
                  minValue == null ? null : (
                    <circle key={`${entry.year}-min-dot`} data-export-ignore="true" cx={hoveredX} cy={yForValue(minValue, domain.min, domain.max)} r="4" fill={entry.color} />
                  ),
                ]
              })}
            </>
          ) : null}

          <rect
            data-export-ignore="true"
            x={chartTheme.margins.left}
            y={chartTheme.margins.top}
            width={ANNUAL_OVERVIEW_CHART_WIDTH - chartTheme.margins.left - chartTheme.margins.right}
            height={ANNUAL_OVERVIEW_CHART_HEIGHT - chartTheme.margins.top - chartTheme.margins.bottom}
            fill="transparent"
            onPointerMove={hover.overlayProps.onPointerMove}
            onPointerDown={hover.overlayProps.onPointerDown}
            onPointerLeave={hover.overlayProps.onPointerLeave}
            style={hover.overlayProps.style}
            tabIndex={hover.overlayProps.tabIndex}
            onKeyDown={hover.overlayProps.onKeyDown}
            onFocus={hover.overlayProps.onFocus}
            onBlur={hover.overlayProps.onBlur}
          />
        </svg>

        {hoveredDay != null && activeIndex != null ? (
          <div ref={tooltipRef} style={tooltipStyle}>
            <ChartTooltip
              title={formatEuropeLondonDisplay(hoveredDay.date, { day: 'numeric', month: 'long', year: 'numeric' })}
              rows={series.flatMap((entry) => [
                {
                  label: `${entry.year} max`,
                  value: entry.maxValues[activeIndex] == null ? 'Missing' : `${entry.maxValues[activeIndex]!.toFixed(1)}°C`,
                  accentColor: entry.color,
                },
                {
                  label: `${entry.year} min`,
                  value: entry.minValues[activeIndex] == null ? 'Missing' : `${entry.minValues[activeIndex]!.toFixed(1)}°C`,
                  accentColor: entry.color,
                },
              ])}
            />
          </div>
        ) : null}
        {hoveredSummary != null ? (
          <span className="visually-hidden" aria-live="polite">
            {hoveredSummary}
          </span>
        ) : null}
      </div>
    </ChartCard>
  )
}

function rainfallRightAxisY(value: number, max: number): number {
  return yForValue(value, 0, max)
}

function rainfallLeftAxisY(value: number, max: number): number {
  const plotHeight = ANNUAL_OVERVIEW_CHART_HEIGHT - chartTheme.margins.top - chartTheme.margins.bottom
  return chartTheme.margins.top + plotHeight - (value / Math.max(1, max)) * plotHeight
}

function buildRainfallValuePath(
  values: readonly (number | null)[],
  totalDays: number,
  yScale: (value: number) => number,
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
    current.push(`${current.length === 0 ? 'M' : 'L'} ${xForDay(index, totalDays).toFixed(2)} ${yScale(value).toFixed(2)}`)
  })
  if (current.length > 1) {
    segments.push(current.join(' '))
  }
  return segments.join(' ')
}

function buildRainfallDifferenceSegments(
  points: readonly RainfallChartPoint[],
  lastDataIndex: number,
  rightAxisMax: number,
  totalDays: number,
): Array<{ readonly path: string; readonly color: string }> {
  const segments: Array<{ readonly path: string; readonly color: string }> = []
  for (let index = 1; index <= lastDataIndex; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    if (
      previous?.cumulativeRainMm == null ||
      current?.cumulativeRainMm == null
    ) {
      continue
    }
    const x0 = xForDay(index - 1, totalDays)
    const x1 = xForDay(index, totalDays)
    const current0 = previous.cumulativeRainMm
    const current1 = current.cumulativeRainMm
    const normal0 = previous.normalCumulativeMm
    const normal1 = current.normalCumulativeMm
    const diff0 = current0 - normal0
    const diff1 = current1 - normal1
    if (diff0 === 0 && diff1 === 0) {
      continue
    }
    const makePath = (startX: number, startCurrent: number, endX: number, endCurrent: number, endNormal: number, startNormal: number) =>
      `M ${startX.toFixed(2)} ${rainfallRightAxisY(startCurrent, rightAxisMax).toFixed(2)} L ${endX.toFixed(2)} ${rainfallRightAxisY(endCurrent, rightAxisMax).toFixed(2)} L ${endX.toFixed(2)} ${rainfallRightAxisY(endNormal, rightAxisMax).toFixed(2)} L ${startX.toFixed(2)} ${rainfallRightAxisY(startNormal, rightAxisMax).toFixed(2)} Z`

    if (diff0 >= 0 && diff1 >= 0) {
      segments.push({ path: makePath(x0, current0, x1, current1, normal1, normal0), color: chartTheme.colors.wetter })
      continue
    }
    if (diff0 <= 0 && diff1 <= 0) {
      segments.push({ path: makePath(x0, current0, x1, current1, normal1, normal0), color: chartTheme.colors.drier })
      continue
    }

    const ratio = diff0 / (diff0 - diff1)
    const crossX = x0 + (x1 - x0) * ratio
    const crossCurrent = current0 + (current1 - current0) * ratio
    const crossNormal = normal0 + (normal1 - normal0) * ratio
    if (diff0 > 0) {
      segments.push({ path: makePath(x0, current0, crossX, crossCurrent, crossNormal, normal0), color: chartTheme.colors.wetter })
      segments.push({ path: makePath(crossX, crossCurrent, x1, current1, normal1, crossNormal), color: chartTheme.colors.drier })
    } else {
      segments.push({ path: makePath(x0, current0, crossX, crossCurrent, crossNormal, normal0), color: chartTheme.colors.drier })
      segments.push({ path: makePath(crossX, crossCurrent, x1, current1, normal1, crossNormal), color: chartTheme.colors.wetter })
    }
  }
  return segments
}

function buildRainfallTooltipRows(year: number, point: RainfallChartPoint) {
  const difference = (point.cumulativeRainMm ?? 0) - point.normalCumulativeMm
  const percent = point.normalCumulativeMm === 0 ? null : ((point.cumulativeRainMm ?? 0) / point.normalCumulativeMm) * 100
  return [
    {
      label: 'Rain this day',
      value: formatRainfall(point.dailyRainMm),
    },
    {
      label: `${year} total to date`,
      value: formatRainfall(point.cumulativeRainMm),
      valueColor: chartTheme.colors.rainfallWetText,
    },
    {
      label: 'Average to date',
      value: formatRainfall(point.normalCumulativeMm),
    },
    {
      label: 'Difference',
      value: `${formatSignedRainfall(difference)}${percent == null ? '' : ` (${percent.toFixed(0)}% of average)`}`,
      valueColor: difference >= 0 ? chartTheme.colors.rainfallWetText : chartTheme.colors.rainfallDryText,
    },
  ] as const
}

function buildRainfallChartModel(
  year: number,
  days: readonly AnnualOverviewDay[],
  payload: AnnualClimatePayload | null | undefined,
): RainfallChartModel {
  const recordsByDate = new Map<string, ClimateDay>()
  for (const record of payload?.records ?? []) {
    recordsByDate.set(record.date, record)
  }
  const normalCumulative = dailyCumulativeNormal(year)
  const monthTotals = Array.from({ length: 12 }, () => 0)
  const monthSeen = Array.from({ length: 12 }, () => false)
  const points: RainfallChartPoint[] = []
  let runningTotal = 0
  const coverageDate = payload?.through ?? payload?.records.at(-1)?.date ?? null
  const lastDataIndex =
    coverageDate == null
      ? -1
      : days.findIndex((day) => day.date === coverageDate)
  let wettestDay: { readonly value: number; readonly date: ClimateDateString } | null = null
  let currentDryStart: number | null = null
  let longestDry: { readonly startIndex: number; readonly endIndex: number } | null = null

  days.forEach((day, index) => {
    const record = recordsByDate.get(day.date)
    const rainfall = record?.rainfallMm ?? null
    const monthIndex = day.month - 1
    if (rainfall != null) {
      runningTotal += rainfall
      monthTotals[monthIndex] += rainfall
      monthSeen[monthIndex] = true
      if (wettestDay == null || rainfall > wettestDay.value) {
        wettestDay = { value: rainfall, date: day.date }
      }
      if (rainfall < 0.2) {
        currentDryStart ??= index
      } else if (currentDryStart != null) {
        if (
          longestDry == null ||
          index - currentDryStart > longestDry.endIndex - longestDry.startIndex + 1
        ) {
          longestDry = { startIndex: currentDryStart, endIndex: index - 1 }
        }
        currentDryStart = null
      }
    }
    points.push({
      date: day.date,
      month: day.month,
      day: day.day,
      dailyRainMm: rainfall,
      cumulativeRainMm: index > lastDataIndex ? null : rainfall == null ? null : runningTotal,
      normalCumulativeMm: normalCumulative[index] ?? 0,
      monthToDateMm: rainfall == null && index > lastDataIndex ? null : monthTotals[monthIndex] ?? null,
    })
  })

  if (currentDryStart != null) {
    const finalEnd = lastDataIndex >= currentDryStart ? lastDataIndex : currentDryStart
    const currentLongestDry: { readonly startIndex: number; readonly endIndex: number } | null = longestDry
    const longestLength = drySpellLength(currentLongestDry)
    if (
      currentLongestDry == null ||
      finalEnd - currentDryStart > longestLength
    ) {
      longestDry = { startIndex: currentDryStart, endIndex: finalEnd }
    }
  }

  const lastDataDate = lastDataIndex >= 0 ? points[lastDataIndex]?.date ?? null : null
  const latestTotal = lastDataIndex >= 0 ? points[lastDataIndex]?.cumulativeRainMm ?? 0 : 0
  const latestAverage = lastDataIndex >= 0 ? points[lastDataIndex]?.normalCumulativeMm ?? 0 : 0
  const wettestMonthIndex = monthTotals.reduce((best, value, index, all) => (value > all[best]! ? index : best), 0)
  const leftAxisMax = Math.max(35, roundUpToMultiple(Math.max(0, ...points.map((point) => point.dailyRainMm ?? 0)), 5))
  const rightAxisMax = roundUpToMultiple(Math.max(ANNUAL_RAIN_NORMAL_MM, latestTotal) * 1.05, 100)
  const wettestDayLabel = formatWettestDayTile(wettestDay)
  const longestDryLabel = formatDrySpellTile(longestDry, points)

  return {
    points,
    lastDataIndex,
    lastDataDate,
    leftAxisMax,
    rightAxisMax,
    summaryTiles: [
      { label: 'Total to date', value: formatRainfall(latestTotal) },
      {
        label: '% of average to date',
        value: latestAverage === 0 ? '—' : `${((latestTotal / latestAverage) * 100).toFixed(0)}%`,
      },
      {
        label: 'Wettest day',
        value: wettestDayLabel,
      },
      {
        label: 'Longest dry spell',
        value: longestDryLabel,
      },
      {
        label: 'Wettest month',
        value: `${MONTH_SHORT_LABELS[wettestMonthIndex]} ${formatRainfall(monthTotals[wettestMonthIndex] ?? 0)}`,
      },
    ],
    monthlyRows: MONTH_SHORT_LABELS.map((label, index) => ({
      monthLabel: label,
      normalMm: monthNormal(index),
      actualMm: monthSeen[index] ? monthTotals[index] ?? 0 : null,
    })),
  }
}

function roundUpToMultiple(value: number, step: number): number {
  return Math.ceil(value / step) * step
}

function formatRainfall(value: number | null | undefined): string {
  return value == null ? '—' : `${value.toFixed(1)} mm`
}

function formatSignedRainfall(value: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)} mm`
}

function drySpellLength(spell: { readonly startIndex: number; readonly endIndex: number } | null): number {
  return spell == null ? -1 : spell.endIndex - spell.startIndex
}

function formatWettestDayTile(day: { readonly value: number; readonly date: ClimateDateString } | null): string {
  return day == null
    ? '—'
    : `${formatRainfall(day.value)} — ${formatEuropeLondonDisplay(day.date, { day: 'numeric', month: 'short' })}`
}

function formatDrySpellTile(
  spell: { readonly startIndex: number; readonly endIndex: number } | null,
  points: readonly RainfallChartPoint[],
): string {
  if (spell == null) {
    return '—'
  }
  return `${spell.endIndex - spell.startIndex + 1} days — ${formatEuropeLondonDisplay(points[spell.startIndex]!.date, { day: 'numeric', month: 'short' })} to ${formatEuropeLondonDisplay(points[spell.endIndex]!.date, { day: 'numeric', month: 'short' })}`
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
    return sameYearList(unique, years) ? years : unique
  }
  if (unique.includes(preferredYear)) {
    return sameYearList(unique, years) ? years : unique
  }
  const next = [...unique, preferredYear].sort((left, right) => left - right)
  return sameYearList(next, years) ? years : next
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

function sameYearList(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
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
