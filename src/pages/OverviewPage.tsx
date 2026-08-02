import { type ReactNode, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Badge,
  ErrorState,
  FullscreenChartModal,
  IncompleteDataWarning,
  ProvisionalBadge,
  Skeleton,
  StaleDataWarning,
  UnavailableDataDisplay,
  VisuallyHidden,
} from '@/components/ui'
import { MONTHLY_NORMAL_BASELINE, WEATHER_UNITS } from '@/config/weather'
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
  calculateDailyMeanTemperature,
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
import {
  buildChartPoints,
  computeSeriesRanges,
  OVERVIEW_CHART_SERIES,
  OverviewChart,
  type OverviewChartType,
} from '@/pages/overviewChart'
import { MetricIcon } from '@/pages/overviewIcons'

const STALE_OBSERVATION_SECONDS = 15 * 60

const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
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

const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
] as const

type MetricField = {
  key: string
  label: string
  value: number | null
  unit: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  sub?: ReactNode
}

const RANGE_PRESETS = [
  { id: '24h', label: '24-hour', ms: 24 * 60 * 60 * 1000 },
  { id: '7d', label: '7-day', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '30d', label: '30-day', ms: 30 * 24 * 60 * 60 * 1000 },
  { id: 'ytd', label: 'Year to date', ms: null },
  { id: 'custom', label: 'Custom', ms: null },
] as const

type RangePresetId = (typeof RANGE_PRESETS)[number]['id']

const CHART_TYPES: ReadonlyArray<{ id: OverviewChartType; label: string }> = [
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
  { id: 'bar', label: 'Bar' },
  { id: 'scatter', label: 'Scatter' },
]

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
    return years.reduce(
      (highest, yearEntry) => (yearEntry.year > highest ? yearEntry.year : highest),
      years[0]?.year ?? new Date().getUTCFullYear(),
    )
  }, [archiveIndexQuery.data])

  const annualQuery = useAnnualClimateQuery(latestYear)

  const [rangePreset, setRangePreset] = useState<RangePresetId>('24h')
  const [chartType, setChartType] = useState<OverviewChartType>('line')
  const [enabledSeriesIds, setEnabledSeriesIds] = useState<ReadonlySet<string>>(
    () => new Set(OVERVIEW_CHART_SERIES.filter((series) => series.defaultOn).map((series) => series.id)),
  )
  const [showMoreSeries, setShowMoreSeries] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

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
  const observationTimeUtc = current.observationTimeUtc ?? status.observationTimeUtc ?? null
  const observationAgeSeconds =
    status.observationAgeSeconds ?? deriveObservationAgeSeconds(observationTimeUtc, now)

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

  const recentObservations = recent.observations
  const sortedObservations = sortObservations(recentObservations)

  const compass = degreesToCompass(current.windDirectionDegrees)
  const temperatureTrend = deriveTrend(sortedObservations, (entry) => entry.temperatureC)
  const pressureTrend = deriveTrend(sortedObservations, (entry) => entry.pressureHpa)

  const liveFields: MetricField[] = [
    {
      key: 'temperature',
      label: 'Temperature',
      value: current.temperatureC,
      unit: WEATHER_UNITS.temperature,
      sub: renderTrend(temperatureTrend, WEATHER_UNITS.temperature),
    },
    {
      key: 'feels-like',
      label: 'Feels like',
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
      sub: renderTrend(pressureTrend, WEATHER_UNITS.pressure),
    },
    {
      key: 'wind-speed',
      label: 'Wind',
      value: current.windSpeedMph,
      unit: WEATHER_UNITS.wind,
      sub:
        compass != null ? (
          <span className="wind-direction-text">{compass}</span>
        ) : undefined,
    },
    {
      key: 'wind-gust',
      label: 'Gust',
      value: current.windGustMph,
      unit: WEATHER_UNITS.wind,
    },
    {
      key: 'rain-rate',
      label: 'Rain rate',
      value: current.rainRateMmPerHour,
      unit: `${WEATHER_UNITS.rainfall}/hr`,
    },
    {
      key: 'rain-today',
      label: `Today's rainfall`,
      value: current.rainTodayMm,
      unit: WEATHER_UNITS.rainfall,
    },
  ]

  const { todayDate, yesterdayDate } = getTodayAndYesterdayClimateDates(now)
  const yesterdayRecord = annual == null ? null : findClimateRecord(annual.records, yesterdayDate)
  const monthRecords = annual == null ? [] : recordsForMonth(annual.records, todayDate)
  const monthStats = deriveCurrentMonthStats(monthRecords, monthlyNormal)

  const provisionalMax = todayQuery.data?.maximumTemperature?.value ?? null
  const provisionalMin = todayQuery.data?.minimumTemperature?.value ?? null
  const provisionalMean = calculateDailyMeanTemperature(provisionalMax, provisionalMin)

  const enabledSeries = OVERVIEW_CHART_SERIES.filter((series) => enabledSeriesIds.has(series.id))
  const visibleObservations = filterByRange(sortedObservations, rangePreset)
  const chartPoints = buildChartPoints(visibleObservations)
  const seriesRanges = computeSeriesRanges(chartPoints, enabledSeries)

  const toggleSeries = (id: string) => {
    setEnabledSeriesIds((previous) => {
      const next = new Set(previous)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const chartControls = (
    <div className="graph-controls">
      <div className="graph-control-group">
        <span className="graph-control-label">Graph view</span>
        {RANGE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="graph-range-btn"
            aria-pressed={rangePreset === preset.id}
            onClick={() => setRangePreset(preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="graph-control-group">
        <span className="graph-control-label">Type</span>
        {CHART_TYPES.map((type) => (
          <button
            key={type.id}
            type="button"
            className="graph-type-btn"
            aria-pressed={chartType === type.id}
            onClick={() => setChartType(type.id)}
          >
            {type.label}
          </button>
        ))}
      </div>
      <div className="graph-control-group">
        <span className="graph-control-label">Data series</span>
        {OVERVIEW_CHART_SERIES.filter((series) => !series.more || showMoreSeries).map((series) => (
          <label key={series.id} className="graph-series-check">
            <input
              type="checkbox"
              checked={enabledSeriesIds.has(series.id)}
              onChange={() => toggleSeries(series.id)}
            />
            <span className="graph-series-dot" style={{ background: series.color }} />
            {series.label}
          </label>
        ))}
        <button
          type="button"
          className="graph-type-btn"
          aria-pressed={showMoreSeries}
          onClick={() => setShowMoreSeries((previous) => !previous)}
        >
          {showMoreSeries ? 'Less' : 'More'} ▾
        </button>
      </div>
    </div>
  )

  const chartLegend = (
    <div className="graph-legend" aria-hidden="true">
      {enabledSeries.map((series) => (
        <span key={series.id} className="graph-legend__item">
          <span className="graph-legend__swatch" style={{ background: series.color }} />
          {series.label} ({series.unit})
        </span>
      ))}
    </div>
  )

  return (
    <div className="overview-layout">
      <section className="overview-status-bar" aria-label="Station status">
        <Badge variant={headerOffline ? 'error' : 'success'}>
          {headerOffline ? 'Station offline' : 'Station online'}
        </Badge>
        <span className="header-updated">
          Last updated: {formatDateTimeValue(observationTimeUtc)}
        </span>
        {showStaleWarning ? (
          <StaleDataWarning message="Latest successful values remain visible." />
        ) : null}
        <button
          type="button"
          className="button button-outline"
          style={{ marginLeft: 'auto' }}
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
      </section>

      <section className="card" aria-labelledby="cc-title">
        <h2 id="cc-title" className="section-title">Current conditions</h2>
        <div className="metric-cards-row">
          {liveFields.map((field) => (
            <div key={field.key} className="metric-card">
              <span className="metric-card__icon">
                <MetricIcon name={field.key} />
              </span>
              <span className="metric-card__label">{field.label}</span>
              <span className="metric-card__value">
                {formatNullableMeasurement(field.value, {
                  unit: field.unit,
                  minimumFractionDigits: field.minimumFractionDigits,
                  maximumFractionDigits: field.maximumFractionDigits,
                })}
              </span>
              {field.sub != null ? <span className="metric-card__sub">{field.sub}</span> : null}
            </div>
          ))}
        </div>
      </section>

      <div className="climate-context-row">
        <section className="card climate-row-card" aria-labelledby="today-climate-title">
          <div className="climate-row-card__heading">
            <h3 id="today-climate-title">Today's provisional climate</h3>
            <ProvisionalBadge />
          </div>
          {todayQuery.data == null ? (
            <UnavailableDataDisplay
              title="Today's provisional values unavailable"
              message="today.json is unavailable right now."
            />
          ) : (
            <div className="climate-stats-row">
              <ClimateStat
                label="Max"
                value={provisionalMax}
                unit={WEATHER_UNITS.temperature}
                sub={formatLocalTime(todayQuery.data.maximumTemperature?.timeLocal ?? null)}
              />
              <ClimateStat
                label="Min"
                value={provisionalMin}
                unit={WEATHER_UNITS.temperature}
                sub={formatLocalTime(todayQuery.data.minimumTemperature?.timeLocal ?? null)}
              />
              <ClimateStat label="Mean" value={provisionalMean} unit={WEATHER_UNITS.temperature} />
              <ClimateStat
                label="Rain"
                value={todayQuery.data.rainfall?.totalMm ?? null}
                unit={WEATHER_UNITS.rainfall}
              />
            </div>
          )}
          <p className="climate-row-card__note">
            Provisional live-day estimates; official extremes use finalised windows.
          </p>
        </section>

        <section className="card climate-row-card" aria-labelledby="yesterday-climate-title">
          <div className="climate-row-card__heading">
            <h3 id="yesterday-climate-title">Yesterday's finalised climate</h3>
            <Badge variant="default">Official 06:00–06:00</Badge>
          </div>
          {yesterdayRecord == null ? (
            <UnavailableDataDisplay
              title="Yesterday's record unavailable"
              message="No finalised climate archive record is currently available for yesterday."
            />
          ) : (
            <>
              <div className="climate-stats-row">
                <ClimateStat label="Max" value={yesterdayRecord.maxTempC} unit={WEATHER_UNITS.temperature} />
                <ClimateStat label="Min" value={yesterdayRecord.minTempC} unit={WEATHER_UNITS.temperature} />
                <ClimateStat label="Mean" value={yesterdayRecord.meanTempC} unit={WEATHER_UNITS.temperature} />
                <ClimateStat label="Rain" value={yesterdayRecord.rainfallMm} unit={WEATHER_UNITS.rainfall} />
              </div>
              <p className="climate-row-card__note">
                <Link to={`/climate-archive?date=${yesterdayRecord.date}`} className="link-focus">
                  View {formatEuropeLondonDisplay(yesterdayRecord.date, SHORT_DATE_FORMAT)} in Climate
                  Archive
                </Link>
              </p>
            </>
          )}
        </section>

        <section className="card climate-row-card" aria-labelledby="month-climate-title">
          <div className="climate-row-card__heading">
            <h3 id="month-climate-title">Current month context</h3>
            <Badge variant={monthStats.complete ? 'success' : 'warning'}>
              {monthStats.complete ? 'Complete to date' : 'Provisional / incomplete'}
            </Badge>
          </div>
          {!monthStats.complete ? (
            <IncompleteDataWarning message="Current-month coverage is still provisional and may be incomplete." />
          ) : null}
          <div className="climate-stats-row">
            <ClimateStat label="Highest max" value={monthStats.highestMax} unit={WEATHER_UNITS.temperature} />
            <ClimateStat label="Lowest min" value={monthStats.lowestMin} unit={WEATHER_UNITS.temperature} />
            <ClimateStat label="Mean max" value={monthStats.meanMax} unit={WEATHER_UNITS.temperature} />
            <ClimateStat label="Mean min" value={monthStats.meanMin} unit={WEATHER_UNITS.temperature} />
            <ClimateStat label="Mean temp" value={monthStats.meanTemp} unit={WEATHER_UNITS.temperature} />
            <ClimateStat label="Rain total" value={monthStats.rainfallTotal} unit={WEATHER_UNITS.rainfall} />
            <ClimateStat label="Rain days" value={monthStats.rainDays} unit="" plain />
            <ClimateStat label="Wettest day" value={monthStats.wettestDay} unit={WEATHER_UNITS.rainfall} />
          </div>
          <div className="coverage-bar">
            <div className="coverage-bar__label">
              Coverage: {monthStats.coverageDays}/{monthStats.expectedDays} days (provisional)
            </div>
            <div className="coverage-bar__track">
              <div
                className="coverage-bar__fill"
                style={{ ['--coverage-pct' as string]: `${monthStats.coveragePct}%` }}
              />
            </div>
          </div>
        </section>
      </div>

      <section className="card graph-section" aria-labelledby="graph-title">
        <div className="graph-section__header">
          <h2 id="graph-title" className="section-title">Graph view</h2>
          <button
            type="button"
            className="fullscreen-btn"
            aria-label="Open chart in fullscreen"
            onClick={() => setFullscreen(true)}
          >
            ⤢
          </button>
        </div>
        {chartControls}
        {chartLegend}
        <div className="overview-chart-wrap">
          <OverviewChart points={chartPoints} enabledSeries={enabledSeries} chartType={chartType} />
        </div>
        <div className="range-summary-row">
          <span className="range-summary-row__label">Range (visible period)</span>
          {seriesRanges.map((range) => (
            <span key={range.id} className="range-chip">
              <span className="range-chip__dot" style={{ background: range.color }} />
              {range.label}: {formatNullableMeasurement(range.min, { unit: range.unit })} –{' '}
              {formatNullableMeasurement(range.max, { unit: range.unit })}
            </span>
          ))}
        </div>
      </section>

      <div className="info-cards-row">
        <RecentExtremesCard observations={sortedObservations} />
        <RainfallSummaryCard
          todayRainfall={current.rainTodayMm}
          rainDays={monthStats.rainDays}
          wettestDay={monthStats.wettestDay}
        />
        <section className="card info-card" aria-labelledby="sun-day-title">
          <h3 id="sun-day-title">Sun &amp; day</h3>
          <UnavailableDataDisplay
            title="Sunrise/sunset unavailable"
            message="Sunrise and sunset data are not published by the station feed."
          />
        </section>
        <section className="card info-card" aria-labelledby="station-info-title">
          <h3 id="station-info-title">Station info</h3>
          <dl className="info-card__list">
            <div className="info-card__row">
              <dt>Station</dt>
              <dd>{typeof archiveIndexQuery.data?.station === 'string' ? archiveIndexQuery.data.station : 'Wakefield'}</dd>
            </div>
            <div className="info-card__row">
              <dt>Baseline</dt>
              <dd>{MONTHLY_NORMAL_BASELINE}</dd>
            </div>
            <div className="info-card__row">
              <dt>Updated</dt>
              <dd>{formatDateTimeValue(current.fetchedAtUtc ?? status.checkedAtUtc ?? observationTimeUtc)}</dd>
            </div>
          </dl>
        </section>
      </div>

      <FullscreenChartModal
        title="Graph view"
        isOpen={fullscreen}
        onClose={() => setFullscreen(false)}
      >
        {chartControls}
        {chartLegend}
        <div className="overview-chart-wrap" style={{ flex: 1, minHeight: 0 }}>
          <OverviewChart
            points={chartPoints}
            enabledSeries={enabledSeries}
            chartType={chartType}
            height={520}
          />
        </div>
      </FullscreenChartModal>
    </div>
  )
}

function ClimateStat({
  label,
  value,
  unit,
  sub,
  plain,
}: {
  readonly label: string
  readonly value: number | null
  readonly unit: string
  readonly sub?: string | null
  readonly plain?: boolean
}) {
  return (
    <div className="climate-stat">
      <span className="cs-label">{label}</span>
      <span className="cs-value">
        {plain
          ? value == null
            ? '—'
            : String(value)
          : formatNullableMeasurement(value, { unit })}
      </span>
      {sub != null && sub !== '' ? <span className="cs-sub">{sub}</span> : null}
    </div>
  )
}

function RecentExtremesCard({
  observations,
}: {
  readonly observations: readonly RecentObservation[]
}) {
  const highestTemp = extremeBy(observations, (entry) => entry.temperatureC, 'max')
  const lowestTemp = extremeBy(observations, (entry) => entry.temperatureC, 'min')
  const highestGust = extremeBy(observations, (entry) => entry.windGustMph, 'max')

  return (
    <section className="card info-card" aria-labelledby="recent-extremes-title">
      <h3 id="recent-extremes-title">
        Recent extremes <span className="info-card__period">(Today)</span>
      </h3>
      <dl className="info-card__list">
        <ExtremeRow label="Highest temp" extreme={highestTemp} unit={WEATHER_UNITS.temperature} />
        <ExtremeRow label="Lowest temp" extreme={lowestTemp} unit={WEATHER_UNITS.temperature} />
        <ExtremeRow label="Highest gust" extreme={highestGust} unit={WEATHER_UNITS.wind} />
      </dl>
    </section>
  )
}

function ExtremeRow({
  label,
  extreme,
  unit,
}: {
  readonly label: string
  readonly extreme: { value: number; timeUtc: string } | null
  readonly unit: string
}) {
  return (
    <div className="info-card__row">
      <dt>{label}</dt>
      <dd>
        {extreme == null ? '—' : formatNullableMeasurement(extreme.value, { unit })}
        {extreme != null ? (
          <span className="info-card__row-sub">{formatDateTimeValue(extreme.timeUtc, { hour: '2-digit', minute: '2-digit' })}</span>
        ) : null}
      </dd>
    </div>
  )
}

function RainfallSummaryCard({
  todayRainfall,
  rainDays,
  wettestDay,
}: {
  readonly todayRainfall: number | null
  readonly rainDays: number
  readonly wettestDay: number | null
}) {
  return (
    <section className="card info-card" aria-labelledby="rainfall-summary-title">
      <h3 id="rainfall-summary-title">
        Rainfall summary <span className="info-card__period">(Today / month)</span>
      </h3>
      <dl className="info-card__list">
        <div className="info-card__row">
          <dt>Total today</dt>
          <dd>{formatNullableMeasurement(todayRainfall, { unit: WEATHER_UNITS.rainfall })}</dd>
        </div>
        <div className="info-card__row">
          <dt>Rain days (month)</dt>
          <dd>{rainDays}</dd>
        </div>
        <div className="info-card__row">
          <dt>Wettest day (month)</dt>
          <dd>{formatNullableMeasurement(wettestDay, { unit: WEATHER_UNITS.rainfall })}</dd>
        </div>
      </dl>
    </section>
  )
}

function extremeBy(
  observations: readonly RecentObservation[],
  selector: (entry: RecentObservation) => number | null,
  mode: 'max' | 'min',
): { value: number; timeUtc: string } | null {
  let best: { value: number; timeUtc: string } | null = null
  for (const entry of observations) {
    const value = selector(entry)
    if (value == null || !Number.isFinite(value)) {
      continue
    }
    if (
      best == null ||
      (mode === 'max' && value > best.value) ||
      (mode === 'min' && value < best.value)
    ) {
      best = { value, timeUtc: entry.observationTimeUtc }
    }
  }
  return best
}

type Trend = { delta: number } | null

function deriveTrend(
  observations: readonly RecentObservation[],
  selector: (entry: RecentObservation) => number | null,
): Trend {
  if (observations.length < 2) {
    return null
  }
  const latest = observations[observations.length - 1]
  const latestValue = selector(latest)
  if (latestValue == null || !Number.isFinite(latestValue)) {
    return null
  }
  const latestTime = new Date(latest.observationTimeUtc).valueOf()
  const targetTime = latestTime - 60 * 60 * 1000
  let reference: RecentObservation | null = null
  for (const entry of observations) {
    const value = selector(entry)
    if (value == null || !Number.isFinite(value)) {
      continue
    }
    const time = new Date(entry.observationTimeUtc).valueOf()
    if (time <= targetTime) {
      reference = entry
    }
  }
  if (reference == null) {
    reference = observations.find((entry) => {
      const value = selector(entry)
      return value != null && Number.isFinite(value)
    }) ?? null
  }
  if (reference == null || reference === latest) {
    return null
  }
  const referenceValue = selector(reference)
  if (referenceValue == null || !Number.isFinite(referenceValue)) {
    return null
  }
  return { delta: latestValue - referenceValue }
}

function renderTrend(trend: Trend, unit: string): ReactNode {
  if (trend == null || Math.abs(trend.delta) < 0.05) {
    return undefined
  }
  const rising = trend.delta > 0
  const arrow = rising ? '▲' : '▼'
  const className = rising ? 'metric-card__sub--up' : 'metric-card__sub--down'
  return (
    <span className={className}>
      {arrow} {Math.abs(trend.delta).toFixed(1)} {unit}
    </span>
  )
}

function degreesToCompass(deg: number | null): string | null {
  if (deg == null || !Number.isFinite(deg)) {
    return null
  }
  return COMPASS_POINTS[Math.round(deg / 22.5) % 16]
}

function sortObservations(observations: readonly RecentObservation[]): RecentObservation[] {
  return [...observations].sort(
    (left, right) =>
      new Date(left.observationTimeUtc).valueOf() -
      new Date(right.observationTimeUtc).valueOf(),
  )
}

function filterByRange(
  observations: readonly RecentObservation[],
  preset: RangePresetId,
): RecentObservation[] {
  if (observations.length === 0) {
    return []
  }
  const latestTime = new Date(observations[observations.length - 1].observationTimeUtc).valueOf()
  let cutoff: number | null = null

  if (preset === 'ytd') {
    const year = new Date(latestTime).getUTCFullYear()
    cutoff = Date.UTC(year, 0, 1)
  } else if (preset === 'custom') {
    cutoff = null
  } else {
    const definition = RANGE_PRESETS.find((entry) => entry.id === preset)
    cutoff = definition?.ms != null ? latestTime - definition.ms : null
  }

  if (cutoff == null) {
    return [...observations]
  }

  const filtered = observations.filter(
    (entry) => new Date(entry.observationTimeUtc).valueOf() >= (cutoff as number),
  )
  return filtered.length >= 2 ? filtered : [...observations]
}

function deriveCurrentMonthStats(records: readonly ClimateDay[], monthlyNormal: MonthlyNormal | null) {
  const maxValues = records.map((record) => record.maxTempC).filter(isFiniteNumber)
  const minValues = records.map((record) => record.minTempC).filter(isFiniteNumber)
  const meanValues = records.map((record) => record.meanTempC).filter(isFiniteNumber)
  const rainfallValues = records.map((record) => record.rainfallMm).filter(isFiniteNumber)

  const rainfallTotal =
    rainfallValues.length === 0 ? null : rainfallValues.reduce((sum, value) => sum + value, 0)
  const rainDays = rainfallValues.filter((value) => value > 0.1).length
  const wettestDay = rainfallValues.length === 0 ? null : Math.max(...rainfallValues)

  const expectedDays = expectedDaysThisMonth()
  const maxCoverage = maxValues.length
  const minCoverage = minValues.length
  const meanCoverage = meanValues.length
  const rainfallCoverage = records.filter((record) => record.rainfallMm != null).length
  const coverageDays = Math.min(maxCoverage, minCoverage, meanCoverage, rainfallCoverage)

  const complete =
    maxCoverage >= expectedDays &&
    minCoverage >= expectedDays &&
    meanCoverage >= expectedDays &&
    rainfallCoverage >= expectedDays

  const meanTemp =
    meanValues.length === 0
      ? null
      : meanValues.reduce((sum, value) => sum + value, 0) / meanValues.length

  const temperatureAnomaly =
    meanTemp != null && monthlyNormal?.meanTempC != null ? meanTemp - monthlyNormal.meanTempC : null

  const rainfallPercentageOfNormal =
    rainfallTotal != null && monthlyNormal?.rainfallMm != null && monthlyNormal.rainfallMm > 0
      ? (rainfallTotal / monthlyNormal.rainfallMm) * 100
      : null

  return {
    highestMax: maxValues.length === 0 ? null : Math.max(...maxValues),
    lowestMin: minValues.length === 0 ? null : Math.min(...minValues),
    meanMax:
      maxValues.length === 0
        ? null
        : maxValues.reduce((sum, value) => sum + value, 0) / maxValues.length,
    meanMin:
      minValues.length === 0
        ? null
        : minValues.reduce((sum, value) => sum + value, 0) / minValues.length,
    meanTemp,
    rainfallTotal,
    rainDays,
    wettestDay,
    coverageDays,
    expectedDays,
    coveragePct: expectedDays === 0 ? 0 : Math.round((coverageDays / expectedDays) * 100),
    temperatureAnomaly,
    rainfallPercentageOfNormal,
    complete,
  }
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

function getTodayAndYesterdayClimateDates(now: Date): {
  todayDate: ClimateDateString
  yesterdayDate: ClimateDateString
} {
  const parts = ISO_DATE_FORMATTER.formatToParts(now).reduce<Record<string, string>>(
    (accumulator, part) => {
      if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
        accumulator[part.type] = part.value
      }
      return accumulator
    },
    {},
  )

  const todayDate = `${parts.year}-${parts.month}-${parts.day}` as ClimateDateString
  const todayUtc = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12))
  const yesterdayUtc = new Date(todayUtc.valueOf() - 24 * 60 * 60 * 1000)

  const yesterdayParts = ISO_DATE_FORMATTER.formatToParts(yesterdayUtc).reduce<Record<string, string>>(
    (accumulator, part) => {
      if (part.type === 'year' || part.type === 'month' || part.type === 'day') {
        accumulator[part.type] = part.value
      }
      return accumulator
    },
    {},
  )

  return {
    todayDate,
    yesterdayDate: `${yesterdayParts.year}-${yesterdayParts.month}-${yesterdayParts.day}` as ClimateDateString,
  }
}

function expectedDaysThisMonth(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
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

function formatLocalTime(value: string | null): string | null {
  if (value == null) {
    return null
  }
  try {
    return formatEuropeLondonDisplay(value, { hour: '2-digit', minute: '2-digit' })
  } catch {
    return value
  }
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value)
}

// Included for strongly-typed compile-time verification of source endpoint compatibility.
void ({} as CurrentConditions)
void ({} as StationStatus)
