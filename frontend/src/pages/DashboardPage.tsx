import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart
} from 'recharts';
import { MetricCard } from '../components/MetricCard';
import { PanelCard } from '../components/PanelCard';

const temperatureSeries = [
  { day: 'Mon', max: 16, min: 8, mean: 12 },
  { day: 'Tue', max: 18, min: 10, mean: 14 },
  { day: 'Wed', max: 17, min: 9, mean: 13 },
  { day: 'Thu', max: 20, min: 11, mean: 15 },
  { day: 'Fri', max: 19, min: 10, mean: 14 },
  { day: 'Sat', max: 21, min: 12, mean: 16 },
  { day: 'Sun', max: 18, min: 9, mean: 13 }
];

const rainfallSeries = [
  { day: 'Mon', rain: 0 },
  { day: 'Tue', rain: 2.5 },
  { day: 'Wed', rain: 0.8 },
  { day: 'Thu', rain: 6.2 },
  { day: 'Fri', rain: 0 },
  { day: 'Sat', rain: 3.1 },
  { day: 'Sun', rain: 1.2 }
];

export const DashboardPage = () => (
  <div className="page-grid">
    <section className="metrics-grid">
      <MetricCard label="Temperature" value="14.7°C" trend="Feels like 14.2°C" icon="🌡️" />
      <MetricCard label="Rainfall Today" value="0.0 mm" trend="Rate 0.0 mm/hr" icon="💧" />
      <MetricCard label="Wind (Gust)" value="19.6 mph" trend="Adjusted 27.4 mph" icon="💨" />
      <MetricCard label="Pressure" value="1018.6 hPa" trend="Steady" icon="🌀" />
      <MetricCard label="Lightning" value="0" trend="Thunder Day: No" icon="⚡" />
    </section>

    <PanelCard title="Temperature (Last 7 Days)" subtitle="Max, mean and minimum profile">
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={temperatureSeries}>
            <defs>
              <linearGradient id="maxGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
            <XAxis dataKey="day" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="max" stroke="#ef4444" fill="url(#maxGradient)" />
            <Area type="monotone" dataKey="mean" stroke="#2563eb" fill="transparent" />
            <Area type="monotone" dataKey="min" stroke="#16a34a" fill="transparent" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </PanelCard>

    <PanelCard title="Rainfall (Last 7 Days)" subtitle="Daily totals">
      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={rainfallSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
            <XAxis dataKey="day" stroke="#64748b" />
            <YAxis stroke="#64748b" />
            <Tooltip />
            <Bar dataKey="rain" fill="#3b82f6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </PanelCard>

    <PanelCard title="Station Status" subtitle="Archive and processing health">
      <ul className="status-list">
        <li><span>System</span><strong className="ok">Operational</strong></li>
        <li><span>Data Logging</span><strong className="ok">Online</strong></li>
        <li><span>Latest Sync</span><strong>16:32 Local</strong></li>
        <li><span>Timezone</span><strong>Europe/London</strong></li>
      </ul>
    </PanelCard>
  </div>
);
