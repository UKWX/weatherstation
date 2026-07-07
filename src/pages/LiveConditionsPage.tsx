import { useCallback, useEffect, useMemo, useState } from 'react';
import { MetricCard } from '../components/MetricCard';
import { PanelCard } from '../components/PanelCard';

type LiveObservation = {
  temperature?: number | null;
  feels_like?: number | null;
  humidity?: number | null;
  pressure?: number | null;
  wind_speed?: number | null;
  wind_gust?: number | null;
  wind_direction?: number | null;
  rainfall?: number | null;
  solar_radiation?: number | null;
  uv_index?: number | null;
  timestamp_local?: string | null;
};

type OverviewPayload = {
  live?: LiveObservation | null;
  sevenDayRain?: Array<{ summary_date: string; rainfall_total: number | null }>;
  monthly?: {
    summary_year?: number | null;
    summary_month?: number | null;
    mean_temp?: number | null;
    total_rainfall?: number | null;
  } | null;
};

type StatusPayload = {
  station?: {
    id?: string;
    status?: string;
    lastSuccessfulFetch?: string | null;
    latestObservationTime?: string | null;
    recordCount?: number;
    apiConfigured?: boolean;
  };
};

const REFRESH_INTERVAL_MS = 60_000;
const REFRESH_INTERVAL_LABEL = `${Math.floor(REFRESH_INTERVAL_MS / 1000)} seconds`;

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
};

const formatNumber = (value: number | null | undefined, suffix: string) =>
{
  const numeric = toFiniteNumber(value);
  return numeric !== null ? `${numeric.toFixed(1)}${suffix}` : '—';
};

const formatTrend = (value: unknown, suffix: string) => {
  const numeric = toFiniteNumber(value);
  return numeric !== null ? `${numeric.toFixed(1)}${suffix}` : undefined;
};

export const LiveConditionsPage = () => {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [stationStatus, setStationStatus] = useState<StatusPayload | null>(null);
  const [statusMessage, setStatusMessage] = useState('Loading live data…');
  const [statusIsError, setStatusIsError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const refreshLiveData = useCallback(async () => {
    try {
      const [overviewResponse, statusResponse] = await Promise.all([
        fetch('/api/dashboard/overview'),
        fetch('/api/status')
      ]);

      if (!overviewResponse.ok) {
        throw new Error(`Overview request failed (${overviewResponse.status})`);
      }
      const overviewPayload = (await overviewResponse.json()) as OverviewPayload;
      setOverview(overviewPayload);

      if (statusResponse.ok) {
        const statusPayload = (await statusResponse.json()) as StatusPayload;
        setStationStatus(statusPayload);
      }

      setStatusMessage(`Live observations are updating every ${REFRESH_INTERVAL_LABEL}.`);
      setStatusIsError(false);
      setLastUpdated(new Date().toLocaleTimeString('en-GB'));
    } catch (error) {
      console.error('Live data refresh error:', error);
      setStatusMessage(error instanceof Error ? error.message : 'Unable to refresh live data.');
      setStatusIsError(true);
    }
  }, []);

  useEffect(() => {
    void refreshLiveData();
    const timer = window.setInterval(() => {
      void refreshLiveData();
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [refreshLiveData]);

  const live = overview?.live;
  const station = stationStatus?.station;
  const stationOnline = station?.status === 'Online';
  const feelsLikeTrend = formatTrend(live?.feels_like, '°C');
  const windGustTrend = formatTrend(live?.wind_gust, ' m/s');

  const recentRainTotal = useMemo(
    () =>
      (overview?.sevenDayRain ?? []).reduce((sum, row) => sum + (toFiniteNumber(row.rainfall_total) ?? 0), 0),
    [overview?.sevenDayRain]
  );

  return (
    <div className="page-grid live-page-grid">
      <section className="metrics-grid">
        <MetricCard
          label="Current Temperature"
          value={formatNumber(live?.temperature, '°C')}
          trend={feelsLikeTrend ? `Feels like ${feelsLikeTrend}` : undefined}
          detail={live?.timestamp_local ? `Observed ${live.timestamp_local}` : undefined}
          tone="temperature"
          icon="°"
        />
        <MetricCard label="Humidity" value={formatNumber(live?.humidity, '%')} tone="pressure" icon="◌" />
        <MetricCard label="Pressure" value={formatNumber(live?.pressure, ' hPa')} tone="pressure" icon="◎" />
        <MetricCard
          label="Wind"
          value={formatNumber(live?.wind_speed, ' m/s')}
          trend={windGustTrend ? `Gust ${windGustTrend}` : undefined}
          tone="wind"
          icon="↗"
        />
        <MetricCard label="Rainfall" value={formatNumber(live?.rainfall, ' mm')} tone="rain" icon="◍" />
      </section>

      <section className="dashboard-feature-grid live-info-grid">
        {/* API Status */}
        <PanelCard
          title="Weather Station Status"
          subtitle="Live API ingestion status and configuration"
          action={<span className="panel-badge">Last refresh {lastUpdated ?? '—'}</span>}
        >
          <ul className="status-list status-list--stacked live-status-list">
            <li>
              <span>Station ID</span>
              <strong>{station?.id ?? '—'}</strong>
            </li>
            <li>
              <span>Status</span>
              <strong className={stationOnline ? 'ok' : statusIsError ? undefined : undefined}>
                {station?.status ?? (statusIsError ? 'Error' : 'Unknown')}
              </strong>
            </li>
            <li>
              <span>Last successful fetch</span>
              <strong>{station?.lastSuccessfulFetch
                ? new Date(station.lastSuccessfulFetch).toLocaleString('en-GB')
                : '—'}</strong>
            </li>
            <li>
              <span>Latest observation time</span>
              <strong>{station?.latestObservationTime ?? live?.timestamp_local ?? '—'}</strong>
            </li>
            <li>
              <span>Total records</span>
              <strong>{station?.recordCount?.toLocaleString() ?? '—'}</strong>
            </li>
            <li>
              <span>API configured</span>
              <strong className={station?.apiConfigured ? 'ok' : undefined}>
                {station?.apiConfigured ? 'Yes' : 'No — set WEATHER_API_KEY'}
              </strong>
            </li>
            <li>
              <span>Refresh interval</span>
              <strong>{REFRESH_INTERVAL_LABEL}</strong>
            </li>
            <li>
              <span>Live feed</span>
              <strong className={statusIsError ? undefined : 'ok'}>{statusMessage}</strong>
            </li>
          </ul>
        </PanelCard>

        <PanelCard title="Quick live summary" subtitle="Latest monthly and weekly context from stored station data">
          <div className="summary-grid live-summary-grid">
            <article className="summary-stat summary-stat--rain">
              <span>Rainfall (7 days)</span>
              <strong>{formatNumber(recentRainTotal, ' mm')}</strong>
            </article>
            <article className="summary-stat summary-stat--temperature">
              <span>Monthly Mean Temp</span>
              <strong>{formatNumber(overview?.monthly?.mean_temp, '°C')}</strong>
            </article>
            <article className="summary-stat summary-stat--rain">
              <span>Monthly Rainfall</span>
              <strong>{formatNumber(overview?.monthly?.total_rainfall, ' mm')}</strong>
            </article>
            <article className="summary-stat summary-stat--pressure">
              <span>Monthly Period</span>
              <strong>
                {overview?.monthly?.summary_year && overview.monthly.summary_month
                  ? `${overview.monthly.summary_year}-${String(overview.monthly.summary_month).padStart(2, '0')}`
                  : '—'}
              </strong>
            </article>
            {live?.solar_radiation != null && (
              <article className="summary-stat summary-stat--temperature">
                <span>Solar Radiation</span>
                <strong>{Math.round(live.solar_radiation)} W/m²</strong>
              </article>
            )}
            {live?.uv_index != null && (
              <article className="summary-stat summary-stat--wind">
                <span>UV Index</span>
                <strong>{formatNumber(live.uv_index, '')}</strong>
              </article>
            )}
          </div>
        </PanelCard>
      </section>
    </div>
  );
};
