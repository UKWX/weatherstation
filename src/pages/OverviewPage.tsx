import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Badge,
  CardGrid,
  ErrorState,
  IncompleteDataWarning,
  ProvisionalBadge,
  Skeleton,
  StaleDataWarning,
  UnavailableDataDisplay,
  VisuallyHidden,
} from '@/components/ui'
import { WEATHER_UNITS } from '@/config/weather'
import {
  useAnnualClimateQuery,
  useClimateArchiveIndexQuery,
  useCurrentConditionsQuery,
  useMonthlyNormalsQuery,
  useRecentObservationsQuery,
  useStationStatusQuery,
  useTodaySummaryQuery,
} from '@/hooks/usePublicWeatherQueries'
import {
  formatEuropeLondonDisplay,
  formatNullableMeasurement,
  parseIsoClimateDate,
} from '@/lib/climate'
import type {
  ClimateDateString,
  ClimateDay,
  CurrentConditions,
  MonthlyNormal,
  RecentObservation,
  StationStatus,
} from '@/types/weather'

const STALE_OBSERVATION_SECONDS = 15 * 60

const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

const TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
}

const ISO_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const SHORT_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
}

type CurrentField = {
  key: string
  label: string
  value: number | null
  unit: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
}

type ChartPoint = {
  timeLabel: string
  value: number | null
}

export default function OverviewPage() {
  const currentQuery = useCurrentConditionsQuery()
  const statusQuery = useStationStatusQuery()
  const recentQuery = useRecentObservationsQuery()
  const todayQuery = useTodaySummaryQuery()
  const archiveIndexQuery = useClimateArchiveIndexQuery()
  const monthlyNormalsQuery = useMonthlyNormalsQuery()

  const latestYear = useMemo(() => {
    const years = archiveIndexQuery.data?.years ?? []

    if (years.length === 0) {
      return new Date().getUTCFullYear()
    }

    return years.reduce((highest, yearEntry) =>
      yearEntry.year > highest ? yearEntry.year : highest, years[0]?.year ?? new Date().getUTCFullYear())
  }, [archiveIndexQuery.data])

  const annualQuery = useAnnualClimateQuery(latestYear)

  const loading = [
    currentQuery,
    statusQuery,
    recentQuery,
    todayQuery,
    archiveIndexQuery,
    annualQuery,
    monthlyNormalsQuery,
  ].some((query) => query.isLoading && query.data == null)

  const missingCoreData =
    currentQuery.data == null ||
    statusQuery.data == null ||
    recentQuery.data == null ||
    archiveIndexQuery.data == null

  if (loading && missingCoreData) {
    return (
      <section className="card" aria-live="polite">
        <Skeleton lines={6} />
        <VisuallyHidden>Loading overview dashboard</VisuallyHidden>
      </section>
    )
  }

  if (missingCoreData) {
    return (
      <ErrorState
        title="Overview unavailable"
        message="Unable to load required overview datasets right now."
        onRetry={() => {
          void Promise.all([
            currentQuery.refetch(),
            statusQuery.refetch(),
            recentQuery.refetch(),
            archiveIndexQuery.refetch(),
          ])
        }}
      />
    )
  }

  const current = currentQuery.data
  const status = statusQuery.data
  const recent = recentQuery.data
  const annual = annualQuery.data
  const monthlyNormal = resolveMonthlyNormal(monthlyNormalsQuery.data?.months)

  const now = new Date()
  const observationTimeUtc =
    current.observationTimeUtc ?? status.observationTimeUtc ?? null
  const observationAgeSeconds =
    status.observationAgeSeconds ??
    deriveObservationAgeSeconds(observationTimeUtc, now)

  const statusStale =
    !status.online ||
    !status.live ||
    (observationAgeSeconds != null && observationAgeSeconds > STALE_OBSERVATION_SECONDS)

  const queryHasRefreshIssue =
    currentQuery.error != null ||
    statusQuery.error != null ||
    recentQuery.error != null ||
    todayQuery.error != null

  const showStaleWarning =
    statusStale ||
    queryHasRefreshIssue ||
    currentQuery.isPlaceholderData ||
    statusQuery.isPlaceholderData ||
    recentQuery.isPlaceholderData

  const headerOffline = !status.online || queryHasRefreshIssue

  const liveFields: CurrentField[] = [
    {
      key: 'temperature',
      label: 'Temperature',
      value: current.temperatureC,
      unit: WEATHER_UNITS.temperature,
    },
    {
      key: 'feels-like',
      label: 'Feels-like',
      value: current.feelsLikeC,
      unit: WEATHER_UNITS.temperature,
    },
    {
      key: 'dew-point',
      label: 'Dew point',
      value: current.dewpointC,
      unit: WEATHER_UNITS.temperature,
    },
    {
      key: 'humidity',
      label: 'Humidity',
      value: current.humidityPercent,
      unit: '%',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    },
    {
      key: 'pressure',
      label: 'Pressure',
      value: current.pressureHpa,
      unit: WEATHER_UNITS.pressure,
    },
    {
      key: 'wind-speed',
      label: 'Wind speed',
      value: current.windSpeedMph,
      unit: WEATHER_UNITS.wind,
    },
    {
      key: 'wind-gust',
      label: 'Wind gust',
      value: current.windGustMph,
      unit: WEATHER_UNITS.wind,
    },
    {
      key: 'wind-direction',
      label: 'Wind direction',
      value: current.windDirectionDegrees,
      unit: '°',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    },
    {
      key: 'rain-rate',
      label: 'Rain rate',
      value: current.rainRateMmPerHour,
      unit: `${WEATHER_UNITS.rainfall}/hr`,
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    },
    {
      key: 'rain-today',
      label: `Today's live rainfall`,
      value: current.rainTodayMm,
      unit: WEATHER_UNITS.rainfall,
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    },
  ]

  const { todayDate, yesterdayDate } = getTodayAndYesterdayClimateDates(now)
  const yesterdayRecord = annual == null ? null : findClimateRecord(annual.records, yesterdayDate)
  const monthRecords = annual == null ? [] : recordsForMonth(annual.records, todayDate)

  const monthStats = deriveCurrentMonthStats(monthRecords, monthlyNormal)

  const recentObservations = recent.observations
  const temperaturePoints = toChartPoints(recentObservations, (entry) => entry.temperatureC)
  const pressurePoints = toChartPoints(recentObservations, (entry) => entry.pressureHpa)
  const rainfallMetric = chooseRainfallMetric(recentObservations)
  const rainfallPoints = toChartPoints(recentObservations, rainfallMetric.selector)

  return (
    <div className="overview-layout">
      <section className="card overview-status" aria-labelledby="overview-status-title">
        <div className="overview-status-header">
          <h2 id="overview-status-title">Station status</h2>
          <div className="overview-status-actions">
            <Badge variant={headerOffline ? 'error' : 'success'}>
              {headerOffline ? 'Offline' : 'Online'}
            </Badge>
            <button
              type="button"
              className="button"
              onClick={() => {
                void Promise.all([
                  currentQuery.refetch(),
                  statusQuery.refetch(),
                  recentQuery.refetch(),
                  todayQuery.refetch(),
                ])
              }}
            >
              Manual refresh
            </button>
          </div>
        </div>

        <dl className="overview-metadata-grid">
          <div>
            <dt>Observation timestamp</dt>
            <dd>{formatDateTimeValue(observationTimeUtc)}</dd>
          </div>
          <div>
            <dt>Observation age</dt>
            <dd>{formatObservationAge(observationAgeSeconds)}</dd>
          </div>
          <div>
            <dt>Last successful update</dt>
            <dd>
              {formatDateTimeValue(
                current.fetchedAtUtc ?? status.checkedAtUtc ?? null,
              )}
            </dd>
          </div>
        </dl>

        {showStaleWarning ? (
          <StaleDataWarning message="Data may be delayed; the latest successful values remain visible." />
        ) : null}
      </section>

      <section className="card" aria-labelledby="overview-current-title">
        <h2 id="overview-current-title">Current conditions</h2>
        <CardGrid>
          {liveFields.map((field) => (
            <article key={field.key} className="card overview-metric-card">
              <h3>{field.label}</h3>
              <p className="overview-metric-value">
                {formatNullableMeasurement(field.value, {
                  unit: field.unit,
                  minimumFractionDigits: field.minimumFractionDigits,
                  maximumFractionDigits: field.maximumFractionDigits,
                })}
              </p>
            </article>
          ))}
        </CardGrid>
      </section>

      <div className="overview-climate-grid">
        <section className="card" aria-labelledby="overview-today-title">
          <div className="overview-card-heading">
            <h2 id="overview-today-title">Today's provisional climate</h2>
            <ProvisionalBadge />
          </div>
          {todayQuery.data == null ? (
            <UnavailableDataDisplay
              title="Today's provisional values unavailable"
              message="today.json is unavailable right now."
            />
          ) : (
            <dl className="overview-key-value-list">
              <div>
                <dt>Provisional maximum</dt>
                <dd>
                  {formatNullableMeasurement(todayQuery.data.maximumTemperature?.value ?? null, {
                    unit: WEATHER_UNITS.temperature,
                  })}
                </dd>
              </div>
              <div>
                <dt>Provisional minimum</dt>
                <dd>
                  {formatNullableMeasurement(todayQuery.data.minimumTemperature?.value ?? null, {
                    unit: WEATHER_UNITS.temperature,
                  })}
                </dd>
              </div>
              <div>
                <dt>Provisional rainfall</dt>
                <dd>
                  {formatNullableMeasurement(todayQuery.data.rainfall?.totalMm ?? null, {
                    unit: WEATHER_UNITS.rainfall,
                  })}
                </dd>
              </div>
            </dl>
          )}
          <p className="overview-note">
            Provisional values are live-day estimates; official daily extremes use
            different finalised windows in the climate archive.
          </p>
        </section>

        <section className="card" aria-labelledby="overview-yesterday-title">
          <h2 id="overview-yesterday-title">Yesterday's finalised climate</h2>
          {yesterdayRecord == null ? (
            <UnavailableDataDisplay
              title="Yesterday's record unavailable"
              message="No finalised climate archive record is currently available for yesterday."
            />
          ) : (
            <>
              <dl className="overview-key-value-list">
                <div>
                  <dt>Maximum</dt>
                  <dd>
                    {formatNullableMeasurement(yesterdayRecord.maxTempC, {
                      unit: WEATHER_UNITS.temperature,
                    })}
                  </dd>
                </div>
                <div>
                  <dt>Minimum</dt>
                  <dd>
                    {formatNullableMeasurement(yesterdayRecord.minTempC, {
                      unit: WEATHER_UNITS.temperature,
                    })}
                  </dd>
                </div>
                <div>
                  <dt>Mean</dt>
                  <dd>
                    {formatNullableMeasurement(yesterdayRecord.meanTempC, {
                      unit: WEATHER_UNITS.temperature,
                    })}
                  </dd>
                </div>
                <div>
                  <dt>Rainfall</dt>
                  <dd>
                    {formatNullableMeasurement(yesterdayRecord.rainfallMm, {
                      unit: WEATHER_UNITS.rainfall,
                    })}
                  </dd>
                </div>
              </dl>
              <p>
                <Link to={`/climate-archive?date=${yesterdayRecord.date}`} className="link-focus">
                  View {formatEuropeLondonDisplay(yesterdayRecord.date, SHORT_DATE_FORMAT)} in Climate Archive
                </Link>
              </p>
            </>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="overview-month-title">
        <div className="overview-card-heading">
          <h2 id="overview-month-title">Current month context</h2>
          <Badge variant={monthStats.complete ? 'success' : 'warning'}>
            {monthStats.complete ? 'Complete to date' : 'Provisional / incomplete'}
          </Badge>
        </div>

        {!monthStats.complete ? (
          <IncompleteDataWarning message="Current-month coverage is still provisional and may be incomplete." />
        ) : null}

        <dl className="overview-key-value-grid">
          <div>
            <dt>Highest max</dt>
            <dd>{formatNullableMeasurement(monthStats.highestMax, { unit: WEATHER_UNITS.temperature })}</dd>
          </div>
          <div>
            <dt>Lowest min</dt>
            <dd>{formatNullableMeasurement(monthStats.lowestMin, { unit: WEATHER_UNITS.temperature })}</dd>
          </div>
          <div>
            <dt>Mean max</dt>
            <dd>{formatNullableMeasurement(monthStats.meanMax, { unit: WEATHER_UNITS.temperature })}</dd>
          </div>
          <div>
            <dt>Mean min</dt>
            <dd>{formatNullableMeasurement(monthStats.meanMin, { unit: WEATHER_UNITS.temperature })}</dd>
          </div>
          <div>
            <dt>Mean temperature</dt>
            <dd>{formatNullableMeasurement(monthStats.meanTemp, { unit: WEATHER_UNITS.temperature })}</dd>
          </div>
          <div>
            <dt>Rainfall total</dt>
            <dd>{formatNullableMeasurement(monthStats.rainfallTotal, { unit: WEATHER_UNITS.rainfall })}</dd>
          </div>
          <div>
            <dt>Rain days</dt>
            <dd>{monthStats.rainDays}</dd>
          </div>
          <div>
            <dt>Wettest day</dt>
            <dd>{formatNullableMeasurement(monthStats.wettestDay, { unit: WEATHER_UNITS.rainfall })}</dd>
          </div>
          <div>
            <dt>Coverage</dt>
            <dd>{monthStats.coverageText}</dd>
          </div>
          <div>
            <dt>Temperature anomaly</dt>
            <dd>
              {formatNullableMeasurement(monthStats.temperatureAnomaly, {
                unit: WEATHER_UNITS.temperature,
              })}
            </dd>
          </div>
          <div>
            <dt>Rainfall normal %</dt>
            <dd>
              {formatNullableMeasurement(monthStats.rainfallPercentageOfNormal, {
                unit: '%',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </dd>
          </div>
        </dl>
      </section>

      <section className="card" aria-labelledby="overview-charts-title">
        <h2 id="overview-charts-title">Recent trend charts</h2>
        <div className="overview-chart-grid">
          <RecentLineChart
            title="Temperature"
            unit={WEATHER_UNITS.temperature}
            points={temperaturePoints}
          />
          <RecentLineChart
            title="Pressure"
            unit={WEATHER_UNITS.pressure}
            points={pressurePoints}
          />
          <RecentLineChart
            title={rainfallMetric.label}
            unit={rainfallMetric.unit}
            points={rainfallPoints}
          />
        </div>
      </section>

      <section className="card" aria-labelledby="overview-links-title">
        <h2 id="overview-links-title">Quick links</h2>
        <ul className="overview-quick-links">
          <li>
            <Link to="/live-data" className="link-focus">Live Data</Link>
          </li>
          <li>
            <Link to="/climate-archive" className="link-focus">Climate Archive</Link>
          </li>
          <li>
            <Link to="/records" className="link-focus">Records</Link>
          </li>
          <li>
            <Link to="/reports" className="link-focus">Reports</Link>
          </li>
        </ul>
      </section>
    </div>
  )
}

function RecentLineChart({
  title,
  unit,
  points,
}: {
  readonly title: string
  readonly unit: string
  readonly points: readonly ChartPoint[]
}) {
  const summary = describeChart(points, unit)

  if (points.length === 0) {
    return (
      <article className="card overview-chart-card">
        <h3>{title}</h3>
        <UnavailableDataDisplay
          title="Recent series unavailable"
          message="No recent observations are available for this chart."
        />
      </article>
    )
  }

  const validValues = points.filter((point) => point.value != null)

  if (validValues.length === 0) {
    return (
      <article className="card overview-chart-card">
        <h3>{title}</h3>
        <p className="overview-note">No valid values in the recent observation window.</p>
        <p className="overview-chart-summary">{summary}</p>
      </article>
    )
  }

  const minValue = Math.min(...validValues.map((point) => point.value as number))
  const maxValue = Math.max(...validValues.map((point) => point.value as number))
  const range = maxValue - minValue || 1
  const width = 320
  const height = 120
  const xStep = points.length > 1 ? width / (points.length - 1) : width

  const segments: string[] = []
  let activeSegment: string[] = []

  points.forEach((point, index) => {
    if (point.value == null) {
      if (activeSegment.length > 1) {
        segments.push(activeSegment.join(' '))
      }
      activeSegment = []
      return
    }

    const x = index * xStep
    const y = height - ((point.value - minValue) / range) * height
    activeSegment.push(`${activeSegment.length === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
  })

  if (activeSegment.length > 1) {
    segments.push(activeSegment.join(' '))
  }

  const firstLabel = points[0]?.timeLabel ?? 'n/a'
  const lastLabel = points.at(-1)?.timeLabel ?? 'n/a'

  return (
    <article className="card overview-chart-card">
      <h3>{title}</h3>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="overview-sparkline"
        role="img"
        aria-label={`${title} from ${firstLabel} to ${lastLabel}`}
      >
        <line x1="0" y1={height} x2={width} y2={height} className="overview-chart-axis" />
        {segments.map((segment) => (
          <path key={segment} d={segment} className="overview-chart-line" />
        ))}
      </svg>
      <p className="overview-chart-summary">{summary}</p>
    </article>
  )
}

function describeChart(points: readonly ChartPoint[], unit: string): string {
  const values = points.filter((point) => point.value != null).map((point) => point.value as number)

  if (values.length === 0) {
    return 'No valid observations in this range.'
  }

  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const missing = points.length - values.length

  return `Range ${formatNullableMeasurement(minimum, { unit })} to ${formatNullableMeasurement(maximum, { unit })}. Missing observations: ${missing}.`
}

function deriveCurrentMonthStats(records: readonly ClimateDay[], monthlyNormal: MonthlyNormal | null) {
  const maxValues = records.map((record) => record.maxTempC).filter(isFiniteNumber)
  const minValues = records.map((record) => record.minTempC).filter(isFiniteNumber)
  const meanValues = records.map((record) => record.meanTempC).filter(isFiniteNumber)
  const rainfallValues = records.map((record) => record.rainfallMm).filter(isFiniteNumber)

  const rainfallTotal = rainfallValues.length === 0
    ? null
    : rainfallValues.reduce((sum, value) => sum + value, 0)

  const rainDays = rainfallValues.filter((value) => value > 0.1).length
  const wettestDay = rainfallValues.length === 0 ? null : Math.max(...rainfallValues)

  const expectedDays = expectedDaysThisMonth()
  const maxCoverage = maxValues.length
  const minCoverage = minValues.length
  const meanCoverage = meanValues.length
  const rainfallCoverage = records.filter((record) => record.rainfallMm != null).length

  const complete =
    maxCoverage >= expectedDays &&
    minCoverage >= expectedDays &&
    meanCoverage >= expectedDays &&
    rainfallCoverage >= expectedDays

  const meanTemp = meanValues.length === 0
    ? null
    : meanValues.reduce((sum, value) => sum + value, 0) / meanValues.length

  const temperatureAnomaly =
    meanTemp != null && monthlyNormal?.meanTempC != null
      ? meanTemp - monthlyNormal.meanTempC
      : null

  const rainfallPercentageOfNormal =
    rainfallTotal != null && monthlyNormal?.rainfallMm != null && monthlyNormal.rainfallMm > 0
      ? (rainfallTotal / monthlyNormal.rainfallMm) * 100
      : null

  return {
    highestMax: maxValues.length === 0 ? null : Math.max(...maxValues),
    lowestMin: minValues.length === 0 ? null : Math.min(...minValues),
    meanMax: maxValues.length === 0
      ? null
      : maxValues.reduce((sum, value) => sum + value, 0) / maxValues.length,
    meanMin: minValues.length === 0
      ? null
      : minValues.reduce((sum, value) => sum + value, 0) / minValues.length,
    meanTemp,
    rainfallTotal,
    rainDays,
    wettestDay,
    coverageText: `${Math.min(maxCoverage, minCoverage, meanCoverage, rainfallCoverage)}/${expectedDays}`,
    temperatureAnomaly,
    rainfallPercentageOfNormal,
    complete,
  }
}

function chooseRainfallMetric(observations: readonly RecentObservation[]): {
  label: string
  unit: string
  selector: (entry: RecentObservation) => number | null
} {
  const hasRainRate = observations.some((entry) => entry.rainRateMmPerHour != null)

  if (hasRainRate) {
    return {
      label: 'Rain rate',
      unit: `${WEATHER_UNITS.rainfall}/hr`,
      selector: (entry) => entry.rainRateMmPerHour,
    }
  }

  return {
    label: `Today's live rainfall`,
    unit: WEATHER_UNITS.rainfall,
    selector: (entry) => entry.rainTodayMm,
  }
}

function toChartPoints(
  observations: readonly RecentObservation[],
  selector: (entry: RecentObservation) => number | null,
): ChartPoint[] {
  return [...observations]
    .sort((left, right) =>
      new Date(left.observationTimeUtc).valueOf() - new Date(right.observationTimeUtc).valueOf(),
    )
    .map((entry) => ({
      timeLabel: formatDateTimeValue(entry.observationTimeUtc, TIME_FORMAT),
      value: selector(entry),
    }))
}

function resolveMonthlyNormal(months: readonly MonthlyNormal[] | undefined): MonthlyNormal | null {
  if (months == null || months.length === 0) {
    return null
  }

  const month = new Date().getMonth() + 1
  return months.find((entry) => entry.month === month) ?? null
}

function findClimateRecord(records: readonly ClimateDay[], date: ClimateDateString): ClimateDay | null {
  return records.find((record) => record.date === date) ?? null
}

function recordsForMonth(records: readonly ClimateDay[], date: ClimateDateString): ClimateDay[] {
  const { year, month } = parseIsoClimateDate(date)

  return records.filter((record) => {
    const parts = parseIsoClimateDate(record.date)
    return parts.year === year && parts.month === month
  })
}

function deriveObservationAgeSeconds(observationTimeUtc: string | null, now: Date): number | null {
  if (observationTimeUtc == null) {
    return null
  }

  const observationDate = new Date(observationTimeUtc)

  if (Number.isNaN(observationDate.valueOf())) {
    return null
  }

  return Math.max(0, Math.floor((now.valueOf() - observationDate.valueOf()) / 1000))
}

function formatObservationAge(seconds: number | null): string {
  if (seconds == null) {
    return '—'
  }

  const minutes = Math.floor(seconds / 60)

  if (minutes < 1) {
    return '<1 minute'
  }

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? '' : 's'}`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (remainingMinutes === 0) {
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }

  return `${hours}h ${remainingMinutes}m`
}

function getTodayAndYesterdayClimateDates(now: Date): {
  todayDate: ClimateDateString
  yesterdayDate: ClimateDateString
} {
  const parts = ISO_DATE_FORMATTER
    .formatToParts(now)
    .reduce<Record<string, string>>((accumulator, part) => {
      if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
        accumulator[part.type] = part.value
      }
      return accumulator
    }, {})

  const todayDate = `${parts.year}-${parts.month}-${parts.day}` as ClimateDateString
  const todayUtc = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12))
  const yesterdayUtc = new Date(todayUtc.valueOf() - 24 * 60 * 60 * 1000)

  const yesterdayParts = ISO_DATE_FORMATTER
    .formatToParts(yesterdayUtc)
    .reduce<Record<string, string>>((accumulator, part) => {
      if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
        accumulator[part.type] = part.value
      }
      return accumulator
    }, {})

  return {
    todayDate,
    yesterdayDate: `${yesterdayParts.year}-${yesterdayParts.month}-${yesterdayParts.day}` as ClimateDateString,
  }
}

function expectedDaysThisMonth(): number {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  return new Date(year, month + 1, 0).getDate()
}

function formatDateTimeValue(
  value: string | null,
  options: Intl.DateTimeFormatOptions = DATE_TIME_FORMAT,
): string {
  if (value == null) {
    return '—'
  }

  try {
    return formatEuropeLondonDisplay(value, options)
  } catch {
    return '—'
  }
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value)
}

// Included for strongly-typed compile-time verification of source endpoint compatibility.
void ({} as CurrentConditions)
void ({} as StationStatus)
