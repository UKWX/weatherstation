import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, ErrorState, ResponsiveChartContainer, Skeleton, TableWrapper } from '@/components/ui'
import { TEMPERATURE_START_DATE } from '@/config/weather'
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
  type AnnualOverviewRecordType,
} from '@/features/annualOverview/model'
import { useCurrentClimateYear } from '@/hooks/useCurrentClimateYear'
import {
  useAnnualClimateQueries,
  useAnnualClimateQuery,
  useClimateArchiveIndexQuery,
} from '@/hooks/usePublicWeatherQueries'
import { formatEuropeLondonDisplay, parseIsoClimateDate } from '@/lib/climate'
import type { AnnualClimatePayload } from '@/types/weather'

const YEAR_PARAM_PATTERN = /^\d{4}$/
const TOOLTIP_OFFSET = 14

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
  const title = `${selectedYear} Daily Temperature Data for Wakefield, United Kingdom`
  const subtitle = `Daily maximum & minimum vs. the ${dataset.normalPeriodLabel} normal range and all-time daily records`
  const footnote = buildFootnote(
    selectedYear,
    dataset.normalPeriodLabel,
    selectedYearQuery.data?.through ?? dataset.latestObservedDate,
  )
  const recordSummary = buildRecordSummary(
    selectedYear,
    dataset.recordEvents.length,
    selectedYearQuery.data?.through ?? dataset.latestObservedDate,
  )

  const [hoverState, setHoverState] = useState<{
    readonly index: number
    readonly clientX: number
    readonly clientY: number
  } | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({ opacity: 0 })

  useLayoutEffect(() => {
    if (hoverState == null) {
      setTooltipStyle({ opacity: 0 })
      return
    }

    const width = tooltipRef.current?.offsetWidth ?? 240
    const height = tooltipRef.current?.offsetHeight ?? 140
    setTooltipStyle(computeTooltipStyle(hoverState.clientX, hoverState.clientY, width, height))
  }, [hoverState])

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

  const loadedCount = historicalQueries.filter((query) => query.data != null).length
  const hoveredDay = hoverState != null ? dataset.days[hoverState.index] ?? null : null
  const bandPath = buildNormalBandPath(dataset, geometry.yMin, geometry.yMax)
  const exportSvgMarkup = buildAnnualOverviewExportSvg({
    year: selectedYear,
    dataset,
    subtitle,
    footnote,
    recordSummary,
  })

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
          Annual temperature overview for Wakefield using the existing archive data, dynamic normals,
          historical daily records, and standalone chart export.
        </p>
      </section>

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
          <span className="annual-overview-baseline-note">
            Normal period: {dataset.normalPeriodLabel}
          </span>
          <span className="annual-overview-baseline-note">
            Loaded archive years: {loadedCount}/{availableArchiveYears.length}
          </span>
          <div className="annual-overview-export-actions">
            <button
              type="button"
              className="button"
              onClick={() =>
                downloadAnnualOverviewSvg(exportSvgMarkup, `wakefield-${selectedYear}-annual-overview.svg`)
              }
            >
              Export SVG
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={() =>
                void downloadAnnualOverviewPng(
                  exportSvgMarkup,
                  `wakefield-${selectedYear}-annual-overview.png`,
                )
              }
            >
              Export PNG
            </button>
          </div>
        </div>
      </section>

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
          <span><i className="annual-overview-swatch annual-overview-swatch--marker" />New record set</span>
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

              {dataset.days.flatMap((day) =>
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
                      fill="#ffffff"
                      stroke={getRecordMarkerColor(type)}
                      strokeWidth="2.4"
                    />
                  )
                }),
              )}

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
                <AnnualOverviewTooltip day={hoveredDay} />
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
                    <td>{event.previousRecordC.toFixed(1)}°C</td>
                    <td>+{event.marginC.toFixed(1)}°C</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        )}
      </section>
    </div>
  )
}

function AnnualOverviewTooltip({ day }: { readonly day: AnnualOverviewDay }) {
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
    return withUnit ? '—' : '—'
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
): string {
  const throughText =
    throughDate != null ? `Data year to date runs to ${formatEuropeLondonDisplay(throughDate)}.` : ''
  return `Shaded band shows the ${normalPeriodLabel} normal range between the average daily maximum and minimum, coloured by temperature. Dashed lines mark the all-time daily record maximum and minimum for each calendar day. Circled points are new all-time daily records set in ${year}. ${throughText}`.trim()
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
