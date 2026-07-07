import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { MetricCard } from '../components/MetricCard';
import { PanelCard } from '../components/PanelCard';

// ── Types ─────────────────────────────────────────────────────────────────────

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

type ChartRow = {
  summary_date: string;
  max_temp: number | null;
  min_temp: number | null;
  mean_temp: number | null;
  rainfall_total: number | null;
  max_adjusted_gust: number | null;
  max_wind_speed: number | null;
  mean_pressure: number | null;
  max_pressure: number | null;
  min_pressure: number | null;
  mean_humidity: number | null;
  lightning_count: number;
  thunder_day: number;
};

type ChartsPayload = {
  rows: ChartRow[];
};

type StatusPayload = {
  backend?: { status?: string };
  database?: { status?: string; observationCount?: number };
  weatherApi?: { status?: string; stationId?: string | null; lastFetch?: string | null };
  station?: {
    id?: string;
    name?: string;
    status?: string;
    lastSuccessfulFetch?: string | null;
    latestObservationTime?: string | null;
    recordCount?: number;
    apiConfigured?: boolean;
  };
};

// ── Constants ─────────────────────────────────────────────────────────────────

const REFRESH_MS = 60_000;
const CHART_DAYS = 30;
const CHART_MUTED = 'var(--muted)';
const PRESSURE_DOMAIN_PADDING = 4;

const temperatureScale = [
  { label: '< -10°C', color: '#7c3aed' },
  { label: '-10 to 0°C', color: '#2563eb' },
  { label: '0 to 10°C', color: '#22d3ee' },
  { label: '10 to 17°C', color: '#22c55e' },
  { label: '17 to 23°C', color: '#facc15' },
  { label: '23 to 30°C', color: '#fb923c' },
  { label: '30 to 35°C', color: '#ef4444' },
  { label: '35°C+', color: '#7f1d1d' }
];

const rainfallScale = ['#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8'];
const windScale = ['#dcfce7', '#86efac', '#22c55e', '#15803d'];
const lightningScale = ['#fef3c7', '#fb923c', '#a855f7'];

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (v: number | null | undefined, suffix = '') =>
  typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)}${suffix}` : '—';

const fmtInt = (v: number | null | undefined, suffix = '') =>
  typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v)}${suffix}` : '—';

const getRainColor = (rainfall: number) => {
  if (rainfall <= 1) return rainfallScale[0];
  if (rainfall <= 4) return rainfallScale[1];
  if (rainfall <= 9) return rainfallScale[2];
  return rainfallScale[3];
};

const shortDate = (iso: string) => iso.slice(5); // "MM-DD"

const monthLabel = (year: number | null | undefined, month: number | null | undefined) =>
  year && month
    ? new Date(year, month - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' })
    : '—';

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export const DashboardPage = () => {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [charts, setCharts] = useState<ChartsPayload | null>(null);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [chartDays, setChartDays] = useState(CHART_DAYS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [ov, ch, st] = await Promise.all([
        apiFetch<OverviewPayload>('/api/dashboard/overview'),
        apiFetch<ChartsPayload>(`/api/dashboard/charts?days=${chartDays}`),
        apiFetch<StatusPayload>('/api/status')
      ]);
      setOverview(ov);
      setCharts(ch);
      setStatus(st);
      setError(null);
      setLastUpdated(new Date().toLocaleTimeString('en-GB'));
    } catch (err) {
      console.error('Dashboard load error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [chartDays]);

  useEffect(() => {
    void loadData();
    const timer = window.setInterval(() => void loadData(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadData]);

  const live = overview?.live;

  const recentRainTotal = useMemo(
    () =>
      (overview?.sevenDayRain ?? []).reduce(
        (sum, r) => sum + (typeof r.rainfall_total === 'number' ? r.rainfall_total : 0),
        0
      ),
    [overview?.sevenDayRain]
  );

  const rows = charts?.rows ?? [];

  const pressureValues = rows
    .map((r) => r.mean_pressure)
    .filter((v): v is number => typeof v === 'number');
  const pressureDomain: [number, number] =
    pressureValues.length > 0
      ? [Math.min(...pressureValues) - PRESSURE_DOMAIN_PADDING, Math.max(...pressureValues) + PRESSURE_DOMAIN_PADDING]
      : [990, 1030];

  const chartData = rows.map((r) => ({
    day: shortDate(r.summary_date),
    max: r.max_temp,
    mean: r.mean_temp,
    min: r.min_temp,
    rain: r.rainfall_total,
    gust: r.max_adjusted_gust,
    pressure: r.mean_pressure,
    lightning: r.lightning_count
  }));

  const stationStatus = status?.station;
  const stationOnline = stationStatus?.status === 'Online';

  return (
    <div className="page-grid">
      {/* ── Metric Cards ── */}
      <section className="metrics-grid">
        <MetricCard
          label="Current Temperature"
          value={fmt(live?.temperature, '°C')}
          trend={live?.feels_like != null ? `Feels like ${live.feels_like.toFixed(1)}°C` : undefined}
          detail={live?.humidity != null ? `Humidity ${live.humidity.toFixed(0)}%` : undefined}
          tone="temperature"
          icon="°"
        />
        <MetricCard
          label="Rainfall"
          value={fmt(live?.rainfall, ' mm')}
          trend={recentRainTotal > 0 ? `7-day total ${recentRainTotal.toFixed(1)} mm` : 'No recent rain'}
          tone="rain"
          icon="◍"
        />
        <MetricCard
          label="Wind"
          value={live?.wind_speed != null ? `${live.wind_speed.toFixed(1)} m/s` : '—'}
          trend={live?.wind_gust != null ? `Gust ${live.wind_gust.toFixed(1)} m/s` : undefined}
          detail={live?.wind_direction != null ? `Direction ${Math.round(live.wind_direction)}°` : undefined}
          tone="wind"
          icon="↗"
        />
        <MetricCard
          label="Pressure"
          value={fmt(live?.pressure, ' hPa')}
          tone="pressure"
          icon="◎"
        />
        <MetricCard
          label="Solar / UV"
          value={live?.solar_radiation != null ? `${Math.round(live.solar_radiation)} W/m²` : '—'}
          trend={live?.uv_index != null ? `UV index ${live.uv_index.toFixed(1)}` : undefined}
          tone="lightning"
          icon="☀"
        />
      </section>

      {/* ── Overview + Status ── */}
      <section className="dashboard-feature-grid">
        <PanelCard
          title="Dashboard overview"
          subtitle="Current conditions, operational health, and quick climate context"
          action={<span className="panel-badge">{lastUpdated ? `Updated ${lastUpdated}` : 'Loading…'}</span>}
          className="dashboard-overview-card"
        >
          {error && <p style={{ color: '#ef4444', marginBottom: '1rem' }}>{error}</p>}
          <div className="dashboard-overview">
            <div className="overview-copy">
              {loading ? (
                <h3>Loading live data…</h3>
              ) : live?.timestamp_local ? (
                <h3>
                  Wakefield station — latest observation at {live.timestamp_local}.
                </h3>
              ) : (
                <h3>No observations yet. Start the backend and configure the API key.</h3>
              )}
              <p>
                Temperature {fmt(live?.temperature, '°C')}, feels like {fmt(live?.feels_like, '°C')}.
                Rainfall {fmt(live?.rainfall, ' mm')}, pressure {fmt(live?.pressure, ' hPa')}.
              </p>
              <div className="overview-tags">
                <span>{stationStatus?.recordCount != null ? `${stationStatus.recordCount.toLocaleString()} observations stored` : 'No records yet'}</span>
                {overview?.monthly && <span>Monthly summary available</span>}
                {stationStatus?.apiConfigured && <span>API configured</span>}
              </div>
            </div>

            <ul className="status-list status-list--stacked">
              <li>
                <span>Station ID</span>
                <strong>{stationStatus?.id ?? '—'}</strong>
              </li>
              <li>
                <span>Station status</span>
                <strong className={stationOnline ? 'ok' : undefined}>
                  {stationStatus?.status ?? '—'}
                </strong>
              </li>
              <li>
                <span>Last observation</span>
                <strong>{stationStatus?.latestObservationTime ?? '—'}</strong>
              </li>
              <li>
                <span>Monthly period</span>
                <strong>{monthLabel(overview?.monthly?.summary_year, overview?.monthly?.summary_month)}</strong>
              </li>
            </ul>
          </div>
        </PanelCard>

        <PanelCard title="Meteorological colour scales" subtitle="Applied across cards, charts, anomalies, and archive states">
          <div className="scale-grid">
            <div className="scale-block">
              <div className="scale-block__header">
                <strong>Temperature</strong>
                <span>Purple → dark red</span>
              </div>
              <div className="scale-strip">
                {temperatureScale.map((stop) => (
                  <span key={stop.label} style={{ backgroundColor: stop.color }} title={stop.label} />
                ))}
              </div>
              <div className="scale-labels scale-labels--dense">
                {temperatureScale.map((stop) => (
                  <small key={stop.label}>{stop.label}</small>
                ))}
              </div>
            </div>

            <div className="mini-scales">
              <div className="mini-scale-card">
                <div className="mini-scale-card__title">
                  <strong>Rain</strong>
                  <span>Light blue → dark blue</span>
                </div>
                <div className="scale-strip scale-strip--compact">
                  {rainfallScale.map((color) => (
                    <span key={color} style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>

              <div className="mini-scale-card">
                <div className="mini-scale-card__title">
                  <strong>Pressure</strong>
                  <span>Low purple/blue → high dark red</span>
                </div>
                <div className="scale-strip scale-strip--compact">
                  <span style={{ backgroundColor: '#5b21b6' }} />
                  <span style={{ backgroundColor: '#1d4ed8' }} />
                  <span style={{ backgroundColor: '#b91c1c' }} />
                </div>
              </div>

              <div className="mini-scale-card">
                <div className="mini-scale-card__title">
                  <strong>Wind</strong>
                  <span>Fresh green scale</span>
                </div>
                <div className="scale-strip scale-strip--compact">
                  {windScale.map((color) => (
                    <span key={color} style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>

              <div className="mini-scale-card">
                <div className="mini-scale-card__title">
                  <strong>Lightning</strong>
                  <span>Yellow → orange → purple</span>
                </div>
                <div className="scale-strip scale-strip--compact">
                  {lightningScale.map((color) => (
                    <span key={color} style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </PanelCard>
      </section>

      {/* ── Charts ── */}
      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <span className="section-heading__eyebrow">Dashboard</span>
            <h3>Recent graphs</h3>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {([7, 14, 30, 90] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={`toolbar-chip${chartDays === d ? '' : ' toolbar-chip--muted'}`}
                onClick={() => setChartDays(d)}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {chartData.length === 0 ? (
          <PanelCard title="No data yet" subtitle="Charts will populate as observations are stored">
            <p className="panel-body-text">
              Start the backend server and ensure the weather API key is configured to begin
              collecting data. Daily summaries are processed at 18:05 UTC.
            </p>
          </PanelCard>
        ) : (
          <div className="dashboard-chart-grid">
            <PanelCard title="Temperature profile" subtitle="Max, mean, and minimum daily progression">
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="tempMeanGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#facc15" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#facc15" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="#dbe6fb" />
                    <XAxis dataKey="day" stroke="#6b7a99" />
                    <YAxis stroke="#6b7a99" unit="°C" />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="mean" name="Mean" stroke="#f59e0b" fill="url(#tempMeanGradient)" strokeWidth={3} connectNulls />
                    <Line type="monotone" dataKey="max" name="Max" stroke="#ef4444" strokeWidth={2.5} dot={false} connectNulls />
                    <Line type="monotone" dataKey="min" name="Min" stroke="#2563eb" strokeWidth={2.5} dot={false} connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>

            <PanelCard title="Rainfall distribution" subtitle="Daily totals with meteorological blue intensity scale">
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="4 4" stroke="#dbe6fb" />
                    <XAxis dataKey="day" stroke="#6b7a99" />
                    <YAxis stroke="#6b7a99" unit=" mm" />
                    <Tooltip />
                    <Bar dataKey="rain" name="Rainfall (mm)" radius={[10, 10, 0, 0]}>
                      {chartData.map((entry) => (
                        <Cell key={entry.day} fill={getRainColor(entry.rain ?? 0)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>

            <PanelCard title="Wind, pressure, and lightning" subtitle="Daily gust strength, pressure, and convective activity">
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="4 4" stroke="#dbe6fb" />
                    <XAxis dataKey="day" stroke={CHART_MUTED} />
                    <YAxis yAxisId="gust" stroke={CHART_MUTED} unit=" m/s" />
                    <YAxis yAxisId="pressure" orientation="right" stroke={CHART_MUTED} unit=" hPa" domain={pressureDomain} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="gust" dataKey="gust" name="Gust (m/s)" fill="#22c55e" radius={[8, 8, 0, 0]} />
                    <Line yAxisId="pressure" type="monotone" dataKey="pressure" name="Pressure (hPa)" stroke="#b91c1c" strokeWidth={3} dot={false} connectNulls />
                    <Line yAxisId="gust" type="monotone" dataKey="lightning" name="Lightning" stroke="#a855f7" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b' }} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>
          </div>
        )}
      </section>

      {/* ── Monthly Summary ── */}
      {overview?.monthly && (
        <section className="dashboard-section">
          <div className="section-heading">
            <div>
              <span className="section-heading__eyebrow">Summary</span>
              <h3>Monthly overview</h3>
            </div>
            <span className="toolbar-chip toolbar-chip--muted">
              {monthLabel(overview.monthly.summary_year, overview.monthly.summary_month)}
            </span>
          </div>

          <PanelCard title="Monthly overview" subtitle="Summary for the latest processed climatological month">
            <div className="summary-grid">
              <article className="summary-stat summary-stat--temperature">
                <span>Mean Temperature</span>
                <strong>{fmt(overview.monthly.mean_temp, '°C')}</strong>
              </article>
              <article className="summary-stat summary-stat--rain">
                <span>Total Rainfall</span>
                <strong>{fmt(overview.monthly.total_rainfall, ' mm')}</strong>
              </article>
              <article className="summary-stat summary-stat--pressure">
                <span>7-day Rain Total</span>
                <strong>{fmtInt(recentRainTotal, ' mm')}</strong>
              </article>
              <article className="summary-stat summary-stat--temperature">
                <span>Records in DB</span>
                <strong>{stationStatus?.recordCount?.toLocaleString() ?? '—'}</strong>
              </article>
            </div>
          </PanelCard>
        </section>
      )}
    </div>
  );
};

