import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Badge,
  ErrorState,
  IncompleteDataWarning,
  Modal,
  Skeleton,
  VisuallyHidden,
} from '@/components/ui'
import { RAINFALL_START_DATE, WEATHER_UNITS } from '@/config/weather'
import {
  buildAnnualCalendarViews,
  CALENDAR_MONTH_NAMES,
  CALENDAR_WEEKDAY_LABELS,
  describeStatus,
  getMetricLegend,
  getMonthDayKeyFromDate,
  isRainfallUnavailableForDate,
  type CalendarDayCell,
  type CalendarMetric,
} from '@/features/climateCalendar/model'
import {
  calculateTemperatureAnomaly,
  compareClimateDates,
  formatEuropeLondonDisplay,
  formatNullableMeasurement,
  parseIsoClimateDate,
} from '@/lib/climate'
import {
  useAnnualClimateQuery,
  useClimateArchiveIndexQuery,
  useDailyNormalsQuery,
} from '@/hooks/usePublicWeatherQueries'
import type { ClimateDateString, ClimateDay, DailyNormal } from '@/types/weather'

const METRIC_OPTIONS: readonly { value: CalendarMetric; label: string }[] = [
  { value: 'max', label: 'Max temperature' },
  { value: 'min', label: 'Min temperature' },
  { value: 'mean', label: 'Mean temperature' },
  { value: 'rainfall', label: 'Rainfall' },
]

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
}

const DATE_PARAM_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MOBILE_QUERY = '(max-width: 760px)'
const EMPTY_RECORDS: readonly ClimateDay[] = []
const EMPTY_NORMALS: readonly DailyNormal[] = []

function useIsMobileView() {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(MOBILE_QUERY).matches
      : false,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const media = window.matchMedia(MOBILE_QUERY)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener?.('change', update)
    return () => {
      media.removeEventListener?.('change', update)
    }
  }, [])

  return matches
}

function formatTemperatureAnomaly(value: number | null): string {
  if (value == null) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)} ${WEATHER_UNITS.temperature}`
}

function detailsStatusLabel(day: CalendarDayCell): string {
  if (day.availability === 'unavailable') {
    return 'Unavailable historically'
  }

  if (day.availability === 'missing') {
    return `Missing (${describeStatus(day.status)})`
  }

  return describeStatus(day.status)
}

function buildNormalMap(normals: readonly DailyNormal[]) {
  return new Map(normals.map((entry) => [entry.dateKey, entry]))
}

function MetricLegend({
  metric,
  records,
}: {
  readonly metric: CalendarMetric
  readonly records: readonly ClimateDay[]
}) {
  const legend = useMemo(() => getMetricLegend(metric, records), [metric, records])

  return (
    <section className="card climate-calendar-legend-card" aria-labelledby="climate-calendar-legend-heading">
      <div className="archive-card-heading">
        <h2 id="climate-calendar-legend-heading">Legend</h2>
        <Badge variant="default">Accessible scale</Badge>
      </div>
      <p className="archive-obs-note">{legend.scaleDescription}</p>
      <ul className="climate-calendar-legend-list" aria-label={legend.title}>
        {legend.buckets.map((bucket) => (
          <li key={bucket.key} className="climate-calendar-legend-item">
            <span className={`legend-swatch ${bucket.className}`} aria-hidden="true" />
            <span>
              <strong>{bucket.shortLabel}</strong> <span>{bucket.label}</span>
            </span>
          </li>
        ))}
        <li className="climate-calendar-legend-item">
          <span className="legend-swatch climate-calendar-cell--missing" aria-hidden="true" />
          <span><strong>Missing</strong> No valid observation for this day.</span>
        </li>
        {metric === 'rainfall' ? (
          <li className="climate-calendar-legend-item">
            <span className="legend-swatch climate-calendar-cell--unavailable" aria-hidden="true" />
            <span><strong>N/A</strong> Rainfall unavailable before {formatEuropeLondonDisplay(RAINFALL_START_DATE, DATE_FORMAT)}.</span>
          </li>
        ) : null}
        <li className="climate-calendar-legend-item">
          <span className="legend-swatch climate-calendar-provisional-marker" aria-hidden="true">P</span>
          <span><strong>P</strong> Provisional value.</span>
        </li>
      </ul>
    </section>
  )
}

function ClimateCalendarDetailModal({
  day,
  record,
  normals,
  open,
  onClose,
}: {
  readonly day: CalendarDayCell | null
  readonly record: ClimateDay | null
  readonly normals: readonly DailyNormal[]
  readonly open: boolean
  readonly onClose: () => void
}) {
  const normalMap = useMemo(() => buildNormalMap(normals), [normals])

  if (day == null) {
    return null
  }

  const normal = normalMap.get(getMonthDayKeyFromDate(day.date)) ?? null
  const rainfallUnavailable = isRainfallUnavailableForDate(day.date)
  const normalMax = normal?.normalMaxTempC ?? null
  const normalMin = normal?.normalMinTempC ?? null
  const normalMean = normal?.normalMeanTempC ?? null
  const maxAnomaly = calculateTemperatureAnomaly(record?.maxTempC, normalMax)
  const minAnomaly = calculateTemperatureAnomaly(record?.minTempC, normalMin)
  const meanAnomaly = calculateTemperatureAnomaly(record?.meanTempC, normalMean)

  return (
    <Modal
      title={`${formatEuropeLondonDisplay(day.date, DATE_FORMAT)} — climate calendar detail`}
      open={open}
      onClose={onClose}
    >
      <section>
        <h3>Observed values</h3>
        <dl className="archive-detail-grid">
          <div>
            <dt>Maximum temperature</dt>
            <dd>{formatNullableMeasurement(record?.maxTempC, { unit: WEATHER_UNITS.temperature })}</dd>
          </div>
          <div>
            <dt>Minimum temperature</dt>
            <dd>{formatNullableMeasurement(record?.minTempC, { unit: WEATHER_UNITS.temperature })}</dd>
          </div>
          <div>
            <dt>Mean temperature</dt>
            <dd>{formatNullableMeasurement(record?.meanTempC, { unit: WEATHER_UNITS.temperature })}</dd>
          </div>
          <div>
            <dt>Rainfall</dt>
            <dd>{rainfallUnavailable ? 'Unavailable' : formatNullableMeasurement(record?.rainfallMm, { unit: WEATHER_UNITS.rainfall })}</dd>
          </div>
        </dl>
      </section>
      <section aria-label="Normals and anomalies">
        <h3>Normals &amp; anomalies</h3>
        <dl className="archive-detail-grid">
          <div>
            <dt>Normal max</dt>
            <dd>{formatNullableMeasurement(normalMax, { unit: WEATHER_UNITS.temperature })}</dd>
          </div>
          <div>
            <dt>Normal min</dt>
            <dd>{formatNullableMeasurement(normalMin, { unit: WEATHER_UNITS.temperature })}</dd>
          </div>
          <div>
            <dt>Normal mean</dt>
            <dd>{formatNullableMeasurement(normalMean, { unit: WEATHER_UNITS.temperature })}</dd>
          </div>
          <div>
            <dt>Max anomaly</dt>
            <dd>{formatTemperatureAnomaly(maxAnomaly)}</dd>
          </div>
          <div>
            <dt>Min anomaly</dt>
            <dd>{formatTemperatureAnomaly(minAnomaly)}</dd>
          </div>
          <div>
            <dt>Mean anomaly</dt>
            <dd>{formatTemperatureAnomaly(meanAnomaly)}</dd>
          </div>
          <div>
            <dt>Rainfall normal</dt>
            <dd>Daily rainfall normal unavailable</dd>
          </div>
        </dl>
      </section>
      <section aria-label="Data status">
        <h3>Data status</h3>
        <p>
          <Badge variant={day.provisional ? 'provisional' : day.availability === 'value' ? 'success' : 'warning'}>
            {detailsStatusLabel(day)}
          </Badge>
        </p>
      </section>
      <section aria-label="Links">
        <h3>Links</h3>
        <ul className="archive-detail-links">
          <li>
            <Link to={`/climate-archive?date=${day.date}`} className="link-focus">Climate Archive — {formatEuropeLondonDisplay(day.date, DATE_FORMAT)}</Link>
          </li>
          <li>
            <Link to={`/on-this-day?month=${day.month}&day=${day.day}`} className="link-focus">On This Day — {formatEuropeLondonDisplay(day.date, { day: '2-digit', month: 'short' })}</Link>
          </li>
          <li>
            <Link to={`/data-corrections?date=${day.date}`} className="link-focus">Data Corrections (authorised users only)</Link>
          </li>
        </ul>
      </section>
    </Modal>
  )
}

function CalendarMonthGrid({
  month,
  selectedDate,
  onSelectDate,
  renderRecordMarker,
}: {
  readonly month: ReturnType<typeof buildAnnualCalendarViews>[number]
  readonly selectedDate: ClimateDateString | null
  readonly onSelectDate: (date: ClimateDateString, openDetails?: boolean) => void
  readonly renderRecordMarker?: (day: CalendarDayCell) => React.ReactNode
}) {
  const buttonRefs = useRef(new Map<ClimateDateString, HTMLButtonElement>())

  const focusDate = (date: ClimateDateString) => {
    buttonRefs.current.get(date)?.focus()
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, day: CalendarDayCell) => {
    const stepByKey: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }
    const step = stepByKey[event.key]
    if (step == null) {
      return
    }

    event.preventDefault()
    const nextDay = month.days.find((candidate) => candidate.day === day.day + step)
    if (nextDay == null) {
      return
    }

    onSelectDate(nextDay.date)
    focusDate(nextDay.date)
  }

  return (
    <section className="card climate-calendar-month-card" aria-labelledby={`calendar-month-${month.month}`}>
      <div className="archive-card-heading">
        <h2 id={`calendar-month-${month.month}`}>{month.name}</h2>
        <Badge variant="default">{month.year}</Badge>
      </div>
      <div className="climate-calendar-grid" role="grid" aria-label={`${month.name} ${month.year} climate calendar`}>
        {CALENDAR_WEEKDAY_LABELS.map((weekday) => (
          <div key={weekday} className="climate-calendar-weekday" role="columnheader">
            {weekday}
          </div>
        ))}
        {month.weeks.flatMap((week, weekIndex) =>
          week.map((day, dayIndex) => {
            if (day == null) {
              return <div key={`empty-${weekIndex}-${dayIndex}`} className="climate-calendar-cell climate-calendar-cell--empty" aria-hidden="true" />
            }

            const selected = selectedDate === day.date
            const toneClass = day.bucketKey == null ? '' : `climate-calendar-cell--${day.bucketKey}`
            const stateClass = day.availability === 'missing'
              ? 'climate-calendar-cell--missing'
              : day.availability === 'unavailable'
                ? 'climate-calendar-cell--unavailable'
                : ''

            return (
              <button
                key={day.date}
                type="button"
                role="gridcell"
                ref={(node) => {
                  if (node == null) {
                    buttonRefs.current.delete(day.date)
                  } else {
                    buttonRefs.current.set(day.date, node)
                  }
                }}
                className={`climate-calendar-cell ${toneClass} ${stateClass} ${selected ? 'climate-calendar-cell--selected' : ''}`}
                aria-pressed={selected}
                aria-label={`${formatEuropeLondonDisplay(day.date, DATE_FORMAT)}: ${day.shortValueLabel}${day.provisional ? ', provisional' : ''}${day.availability === 'missing' ? ', missing data' : ''}${day.availability === 'unavailable' ? ', unavailable' : ''}`}
                onClick={() => onSelectDate(day.date, true)}
                onKeyDown={(event) => onKeyDown(event, day)}
              >
                <span className="climate-calendar-cell-day">{day.day}</span>
                <span className="climate-calendar-cell-value">{day.shortValueLabel}</span>
                <span className="climate-calendar-cell-meta">
                  {day.provisional ? <span className="climate-calendar-provisional-marker">P</span> : null}
                  {renderRecordMarker?.(day)}
                </span>
              </button>
            )
          }),
        )}
      </div>
    </section>
  )
}

function CalendarControls({
  years,
  year,
  month,
  metric,
  onYearChange,
  onMonthChange,
  onMetricChange,
}: {
  readonly years: readonly number[]
  readonly year: number
  readonly month: number
  readonly metric: CalendarMetric
  readonly onYearChange: (year: number) => void
  readonly onMonthChange: (month: number) => void
  readonly onMetricChange: (metric: CalendarMetric) => void
}) {
  const previousDisabled = month <= 1
  const nextDisabled = month >= 12

  return (
    <section className="card archive-controls">
      <div className="archive-controls-row">
        <label className="archive-label" htmlFor="climate-calendar-year">Year</label>
        <select
          id="climate-calendar-year"
          className="archive-select"
          value={year}
          onChange={(event) => onYearChange(Number(event.target.value))}
        >
          {[...years].sort((left, right) => right - left).map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <div className="archive-view-toggle" role="group" aria-label="Metric selector">
          {METRIC_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`archive-toggle-btn ${metric === option.value ? 'archive-toggle-btn--active' : ''}`}
              aria-pressed={metric === option.value}
              onClick={() => onMetricChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="archive-controls-row climate-calendar-month-nav-row">
        <span className="archive-label">Month</span>
        <div className="archive-view-toggle" role="group" aria-label="Month navigation">
          <button type="button" className="archive-toggle-btn" onClick={() => onMonthChange(month - 1)} disabled={previousDisabled}>Previous</button>
          <button type="button" className="archive-toggle-btn archive-toggle-btn--active" aria-current="date">{CALENDAR_MONTH_NAMES[month - 1]}</button>
          <button type="button" className="archive-toggle-btn" onClick={() => onMonthChange(month + 1)} disabled={nextDisabled}>Next</button>
        </div>
      </div>
    </section>
  )
}

export default function ClimateCalendarPage() {
  const [detailOpen, setDetailOpen] = useState(false)
  const archiveIndexQuery = useClimateArchiveIndexQuery()
  const dailyNormalsQuery = useDailyNormalsQuery()
  const availableYears = useMemo(
    () => (archiveIndexQuery.data?.years ?? []).map((entry) => entry.year).sort((left, right) => left - right),
    [archiveIndexQuery.data],
  )
  const latestYear = availableYears.at(-1) ?? new Date().getUTCFullYear()
  const [searchParams, setSearchParams] = useSearchParams()
  const yearParam = searchParams.get('year')
  const metricParam = searchParams.get('metric')
  const monthParam = searchParams.get('month')
  const dateParam = searchParams.get('date')
  const year = yearParam != null && /^\d{4}$/.test(yearParam) && availableYears.includes(Number(yearParam))
    ? Number(yearParam)
    : latestYear
  const metric: CalendarMetric = METRIC_OPTIONS.some((option) => option.value === metricParam)
    ? (metricParam as CalendarMetric)
    : 'max'
  const mobileMonth = monthParam != null && /^(?:[1-9]|1[0-2])$/.test(monthParam) ? Number(monthParam) : 1
  const isMobile = useIsMobileView()
  const annualQuery = useAnnualClimateQuery(year)

  useEffect(() => {
    if (searchParams.get('year') == null && availableYears.length > 0) {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous)
        next.set('year', String(latestYear))
        next.set('metric', metric)
        next.set('month', String(mobileMonth))
        return next
      }, { replace: true })
    }
  }, [availableYears.length, latestYear, metric, mobileMonth, searchParams, setSearchParams])

  const records = annualQuery.data?.records ?? EMPTY_RECORDS
  const normals = dailyNormalsQuery.data?.records ?? EMPTY_NORMALS
  const months = useMemo(
    () => buildAnnualCalendarViews(year, records, normals, metric),
    [metric, normals, records, year],
  )
  const recordMap = useMemo(() => new Map(records.map((record) => [record.date, record])), [records])
  const fallbackDate = records.at(-1)?.date ?? `${year}-01-01`
  const selectedDate = dateParam != null && DATE_PARAM_PATTERN.test(dateParam) && dateParam.startsWith(`${year}-`)
    ? (dateParam as ClimateDateString)
    : (fallbackDate as ClimateDateString)
  const selectedMonth = (() => {
    try {
      return parseIsoClimateDate(selectedDate).month
    } catch {
      return mobileMonth
    }
  })()
  const currentMonth = Math.min(12, Math.max(1, isMobile ? selectedMonth : mobileMonth))
  const selectedRecord = recordMap.get(selectedDate)
  const normalMap = useMemo(() => buildNormalMap(normals), [normals])
  const selectedCell = useMemo(() => {
    const { month, day } = parseIsoClimateDate(selectedDate)
    const descriptor = months[month - 1]?.days.find((entry) => entry.day === day)
    return descriptor ?? null
  }, [months, selectedDate])

  useEffect(() => {
    if (records.length === 0) {
      return
    }

    const hasDate = DATE_PARAM_PATTERN.test(dateParam ?? '') && recordMap.has((dateParam ?? '') as ClimateDateString)
    if (hasDate) {
      return
    }

    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('date', fallbackDate)
      next.set('month', String(parseIsoClimateDate(fallbackDate as ClimateDateString).month))
      next.set('metric', metric)
      next.set('year', String(year))
      return next
    }, { replace: true })
  }, [dateParam, fallbackDate, metric, recordMap, records.length, setSearchParams, year])

  const setCalendarState = (updates: Partial<{ year: number; month: number; metric: CalendarMetric; date: ClimateDateString | null }>) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      if (updates.year != null) next.set('year', String(updates.year))
      if (updates.month != null) next.set('month', String(updates.month))
      if (updates.metric != null) next.set('metric', updates.metric)
      if (updates.date === null) next.delete('date')
      if (updates.date != null) next.set('date', updates.date)
      return next
    }, { replace: true })
  }

  const onSelectDate = (date: ClimateDateString, openDetails = false) => {
    const { month } = parseIsoClimateDate(date)
    setCalendarState({ date, month })
    setDetailOpen(openDetails)
  }

  if (archiveIndexQuery.isLoading && archiveIndexQuery.data == null) {
    return <section className="card" aria-live="polite"><Skeleton lines={4} /><VisuallyHidden>Loading climate calendar years</VisuallyHidden></section>
  }

  if (archiveIndexQuery.error != null && archiveIndexQuery.data == null) {
    return <ErrorState title="Climate calendar unavailable" message="Unable to load the archive year list right now." onRetry={() => { void archiveIndexQuery.refetch() }} />
  }

  if (annualQuery.isLoading && annualQuery.data == null) {
    return <section className="card" aria-live="polite"><Skeleton lines={8} /><VisuallyHidden>Loading climate calendar for {year}</VisuallyHidden></section>
  }

  if (annualQuery.error != null && annualQuery.data == null) {
    return <ErrorState title={`${year} climate calendar unavailable`} message="Unable to load the selected year right now." onRetry={() => { void annualQuery.refetch() }} />
  }

  if (records.length === 0) {
    return (
      <ErrorState
        title="No climate calendar data"
        message="No daily archive data is available for the selected year."
        onRetry={() => {
          void annualQuery.refetch()
        }}
      />
    )
  }

  const rainfallSelectedBeforeAvailability = metric === 'rainfall' && compareClimateDates(`${year}-01-01` as ClimateDateString, RAINFALL_START_DATE) < 0
  const displayMonths = isMobile ? [months[currentMonth - 1]!].filter(Boolean) : months
  const selectedNormal = selectedCell == null ? null : normalMap.get(getMonthDayKeyFromDate(selectedCell.date)) ?? null

  return (
    <div className="archive-layout climate-calendar-layout">
      <section className="card">
        <div className="archive-card-heading">
          <h2>Climate Calendar</h2>
          {annualQuery.data?.complete ? <Badge variant="success">Finalised year</Badge> : <Badge variant="provisional">Provisional coverage</Badge>}
        </div>
        <p>
          Explore each day of {year} by {METRIC_OPTIONS.find((option) => option.value === metric)?.label.toLowerCase()}. Use the arrow keys within a month to move day by day.
        </p>
        {rainfallSelectedBeforeAvailability ? (
          <IncompleteDataWarning message={`Rainfall remained unavailable before ${formatEuropeLondonDisplay(RAINFALL_START_DATE, DATE_FORMAT)} and is marked N/A.`} />
        ) : null}
      </section>

      <CalendarControls
        years={availableYears}
        year={year}
        month={currentMonth}
        metric={metric}
        onYearChange={(nextYear) => {
          setDetailOpen(false)
          setCalendarState({ year: nextYear, date: null })
        }}
        onMonthChange={(nextMonth) => {
          setDetailOpen(false)
          setCalendarState({ month: Math.min(12, Math.max(1, nextMonth)) })
        }}
        onMetricChange={(nextMetric) => {
          setDetailOpen(false)
          setCalendarState({ metric: nextMetric })
        }}
      />

      <MetricLegend metric={metric} records={records} />

      {selectedCell != null ? (
        <section className="card climate-calendar-selection-summary">
          <div className="archive-card-heading">
            <h2>Selected day</h2>
            <Badge variant={selectedCell.provisional ? 'provisional' : selectedCell.availability === 'value' ? 'success' : 'warning'}>{detailsStatusLabel(selectedCell)}</Badge>
          </div>
          <p>
            <strong>{formatEuropeLondonDisplay(selectedCell.date, DATE_FORMAT)}</strong> — {selectedCell.label}
          </p>
          <p className="archive-obs-note">
            Normals: max {formatNullableMeasurement(selectedNormal?.normalMaxTempC ?? null, { unit: WEATHER_UNITS.temperature })}, min {formatNullableMeasurement(selectedNormal?.normalMinTempC ?? null, { unit: WEATHER_UNITS.temperature })}, mean {formatNullableMeasurement(selectedNormal?.normalMeanTempC ?? null, { unit: WEATHER_UNITS.temperature })}
          </p>
          <button type="button" className="button" onClick={() => setDetailOpen(true)}>Open details</button>
        </section>
      ) : null}

      <div className={isMobile ? 'climate-calendar-mobile-view' : 'climate-calendar-annual-grid'}>
        {displayMonths.map((monthView) => (
          <CalendarMonthGrid key={monthView.month} month={monthView} selectedDate={selectedDate} onSelectDate={onSelectDate} />
        ))}
      </div>

      <ClimateCalendarDetailModal
        day={selectedCell}
        record={selectedRecord ?? null}
        normals={normals}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  )
}
