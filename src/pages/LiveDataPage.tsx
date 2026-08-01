import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Badge,
  Skeleton,
  StaleDataWarning,
  UnavailableDataDisplay,
} from '@/components/ui'
import {
  currentConditionsQueryOptions,
  recentObservationsQueryOptions,
  stationStatusQueryOptions,
} from '@/api/publicWeatherApi'
import { WEATHER_UNITS } from '@/config/weather'
import { chartTokens } from '@/components/ui/chartTokens'
import type { CurrentConditions, RecentObservation, StationStatus } from '@/types/weather'
import {
  type RangeHours,
  type SortOrder,
  MEASUREMENT_OPTIONS,
  RANGE_OPTIONS,
  computeObservationAgeSeconds,
  deriveFeelsLikeFromObservation,
  exportObservationsCsv,
  filterObservationsByRange,
  formatLondonDateTime,
  formatLondonTime,
  formatObservationAge,
  isFieldSupportedInWindow,
  isStaleObservation,
  sortObservations,
} from '@/features/liveData/liveDataUtils'
import type { ChartDataPoint } from '@/features/liveData/LiveLineChart'
import { LiveLineChart } from '@/features/liveData/LiveLineChart'

const LIVE_REFRESH_MS = 60_000
const EMPTY_OBSERVATIONS: readonly RecentObservation[] = []

// ---------- custom hook: pauseable live queries ----------
function useLiveDataQueries(paused: boolean) {
  const refetchInterval = paused ? (false as const) : LIVE_REFRESH_MS

  const currentQuery = useQuery({
    ...currentConditionsQueryOptions,
    refetchInterval,
  })

  const statusQuery = useQuery({
    ...stationStatusQueryOptions,
    refetchInterval,
  })

  const recentQuery = useQuery({
    ...recentObservationsQueryOptions,
    refetchInterval,
  })

  const refreshAll = useCallback(() => {
    void currentQuery.refetch()
    void statusQuery.refetch()
    void recentQuery.refetch()
  }, [currentQuery, statusQuery, recentQuery])

  const isRefreshing =
    currentQuery.isFetching || statusQuery.isFetching || recentQuery.isFetching

  const lastUpdatedAt = Math.max(
    currentQuery.dataUpdatedAt,
    statusQuery.dataUpdatedAt,
    recentQuery.dataUpdatedAt,
  )

  return { currentQuery, statusQuery, recentQuery, refreshAll, isRefreshing, lastUpdatedAt }
}

// ---------- main page ----------
export default function LiveDataPage() {
  const [paused, setPaused] = useState(false)
  const [rangeHours, setRangeHours] = useState<RangeHours>(1)
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest-first')
  const [visibleMeasurements, setVisibleMeasurements] = useState<Set<string>>(
    new Set(MEASUREMENT_OPTIONS.map((m) => m.key)),
  )

  const { currentQuery, statusQuery, recentQuery, refreshAll, isRefreshing, lastUpdatedAt } =
    useLiveDataQueries(paused)

  // 1-second ticker for countdown and observation age
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const secondsToRefresh = useMemo(() => {
    if (paused || lastUpdatedAt === 0) return null
    return Math.max(0, Math.round((LIVE_REFRESH_MS - (now.valueOf() - lastUpdatedAt)) / 1000))
  }, [paused, lastUpdatedAt, now])

  const current = currentQuery.data ?? null
  const status = statusQuery.data ?? null
  const recentPayload = recentQuery.data ?? null

  // Stable reference: use the actual observations array, falling back to a module-level constant
  const allObservations: readonly RecentObservation[] =
    recentPayload?.observations ?? EMPTY_OBSERVATIONS

  // Use default `now` inside the util (new Date()) so the filter is fresh on each recompute
  // but we don't need to add `now` as a dependency (avoids per-second useMemo invalidation)
  const filteredObservations = useMemo(
    () => filterObservationsByRange(allObservations, rangeHours),
    [allObservations, rangeHours],
  )

  const sortedTableObservations = useMemo(
    () => sortObservations(filteredObservations, sortOrder),
    [filteredObservations, sortOrder],
  )

  // Stable chart time range – anchors to latest observation time so chart doesn't drift per second
  const [chartTMax, chartTMin] = useMemo(() => {
    const latest =
      filteredObservations.length > 0
        ? Math.max(...filteredObservations.map((o) => new Date(o.observationTimeUtc).valueOf()))
        : Date.now()
    return [latest, latest - rangeHours * 3_600_000]
  }, [filteredObservations, rangeHours])

  const ageSeconds = computeObservationAgeSeconds(status?.observationTimeUtc ?? null, now)
  const isStale = isStaleObservation(ageSeconds)
  const isOffline = status?.online === false

  const hasAnyError = currentQuery.isError && statusQuery.isError && recentQuery.isError
  const isInitialLoading =
    (currentQuery.isLoading && !current) || (recentQuery.isLoading && !recentPayload)

  // Field support checks
  const hasTempSeries =
    isFieldSupportedInWindow(filteredObservations, 'temperatureC') ||
    filteredObservations.some((o) => deriveFeelsLikeFromObservation(o) != null)
  const hasHumiditySeries =
    isFieldSupportedInWindow(filteredObservations, 'humidityPercent') ||
    isFieldSupportedInWindow(filteredObservations, 'dewpointC')
  const hasPressureSeries = isFieldSupportedInWindow(filteredObservations, 'pressureHpa')
  const hasWindSeries =
    isFieldSupportedInWindow(filteredObservations, 'windSpeedMph') ||
    isFieldSupportedInWindow(filteredObservations, 'windGustMph')
  const hasRainSeries =
    isFieldSupportedInWindow(filteredObservations, 'rainRateMmPerHour') ||
    isFieldSupportedInWindow(filteredObservations, 'rainTodayMm')

  function toPoints(
    obs: readonly RecentObservation[],
    fn: (o: RecentObservation) => number | null,
  ): ChartDataPoint[] {
    return obs.map((o) => ({
      timestamp: new Date(o.observationTimeUtc).valueOf(),
      value: fn(o),
    }))
  }

  const tempPrimary = useMemo(
    () => toPoints(filteredObservations, (o) => o.temperatureC),
    [filteredObservations],
  )
  const feelsLikeSecondary = useMemo(
    () => toPoints(filteredObservations, deriveFeelsLikeFromObservation),
    [filteredObservations],
  )
  const humidityPrimary = useMemo(
    () => toPoints(filteredObservations, (o) => o.humidityPercent),
    [filteredObservations],
  )
  const dewpointSecondary = useMemo(
    () => toPoints(filteredObservations, (o) => o.dewpointC),
    [filteredObservations],
  )
  const pressurePrimary = useMemo(
    () => toPoints(filteredObservations, (o) => o.pressureHpa),
    [filteredObservations],
  )
  const windSpeedPrimary = useMemo(
    () => toPoints(filteredObservations, (o) => o.windSpeedMph),
    [filteredObservations],
  )
  const windGustSecondary = useMemo(
    () => toPoints(filteredObservations, (o) => o.windGustMph),
    [filteredObservations],
  )

  const useRainRate = isFieldSupportedInWindow(filteredObservations, 'rainRateMmPerHour')
  const rainPrimary = useMemo(
    () =>
      toPoints(
        filteredObservations,
        (o) => (useRainRate ? o.rainRateMmPerHour : o.rainTodayMm),
      ),
    [filteredObservations, useRainRate],
  )

  function toggleMeasurement(key: string) {
    setVisibleMeasurements((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function handleCsvExport() {
    const csv = exportObservationsCsv(filteredObservations)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    const rangeLabel = `${rangeHours}h`
    link.download = `wakefield-observations-${rangeLabel}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (isInitialLoading) {
    return (
      <div className="live-data-layout">
        <h1>Live Data</h1>
        <Skeleton lines={6} />
      </div>
    )
  }

  if (hasAnyError && !current && !status && !recentPayload) {
    return (
      <div className="live-data-layout">
        <h1>Live Data</h1>
        <UnavailableDataDisplay
          title="Live data unavailable"
          message="Could not load live observations. Check your connection and try again."
        />
        <button type="button" className="button" onClick={refreshAll}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="live-data-layout">
      <div className="live-data-header">
        <h1>Live Data</h1>
        <div className="live-status-badges">
          {isOffline && <Badge variant="error">Offline</Badge>}
          {!isOffline && isStale && <Badge variant="warning">Stale data</Badge>}
          {!isOffline && !isStale && status?.online === true && (
            <Badge variant="success">Online</Badge>
          )}
        </div>
      </div>

      {/* Stale warning */}
      {isStale && !isOffline && (
        <StaleDataWarning
          message={`Observation age: ${formatObservationAge(ageSeconds)}. Data may not be current.`}
        />
      )}

      {/* ── Refresh controls ── */}
      <div className="live-refresh-bar">
        <button
          type="button"
          className="button button-ghost live-control-btn"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          aria-label={paused ? 'Resume automatic refresh' : 'Pause automatic refresh'}
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </button>
        <button
          type="button"
          className="button live-control-btn"
          onClick={refreshAll}
          disabled={isRefreshing}
          aria-label="Refresh now"
          data-testid="manual-refresh-btn"
        >
          {isRefreshing ? 'Refreshing…' : '↻ Refresh'}
        </button>
        {!paused && secondsToRefresh != null && (
          <span className="live-refresh-countdown" aria-live="off">
            Next refresh in {secondsToRefresh}s
          </span>
        )}
        {paused && (
          <span className="live-refresh-countdown live-refresh-paused">
            Auto-refresh paused
          </span>
        )}
      </div>

      {/* ── Range selector ── */}
      <div className="live-range-bar">
        <span className="live-range-label">Show last:</span>
        <div className="live-range-selector" role="group" aria-label="Time range">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`live-range-btn${rangeHours === opt.value ? ' live-range-btn--active' : ''}`}
              onClick={() => setRangeHours(opt.value)}
              aria-pressed={rangeHours === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Two-panel: current conditions + station health ── */}
      <div className="live-panels-grid">
        <CurrentConditionsPanel current={current} isStale={isStale || isOffline} />
        <StationHealthPanel
          status={status}
          ageSeconds={ageSeconds}
          isStale={isStale}
          isOffline={isOffline}
        />
      </div>

      {/* ── Charts ── */}
      {filteredObservations.length === 0 ? (
        <section className="card">
          <p className="live-no-observations">
            No observations in the last {rangeHours} hour{rangeHours > 1 ? 's' : ''}. Try a
            wider range.
          </p>
        </section>
      ) : (
        <div className="live-charts-grid">
          {hasTempSeries && (
            <LiveLineChart
              title="Temperature"
              unit={WEATHER_UNITS.temperature}
              tMin={chartTMin}
              tMax={chartTMax}
              primary={{
                label: 'Temperature',
                color: chartTokens.series.observed,
                points: tempPrimary,
              }}
              secondary={
                feelsLikeSecondary.some((p) => p.value != null)
                  ? {
                      label: 'Feels like',
                      color: chartTokens.series.reference,
                      points: feelsLikeSecondary,
                    }
                  : undefined
              }
            />
          )}

          {hasHumiditySeries && (
            <LiveLineChart
              title="Humidity & Dew point"
              unit="%"
              tMin={chartTMin}
              tMax={chartTMax}
              primary={{
                label: 'Humidity',
                color: chartTokens.series.comparison,
                points: humidityPrimary,
              }}
              secondary={
                dewpointSecondary.some((p) => p.value != null)
                  ? {
                      label: 'Dew point (°C)',
                      color: chartTokens.series.reference,
                      points: dewpointSecondary,
                    }
                  : undefined
              }
            />
          )}

          {hasPressureSeries && (
            <LiveLineChart
              title="Pressure"
              unit={WEATHER_UNITS.pressure}
              tMin={chartTMin}
              tMax={chartTMax}
              primary={{
                label: 'Pressure',
                color: chartTokens.series.observed,
                points: pressurePrimary,
              }}
            />
          )}

          {hasWindSeries && (
            <LiveLineChart
              title="Wind speed & Gust"
              unit={WEATHER_UNITS.wind}
              tMin={chartTMin}
              tMax={chartTMax}
              primary={{
                label: 'Wind speed',
                color: chartTokens.series.observed,
                points: windSpeedPrimary,
              }}
              secondary={
                windGustSecondary.some((p) => p.value != null)
                  ? {
                      label: 'Gust',
                      color: chartTokens.series.provisional,
                      points: windGustSecondary,
                    }
                  : undefined
              }
            />
          )}

          {hasRainSeries && (
            <LiveLineChart
              title={useRainRate ? 'Rain rate' : "Today's rainfall"}
              unit={useRainRate ? `${WEATHER_UNITS.rainfall}/h` : WEATHER_UNITS.rainfall}
              tMin={chartTMin}
              tMax={chartTMax}
              primary={{
                label: useRainRate ? 'Rain rate' : 'Rainfall',
                color: chartTokens.series.comparison,
                points: rainPrimary,
              }}
            />
          )}
        </div>
      )}

      {/* ── Recent observations table ── */}
      <section className="card" aria-labelledby="live-table-title">
        <div className="live-table-header">
          <div className="live-table-title-row">
            <h2 id="live-table-title">Recent observations</h2>
            <span className="live-table-count">
              {filteredObservations.length} reading
              {filteredObservations.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="live-table-controls">
            {/* Measurement selector */}
            <div className="live-measurement-selector" role="group" aria-label="Visible columns">
              {MEASUREMENT_OPTIONS.map((opt) => {
                const supported = isFieldSupportedInWindow(
                  allObservations,
                  opt.key as keyof RecentObservation,
                )
                if (!supported) return null
                const active = visibleMeasurements.has(opt.key)
                return (
                  <button
                    key={opt.key}
                    type="button"
                    className={`live-measure-btn${active ? ' live-measure-btn--active' : ''}`}
                    onClick={() => toggleMeasurement(opt.key)}
                    aria-pressed={active}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>

            <div className="live-table-actions">
              <button
                type="button"
                className="button button-ghost live-control-btn"
                onClick={() =>
                  setSortOrder((o) => (o === 'newest-first' ? 'oldest-first' : 'newest-first'))
                }
                aria-label={`Sort ${sortOrder === 'newest-first' ? 'oldest first' : 'newest first'}`}
              >
                {sortOrder === 'newest-first' ? '↓ Newest first' : '↑ Oldest first'}
              </button>
              <button
                type="button"
                className="button button-ghost live-control-btn"
                onClick={handleCsvExport}
                disabled={filteredObservations.length === 0}
                aria-label="Export observations as CSV"
                data-testid="csv-export-btn"
              >
                ↓ CSV
              </button>
            </div>
          </div>
        </div>

        <RecentObservationsTable
          observations={sortedTableObservations}
          visibleMeasurements={visibleMeasurements}
        />
      </section>
    </div>
  )
}

// ---------- CurrentConditionsPanel ----------
function CurrentConditionsPanel({
  current,
  isStale,
}: {
  readonly current: CurrentConditions | null
  readonly isStale: boolean
}) {
  return (
    <section className="card live-conditions-panel" aria-labelledby="live-current-title">
      <h2 id="live-current-title">Current conditions</h2>
      {isStale && current != null && <Badge variant="warning">Stale</Badge>}

      {current == null ? (
        <p className="live-no-data-note">Current conditions unavailable.</p>
      ) : (
        <dl className="live-conditions-grid">
          <ConditionItem
            label="Temperature"
            value={current.temperatureC}
            unit={WEATHER_UNITS.temperature}
            large
          />
          <ConditionItem
            label="Feels like"
            value={current.feelsLikeC}
            unit={WEATHER_UNITS.temperature}
          />
          <ConditionItem
            label="Dew point"
            value={current.dewpointC}
            unit={WEATHER_UNITS.temperature}
          />
          <ConditionItem label="Humidity" value={current.humidityPercent} unit="%" decimals={0} />
          <ConditionItem
            label="Pressure"
            value={current.pressureHpa}
            unit={WEATHER_UNITS.pressure}
          />
          {current.windSpeedMph != null && (
            <ConditionItem
              label="Wind speed"
              value={current.windSpeedMph}
              unit={WEATHER_UNITS.wind}
            />
          )}
          {current.windGustMph != null && (
            <ConditionItem
              label="Wind gust"
              value={current.windGustMph}
              unit={WEATHER_UNITS.wind}
            />
          )}
          {current.windDirectionDegrees != null && (
            <div className="live-condition-item">
              <dt className="live-condition-label">Wind direction</dt>
              <dd className="live-condition-value">
                {formatWindDirection(current.windDirectionDegrees)}
              </dd>
            </div>
          )}
          {current.rainRateMmPerHour != null && (
            <ConditionItem
              label="Rain rate"
              value={current.rainRateMmPerHour}
              unit={`${WEATHER_UNITS.rainfall}/h`}
            />
          )}
          {current.rainTodayMm != null && (
            <ConditionItem
              label="Today's rainfall"
              value={current.rainTodayMm}
              unit={WEATHER_UNITS.rainfall}
            />
          )}
        </dl>
      )}

      {current != null && (
        <div className="live-obs-time">
          <span>Observed:</span>
          <time dateTime={current.observationTimeUtc ?? ''}>
            {formatLondonDateTime(current.observationTimeUtc ?? null)}
          </time>
          {current.fetchedAtUtc && (
            <>
              <span className="live-obs-sep">·</span>
              <span>Retrieved: {formatLondonDateTime(current.fetchedAtUtc)}</span>
            </>
          )}
        </div>
      )}
    </section>
  )
}

function ConditionItem({
  label,
  value,
  unit,
  large = false,
  decimals = 1,
}: {
  readonly label: string
  readonly value: number | null | undefined
  readonly unit: string
  readonly large?: boolean
  readonly decimals?: number
}) {
  return (
    <div className="live-condition-item">
      <dt className="live-condition-label">{label}</dt>
      <dd className={`live-condition-value${large ? ' live-condition-value--large' : ''}`}>
        {value == null ? '—' : `${value.toFixed(decimals)} ${unit}`}
      </dd>
    </div>
  )
}

// ---------- StationHealthPanel ----------
function StationHealthPanel({
  status,
  ageSeconds,
  isStale,
  isOffline,
}: {
  readonly status: StationStatus | null
  readonly ageSeconds: number | null
  readonly isStale: boolean
  readonly isOffline: boolean
}) {
  return (
    <section className="card live-health-panel" aria-labelledby="live-health-title">
      <h2 id="live-health-title">Station health</h2>

      {status == null ? (
        <p className="live-no-data-note">Station status unavailable.</p>
      ) : (
        <dl className="live-health-grid">
          <div>
            <dt>Status</dt>
            <dd>
              {isOffline ? (
                <Badge variant="error">Offline</Badge>
              ) : status.live ? (
                <Badge variant="success">Live</Badge>
              ) : (
                <Badge variant="warning">Online</Badge>
              )}
            </dd>
          </div>
          {status.message ? (
            <div className="live-health-message">
              <dt>Message</dt>
              <dd>{status.message}</dd>
            </div>
          ) : null}
          <div>
            <dt>Observation time</dt>
            <dd>
              <time dateTime={status.observationTimeUtc ?? ''}>
                {formatLondonDateTime(status.observationTimeUtc ?? null)}
              </time>
            </dd>
          </div>
          <div>
            <dt>Observation age</dt>
            <dd className={isStale ? 'live-health-stale' : ''}>
              {formatObservationAge(ageSeconds)}
              {isStale ? ' ⚠' : ''}
            </dd>
          </div>
          <div>
            <dt>Last checked</dt>
            <dd>
              <time dateTime={status.checkedAtUtc ?? ''}>
                {formatLondonDateTime(status.checkedAtUtc ?? null)}
              </time>
            </dd>
          </div>
          {status.collectorStatus ? (
            <div>
              <dt>Collector</dt>
              <dd>{status.collectorStatus}</dd>
            </div>
          ) : null}
        </dl>
      )}
    </section>
  )
}

// ---------- RecentObservationsTable ----------
function RecentObservationsTable({
  observations,
  visibleMeasurements,
}: {
  readonly observations: readonly RecentObservation[]
  readonly visibleMeasurements: Set<string>
}) {
  if (observations.length === 0) {
    return <p className="live-no-data-note">No observations in this range.</p>
  }

  const showFeelsLike = observations.some((o) => deriveFeelsLikeFromObservation(o) != null)
  const showDewpoint = observations.some((o) => o.dewpointC != null)
  const showGust = observations.some((o) => o.windGustMph != null)
  const showDirection = observations.some((o) => o.windDirectionDegrees != null)
  const showRainToday = observations.some((o) => o.rainTodayMm != null)

  const showTemp = visibleMeasurements.has('temperatureC')
  const showHumidity = visibleMeasurements.has('humidityPercent')
  const showPressure = visibleMeasurements.has('pressureHpa')
  const showWind = visibleMeasurements.has('windSpeedMph')
  const showRain = visibleMeasurements.has('rainRateMmPerHour')

  return (
    <div className="table-wrapper live-obs-table-wrapper">
      <table className="live-obs-table">
        <thead>
          <tr>
            <th scope="col">Time</th>
            {showTemp && <th scope="col">Temp (°C)</th>}
            {showTemp && showFeelsLike && <th scope="col">Feels like</th>}
            {showHumidity && <th scope="col">Humidity (%)</th>}
            {showHumidity && showDewpoint && <th scope="col">Dew pt (°C)</th>}
            {showPressure && <th scope="col">Pressure (hPa)</th>}
            {showWind && <th scope="col">Wind (mph)</th>}
            {showWind && showGust && <th scope="col">Gust (mph)</th>}
            {showWind && showDirection && <th scope="col">Dir</th>}
            {showRain && <th scope="col">Rain rate (mm/h)</th>}
            {showRain && showRainToday && <th scope="col">Today (mm)</th>}
          </tr>
        </thead>
        <tbody>
          {observations.map((obs) => {
            const feelsLike = deriveFeelsLikeFromObservation(obs)
            return (
              <tr key={obs.observationTimeUtc}>
                <td>
                  <time dateTime={obs.observationTimeUtc}>
                    {formatLondonTime(obs.observationTimeUtc)}
                  </time>
                </td>
                {showTemp && <td>{fmt1(obs.temperatureC)}</td>}
                {showTemp && showFeelsLike && <td>{fmt1(feelsLike)}</td>}
                {showHumidity && <td>{fmt0(obs.humidityPercent)}</td>}
                {showHumidity && showDewpoint && <td>{fmt1(obs.dewpointC)}</td>}
                {showPressure && <td>{fmt1(obs.pressureHpa)}</td>}
                {showWind && <td>{fmt1(obs.windSpeedMph)}</td>}
                {showWind && showGust && <td>{fmt1(obs.windGustMph)}</td>}
                {showWind && showDirection && (
                  <td>
                    {obs.windDirectionDegrees != null
                      ? formatWindDirection(obs.windDirectionDegrees)
                      : '—'}
                  </td>
                )}
                {showRain && <td>{fmt2(obs.rainRateMmPerHour)}</td>}
                {showRain && showRainToday && <td>{fmt1(obs.rainTodayMm)}</td>}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------- formatting helpers ----------
function fmt1(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(1)
}
function fmt0(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(0)
}
function fmt2(v: number | null | undefined): string {
  return v == null ? '—' : v.toFixed(2)
}

function formatWindDirection(degrees: number): string {
  const dirs = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
  ]
  const idx = Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16
  return `${dirs[idx]} (${Math.round(degrees)}°)`
}
