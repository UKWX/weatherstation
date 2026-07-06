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

const temperatureSeries = [
  { day: 'Mon', max: 15.1, mean: 10.4, min: 6.3, normal: 11.6 },
  { day: 'Tue', max: 16.8, mean: 11.3, min: 7.1, normal: 11.7 },
  { day: 'Wed', max: 18.4, mean: 12.9, min: 8.4, normal: 11.8 },
  { day: 'Thu', max: 20.6, mean: 14.8, min: 10.2, normal: 12.1 },
  { day: 'Fri', max: 19.5, mean: 13.6, min: 9.6, normal: 12.2 },
  { day: 'Sat', max: 17.3, mean: 11.8, min: 7.7, normal: 12.3 },
  { day: 'Sun', max: 16.1, mean: 10.9, min: 6.8, normal: 12.4 }
];

const rainfallSeries = [
  { day: 'Mon', rain: 0.4 },
  { day: 'Tue', rain: 2.1 },
  { day: 'Wed', rain: 4.8 },
  { day: 'Thu', rain: 12.6 },
  { day: 'Fri', rain: 1.2 },
  { day: 'Sat', rain: 0 },
  { day: 'Sun', rain: 3.6 }
];

const signalSeries = [
  { hour: '00', gust: 13, pressure: 1004, lightning: 0 },
  { hour: '04', gust: 17, pressure: 1007, lightning: 0 },
  { hour: '08', gust: 21, pressure: 1010, lightning: 1 },
  { hour: '12', gust: 28, pressure: 1014, lightning: 2 },
  { hour: '16', gust: 32, pressure: 1017, lightning: 4 },
  { hour: '20', gust: 23, pressure: 1019, lightning: 1 },
  { hour: '24', gust: 18, pressure: 1016, lightning: 0 }
];

const monthlyOverview = [
  { label: 'Mean Temperature', value: '11.8°C', context: '-0.4°C vs normal', tone: 'temperature' as const },
  { label: 'Total Rainfall', value: '42.6 mm', context: '108% of average', tone: 'rain' as const },
  { label: 'Peak Gust', value: '34.7 mph', context: 'Strongest on 17 May', tone: 'wind' as const },
  { label: 'Mean Pressure', value: '1016.8 hPa', context: 'Mostly settled', tone: 'pressure' as const }
];

const recordHighlights = [
  { label: 'Highest Maximum', value: '32.4°C', detail: '15 Jul 2006', tone: 'temperature' as const },
  { label: 'Lowest Minimum', value: '-15.7°C', detail: '12 Jan 2010', tone: 'pressure' as const },
  { label: 'Wettest Day', value: '51.6 mm', detail: '09 Jun 2012', tone: 'rain' as const },
  { label: 'Highest Gust', value: '73.1 mph', detail: '28 Feb 2022', tone: 'wind' as const }
];

const anomalyItems = [
  { title: 'Temperature anomaly', value: '-0.4°C', detail: 'Cooler than the 1991–2020 mean', tone: 'temperature' as const },
  { title: 'Rainfall anomaly', value: '+8%', detail: 'Wettest spell concentrated mid-month', tone: 'rain' as const },
  { title: 'Pressure anomaly', value: '+2.7 hPa', detail: 'Higher frequency of settled synoptic patterns', tone: 'pressure' as const },
  { title: 'Convective signal', value: '3 strikes', detail: 'One thunder day logged this week', tone: 'lightning' as const }
];

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
const pressureValues = signalSeries.map(({ pressure }) => pressure);
const pressureDomain: [number, number] = [
  Math.min(...pressureValues) - 4,
  Math.max(...pressureValues) + 4
];

function getRainColor(rainfall: number) {
  if (rainfall <= 1) return rainfallScale[0];
  if (rainfall <= 4) return rainfallScale[1];
  if (rainfall <= 9) return rainfallScale[2];
  return rainfallScale[3];
}

export const DashboardPage = () => (
  <div className="page-grid">
    <section className="metrics-grid">
      <MetricCard
        label="Current Temperature"
        value="14.7°C"
        trend="Feels like 14.2°C"
        detail="Dew point 9.8°C"
        tone="temperature"
        icon="°"
      />
      <MetricCard
        label="Rainfall"
        value="10.6 mm"
        trend="Rate 0.0 mm/hr"
        detail="Rain day: yes"
        tone="rain"
        icon="◍"
      />
      <MetricCard
        label="Wind"
        value="19.6 mph"
        trend="Gust 31.2 mph WNW"
        detail="Site-adjusted 43.7 mph"
        tone="wind"
        icon="↗"
      />
      <MetricCard
        label="Pressure"
        value="1018.6 hPa"
        trend="Steady"
        detail="24h range 1004–1019"
        tone="pressure"
        icon="◎"
      />
      <MetricCard
        label="Lightning"
        value="3"
        trend="Thunder day: yes"
        detail="Closest strike 5.8 km"
        tone="lightning"
        icon="⚡"
      />
    </section>

    <section className="dashboard-feature-grid">
      <PanelCard
        title="Dashboard overview"
        subtitle="Current conditions, operational health, and quick climate context"
        action={<span className="panel-badge">Updated 16:32 BST</span>}
        className="dashboard-overview-card"
      >
        <div className="dashboard-overview">
          <div className="overview-copy">
            <h3>Wakefield station is running normally with a cooler, showery pattern today.</h3>
            <p>
              Morning rain cleared into brighter intervals, pressure is recovering, and gusty west-northwesterly
              winds continue to moderate through the evening.
            </p>
            <div className="overview-tags">
              <span>Live archive online</span>
              <span>Monthly summary available</span>
              <span>Records and anomalies refreshed</span>
            </div>
          </div>

          <ul className="status-list status-list--stacked">
            <li><span>Sensor suite</span><strong className="ok">Operational</strong></li>
            <li><span>Data logging</span><strong className="ok">Online</strong></li>
            <li><span>Lightning feed</span><strong className="ok">Connected</strong></li>
            <li><span>Sunrise / Sunset</span><strong>05:11 / 21:07</strong></li>
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

    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <span className="section-heading__eyebrow">Dashboard</span>
          <h3>Recent graphs</h3>
        </div>
        <span className="toolbar-chip toolbar-chip--muted">Last 7 days</span>
      </div>

      <div className="dashboard-chart-grid">
        <PanelCard title="Temperature profile" subtitle="Max, mean, minimum, and normal daily progression">
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={temperatureSeries}>
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
                <Area type="monotone" dataKey="mean" stroke="#f59e0b" fill="url(#tempMeanGradient)" strokeWidth={3} />
                <Line type="monotone" dataKey="max" stroke="#ef4444" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="min" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="normal" stroke="#7c3aed" strokeWidth={2} strokeDasharray="6 4" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </PanelCard>

        <PanelCard title="Rainfall distribution" subtitle="Daily totals with meteorological blue intensity scale">
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={rainfallSeries}>
                <CartesianGrid strokeDasharray="4 4" stroke="#dbe6fb" />
                <XAxis dataKey="day" stroke="#6b7a99" />
                <YAxis stroke="#6b7a99" unit=" mm" />
                <Tooltip />
                <Bar dataKey="rain" radius={[10, 10, 0, 0]}>
                  {rainfallSeries.map((entry) => (
                    <Cell key={entry.day} fill={getRainColor(entry.rain)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PanelCard>

        <PanelCard title="Wind, pressure, and lightning" subtitle="Hourly signal showing gust strength, pressure recovery, and convective activity">
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={signalSeries}>
                <CartesianGrid strokeDasharray="4 4" stroke="#dbe6fb" />
                <XAxis dataKey="hour" stroke="#6b7a99" />
                <YAxis yAxisId="gust" stroke="#6b7a99" unit=" mph" />
                <YAxis yAxisId="pressure" orientation="right" stroke="#6b7a99" unit=" hPa" domain={pressureDomain} />
                <Tooltip />
                <Legend />
                <Bar yAxisId="gust" dataKey="gust" fill="#22c55e" radius={[8, 8, 0, 0]} />
                <Line yAxisId="pressure" type="monotone" dataKey="pressure" stroke="#b91c1c" strokeWidth={3} dot={false} />
                <Line yAxisId="gust" type="monotone" dataKey="lightning" stroke="#a855f7" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </PanelCard>
      </div>
    </section>

    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <span className="section-heading__eyebrow">Summary</span>
          <h3>Monthly overview</h3>
        </div>
        <span className="toolbar-chip toolbar-chip--muted">May 2026</span>
      </div>

      <PanelCard title="Monthly overview" subtitle="Professional summary cards for the active climatological month">
        <div className="summary-grid">
          {monthlyOverview.map((item) => (
            <article key={item.label} className={`summary-stat summary-stat--${item.tone}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <small>{item.context}</small>
            </article>
          ))}
        </div>
      </PanelCard>
    </section>

    <section className="dashboard-detail-grid">
      <div className="dashboard-section">
        <div className="section-heading">
          <div>
            <span className="section-heading__eyebrow">Archive highlights</span>
            <h3>Records</h3>
          </div>
          <span className="toolbar-chip toolbar-chip--muted">All-time station extremes</span>
        </div>

        <PanelCard title="Records" subtitle="Current all-time record markers with contextual dates">
          <div className="record-grid">
            {recordHighlights.map((record) => (
              <article key={record.label} className={`record-card record-card--${record.tone}`}>
                <span>{record.label}</span>
                <strong>{record.value}</strong>
                <small>{record.detail}</small>
              </article>
            ))}
          </div>
        </PanelCard>
      </div>

      <div className="dashboard-section">
        <div className="section-heading">
          <div>
            <span className="section-heading__eyebrow">Quality control</span>
            <h3>Anomalies</h3>
          </div>
          <span className="toolbar-chip toolbar-chip--muted">Compared with 1991–2020 normals</span>
        </div>

        <PanelCard title="Anomalies" subtitle="Key deviations from climatological normals and event baselines">
          <div className="anomaly-list">
            {anomalyItems.map((item) => (
              <article key={item.title} className={`anomaly-item anomaly-item--${item.tone}`}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <span>{item.value}</span>
              </article>
            ))}
          </div>
        </PanelCard>
      </div>
    </section>
  </div>
);
