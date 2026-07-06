import { useState } from 'react';
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type MonthlyRow = {
  year: number;
  month: number;
  mean_temp: number | null;
  total_rainfall: number | null;
  max_gust: number | null;
  total_lightning_count: number | null;
  mean_pressure: number | null;
};

export type MonthlyAverage = {
  month: number;
  avg_temp: number | null;
  avg_rainfall: number | null;
  avg_gust: number | null;
  avg_lightning: number | null;
  avg_pressure: number | null;
};

type VariableCfg = {
  field: keyof MonthlyRow;
  avgField: keyof MonthlyAverage;
  label: string;
  unit: string;
  decimals: number;
};

const VARIABLE_CFGS: Record<string, VariableCfg> = {
  temperature: {
    field: 'mean_temp',
    avgField: 'avg_temp',
    label: 'Mean Temperature',
    unit: '°C',
    decimals: 1,
  },
  rainfall: {
    field: 'total_rainfall',
    avgField: 'avg_rainfall',
    label: 'Total Rainfall',
    unit: ' mm',
    decimals: 1,
  },
  pressure: {
    field: 'mean_pressure',
    avgField: 'avg_pressure',
    label: 'Mean Pressure',
    unit: ' hPa',
    decimals: 1,
  },
  wind: {
    field: 'max_gust',
    avgField: 'avg_gust',
    label: 'Max Gust',
    unit: ' mph',
    decimals: 1,
  },
  lightning: {
    field: 'total_lightning_count',
    avgField: 'avg_lightning',
    label: 'Lightning Count',
    unit: '',
    decimals: 0,
  },
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const VARIABLES = ['temperature', 'rainfall', 'pressure', 'wind', 'lightning'];
const VARIABLE_LABELS: Record<string, string> = {
  temperature: '🌡️ Temperature',
  rainfall: '💧 Rainfall',
  pressure: '🌀 Pressure',
  wind: '💨 Wind',
  lightning: '⚡ Lightning',
};

interface Props {
  monthly: MonthlyRow[];
  monthlyAverages: MonthlyAverage[];
  currentYear: number;
}

export const YearComparisonChart = ({ monthly, monthlyAverages, currentYear }: Props) => {
  const [variable, setVariable] = useState('temperature');
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  const cfg = VARIABLE_CFGS[variable];
  const years = [...new Set(monthly.map((r) => r.year))].sort();

  const toggleKey = (key: string) => {
    setHiddenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const chartData = MONTH_LABELS.map((monthName, idx) => {
    const monthNum = idx + 1;
    const entry: Record<string, string | number | null> = { month: monthName };
    for (const year of years) {
      const row = monthly.find((r) => r.year === year && r.month === monthNum);
      entry[String(year)] = row ? (row[cfg.field] ?? null) : null;
    }
    const avg = monthlyAverages.find((a) => a.month === monthNum);
    entry['average'] = avg ? (avg[cfg.avgField] ?? null) : null;
    return entry;
  });

  const prevYears = years.filter((y) => y !== currentYear);
  const fmt = (v: number) => `${v.toFixed(cfg.decimals)}${cfg.unit}`;

  return (
    <div>
      <div className="var-tabs">
        {VARIABLES.map((v) => (
          <button
            key={v}
            className={`var-tab${variable === v ? ' active' : ''}`}
            onClick={() => setVariable(v)}
          >
            {VARIABLE_LABELS[v]}
          </button>
        ))}
      </div>

      <div className="year-toggles">
        <span className="year-toggles-label">Toggle years:</span>
        {prevYears.map((year) => (
          <button
            key={year}
            className={`year-btn prev-year${hiddenKeys.has(String(year)) ? ' dimmed' : ''}`}
            onClick={() => toggleKey(String(year))}
          >
            {year}
          </button>
        ))}
        <button
          className={`year-btn avg-year${hiddenKeys.has('average') ? ' dimmed' : ''}`}
          onClick={() => toggleKey('average')}
        >
          Average
        </button>
        {years.includes(currentYear) && (
          <button
            className={`year-btn current-year${hiddenKeys.has(String(currentYear)) ? ' dimmed' : ''}`}
            onClick={() => toggleKey(String(currentYear))}
          >
            {currentYear} ★
          </button>
        )}
      </div>

      <div className="chart-wrap" style={{ height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
            <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 12 }} />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 12 }}
              tickFormatter={(v: number) => `${v.toFixed(cfg.decimals)}${cfg.unit}`}
              width={60}
            />
            <Tooltip formatter={(v) => typeof v === 'number' ? fmt(v) : v} />
            <Legend />
            <Brush dataKey="month" height={18} stroke="#e2e8f0" travellerWidth={6} />

            {prevYears.map((year) => (
              <Line
                key={year}
                type="monotone"
                dataKey={String(year)}
                stroke="#94a3b8"
                strokeWidth={1}
                dot={false}
                hide={hiddenKeys.has(String(year))}
                name={String(year)}
                connectNulls={false}
              />
            ))}

            <Line
              type="monotone"
              dataKey="average"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              hide={hiddenKeys.has('average')}
              name="Climate Average"
              strokeDasharray="6 3"
              connectNulls={false}
            />

            <Line
              type="monotone"
              dataKey={String(currentYear)}
              stroke="#ef4444"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#ef4444' }}
              hide={hiddenKeys.has(String(currentYear))}
              name={`${currentYear} (Current)`}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
