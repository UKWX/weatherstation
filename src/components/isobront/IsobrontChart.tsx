/**
 * Isobront Chart Component
 * Renders analysis charts using the existing UKWX recharts style.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalysisChartData } from '../../services/lightningAI';

interface Props {
  chart: AnalysisChartData;
}

const AXIS_COLOR = '#6b7a99';
const GRID_COLOR = '#dbe6fb';

export const IsobrontChart = ({ chart }: Props) => {
  const { type, data, xKey, yKeys, unit } = chart;

  if (data.length === 0) return null;

  const tickFormatter = (v: number) => `${Math.round(v)}${unit ?? ''}`;

  if (type === 'bar') {
    return (
      <div className="isobront-chart-wrap">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="4 4" stroke={GRID_COLOR} />
            <XAxis dataKey={xKey} stroke={AXIS_COLOR} tick={{ fontSize: 11 }} />
            <YAxis stroke={AXIS_COLOR} tick={{ fontSize: 11 }} tickFormatter={tickFormatter} />
            <Tooltip formatter={(v) => [`${String(v)} strikes`, '']} />
            {yKeys.map((yk) => (
              <Bar key={yk.key} dataKey={yk.key} name={yk.name} fill={yk.color} radius={[6, 6, 0, 0]} maxBarSize={40} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === 'horizontal-bar') {
    return (
      <div className="isobront-chart-wrap">
        <ResponsiveContainer width="100%" height={Math.max(200, data.length * 36)}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="4 4" stroke={GRID_COLOR} horizontal={false} />
            <XAxis type="number" stroke={AXIS_COLOR} tick={{ fontSize: 11 }} tickFormatter={tickFormatter} />
            <YAxis dataKey={xKey} type="category" stroke={AXIS_COLOR} tick={{ fontSize: 11 }} width={100} />
            <Tooltip formatter={(v) => [`${String(v)} strikes`, '']} />
            {yKeys.map((yk, i) => (
              <Bar key={yk.key} dataKey={yk.key} name={yk.name} radius={[0, 6, 6, 0]} maxBarSize={24}>
                {data.map((_, idx) => (
                  <Cell
                    key={`cell-${idx}`}
                    fill={yk.color}
                    opacity={1 - idx * 0.04}
                  />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  if (type === 'grouped-bar') {
    return (
      <div className="isobront-chart-wrap">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="4 4" stroke={GRID_COLOR} />
            <XAxis dataKey={xKey} stroke={AXIS_COLOR} tick={{ fontSize: 11 }} />
            <YAxis stroke={AXIS_COLOR} tick={{ fontSize: 11 }} tickFormatter={tickFormatter} />
            <Tooltip />
            <Legend />
            {yKeys.map((yk) => (
              <Bar key={yk.key} dataKey={yk.key} name={yk.name} fill={yk.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // line / timeseries
  return (
    <div className="isobront-chart-wrap">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 4" stroke={GRID_COLOR} />
          <XAxis dataKey={xKey} stroke={AXIS_COLOR} tick={{ fontSize: 11 }} />
          <YAxis stroke={AXIS_COLOR} tick={{ fontSize: 11 }} tickFormatter={tickFormatter} />
          <Tooltip />
          <Legend />
          {yKeys.map((yk) => (
            <Line
              key={yk.key}
              type="monotone"
              dataKey={yk.key}
              name={yk.name}
              stroke={yk.color}
              strokeWidth={2.5}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
