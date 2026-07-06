import { useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type AnnualRow = {
  year: number;
  mean_temp: number | null;
  total_rainfall: number | null;
  max_gust: number | null;
  thunder_days: number | null;
  total_lightning_count: number | null;
  mean_pressure: number | null;
};

type TrendResult = { slope: number; intercept: number };

type VariableCfg = {
  label: string;
  unit: string;
  decimals: number;
};

const VARIABLE_CFGS: Record<string, VariableCfg> = {
  mean_temp: { label: 'Mean Temperature', unit: '°C', decimals: 1 },
  total_rainfall: { label: 'Total Rainfall', unit: ' mm', decimals: 0 },
  mean_pressure: { label: 'Mean Pressure', unit: ' hPa', decimals: 1 },
  max_gust: { label: 'Max Gust', unit: ' mph', decimals: 1 },
  total_lightning_count: { label: 'Lightning Count', unit: '', decimals: 0 },
};

const VARIABLES = Object.keys(VARIABLE_CFGS);
const VARIABLE_LABELS: Record<string, string> = {
  mean_temp: '🌡️ Temperature',
  total_rainfall: '💧 Rainfall',
  mean_pressure: '🌀 Pressure',
  max_gust: '💨 Wind',
  total_lightning_count: '⚡ Lightning',
};

const ROLLING_WINDOW = 5;

interface Props {
  annual: AnnualRow[];
  linearTrends: Partial<Record<string, TrendResult>>;
  tenYearTrends: Partial<Record<string, TrendResult>>;
  rollingAvg: Array<Record<string, number | null>>;
  currentYear: number;
}

export const TrendChart = ({ annual, linearTrends, tenYearTrends, rollingAvg, currentYear }: Props) => {
  const [variable, setVariable] = useState('mean_temp');

  const cfg = VARIABLE_CFGS[variable];
  const tenYearsAgo = currentYear - 10;

  const linearTrend = linearTrends[variable];
  const tenYearTrend = tenYearTrends[variable];

  const chartData = annual.map((row, idx) => {
    const value = row[variable as keyof AnnualRow] as number | null;
    const rolling = rollingAvg[idx]?.[variable] ?? null;

    const linear = linearTrend
      ? linearTrend.slope * row.year + linearTrend.intercept
      : null;

    const tenYear =
      tenYearTrend && row.year >= tenYearsAgo
        ? tenYearTrend.slope * row.year + tenYearTrend.intercept
        : null;

    return { year: row.year, value, linear, tenYear, rolling };
  });

  const fmt = (v: number) => `${v.toFixed(cfg.decimals)}${cfg.unit}`;

  const slopeText = (trend: TrendResult) => {
    const sign = trend.slope >= 0 ? '+' : '';
    return `${sign}${(trend.slope * 10).toFixed(2)}${cfg.unit}/decade`;
  };

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

      {(linearTrend || tenYearTrend) && (
        <div className="trend-stats">
          {linearTrend && (
            <span className="trend-badge linear">
              Linear: <strong>{slopeText(linearTrend)}</strong>
            </span>
          )}
          {tenYearTrend && (
            <span className="trend-badge ten-year">
              10-Year: <strong>{slopeText(tenYearTrend)}</strong>
            </span>
          )}
          <span className="trend-badge rolling">
            Rolling avg: {ROLLING_WINDOW}-year window
          </span>
        </div>
      )}

      <div className="chart-wrap" style={{ height: 360 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
            <XAxis dataKey="year" stroke="#64748b" tick={{ fontSize: 12 }} />
            <YAxis
              stroke="#64748b"
              tick={{ fontSize: 12 }}
              tickFormatter={(v: number) => `${v.toFixed(cfg.decimals)}${cfg.unit}`}
              width={60}
            />
            <Tooltip
              formatter={(v) => typeof v === 'number' ? fmt(v) : v}
              labelFormatter={(l) => `Year: ${l}`}
            />
            <Legend />

            <Line
              type="monotone"
              dataKey="value"
              name={cfg.label}
              stroke="#64748b"
              strokeWidth={1.5}
              dot={{ r: 3, fill: '#64748b' }}
              connectNulls={false}
            />

            <Line
              type="monotone"
              dataKey="rolling"
              name={`${ROLLING_WINDOW}-yr Rolling Avg`}
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />

            {linearTrend && (
              <Line
                type="linear"
                dataKey="linear"
                name="Linear Trend"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
                connectNulls
                strokeDasharray="6 3"
              />
            )}

            {tenYearTrend && (
              <Line
                type="linear"
                dataKey="tenYear"
                name="10-Year Trend"
                stroke="#7c3aed"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                strokeDasharray="3 2"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
