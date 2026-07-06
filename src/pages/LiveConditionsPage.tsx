import { useCallback, useEffect, useMemo, useState } from 'react';
import { MetricCard } from '../components/MetricCard';
import { PanelCard } from '../components/PanelCard';

type LiveObservation = {
  temperature?: number | null;
  humidity?: number | null;
  pressure?: number | null;
  wind_gust?: number | null;
  rainfall?: number | null;
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

const REFRESH_INTERVAL_MS = 60_000;

const formatNumber = (value: number | null | undefined, suffix: string) =>
  typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}${suffix}` : '—';

export const LiveConditionsPage = () => {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [statusMessage, setStatusMessage] = useState('Loading live data…');
  const [statusIsError, setStatusIsError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const refreshLiveData = useCallback(async () => {
    try {
      const overviewResponse = await fetch('/api/dashboard/overview');
      if (!overviewResponse.ok) {
        throw new Error(`Overview request failed (${overviewResponse.status})`);
      }
      const overviewPayload = (await overviewResponse.json()) as OverviewPayload;
      setOverview(overviewPayload);
      setOverview(overviewPayload);
      setStatusMessage('Live observations are updating every 60 seconds.');
      setStatusIsError(false);
      setLastUpdated(new Date().toLocaleTimeString('en-GB'));
    } catch (error) {
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
  const recentRainTotal = useMemo(
    () =>
      (overview?.sevenDayRain ?? []).reduce((sum, row) => sum + (typeof row.rainfall_total === 'number' ? row.rainfall_total : 0), 0),
    [overview?.sevenDayRain]
  );

  return (
    <div className="page-grid live-page-grid">
      <section className="metrics-grid">
        <MetricCard
          label="Current Temperature"
          value={formatNumber(live?.temperature, '°C')}
          trend={live?.timestamp_local ? `Observed ${live.timestamp_local}` : undefined}
          tone="temperature"
          icon="°"
        />
        <MetricCard label="Humidity" value={formatNumber(live?.humidity, '%')} tone="pressure" icon="◌" />
        <MetricCard label="Pressure" value={formatNumber(live?.pressure, ' hPa')} tone="pressure" icon="◎" />
        <MetricCard label="Wind Gust" value={formatNumber(live?.wind_gust, ' mph')} tone="wind" icon="↗" />
        <MetricCard label="Rainfall" value={formatNumber(live?.rainfall, ' mm')} tone="rain" icon="◍" />
      </section>

      <section className="dashboard-feature-grid live-info-grid">
        <PanelCard
          title="Live feed status"
          subtitle="Server-side Weather API ingestion runs every 60 seconds."
          action={<span className="panel-badge">Last refresh {lastUpdated ?? '—'}</span>}
        >
          <ul className="status-list status-list--stacked live-status-list">
            <li>
              <span>Refresh interval</span>
              <strong>60 seconds</strong>
            </li>
            <li>
              <span>Status</span>
              <strong className={statusIsError ? undefined : 'ok'}>{statusMessage}</strong>
            </li>
            <li>
              <span>Current observation time</span>
              <strong>{live?.timestamp_local ?? '—'}</strong>
            </li>
            <li>
              <span>Data source</span>
              <strong>Weather Underground API</strong>
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
          </div>
        </PanelCard>
      </section>
    </div>
  );
};
