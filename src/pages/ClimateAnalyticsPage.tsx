import { useEffect, useState } from 'react';
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
import { MetricCard } from '../components/MetricCard';
import { PanelCard } from '../components/PanelCard';
import { YearComparisonChart } from '../components/analytics/YearComparisonChart';
import type { MonthlyRow, MonthlyAverage } from '../components/analytics/YearComparisonChart';
import { TrendChart } from '../components/analytics/TrendChart';
import type { AnnualRow } from '../components/analytics/TrendChart';

// ── Types ─────────────────────────────────────────────────────────────────────

type YearComparisonData = {
  monthly: MonthlyRow[];
  monthlyAverages: MonthlyAverage[];
  currentYear: number;
};

type YtdMonthlyRow = {
  year: number;
  month: number;
  mean_temp: number | null;
  total_rainfall: number | null;
  total_lightning_count: number | null;
};

type YtdData = {
  monthly: YtdMonthlyRow[];
  currentYear: number;
  currentMonth: number;
};

type TrendResult = { slope: number; intercept: number };

type TrendsData = {
  annual: AnnualRow[];
  linearTrends: Partial<Record<string, TrendResult>>;
  tenYearTrends: Partial<Record<string, TrendResult>>;
  rollingAvg: Array<Record<string, number | null>>;
};

type ExtremeDay = Record<string, string | number | null>;

type ExtremesData = {
  warmestDays: ExtremeDay[];
  coldestDays: ExtremeDay[];
  wettestDays: ExtremeDay[];
  highestGusts: ExtremeDay[];
  highestPressure: ExtremeDay[];
  lowestPressure: ExtremeDay[];
  highestLightning: ExtremeDay[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MAIN_TABS = [
  { key: 'year-comparison', label: '📊 Year Comparison' },
  { key: 'ytd', label: '📅 Year to Date' },
  { key: 'trends', label: '📈 Trend Analysis' },
  { key: 'extremes', label: '🏆 Extremes' },
] as const;

type MainTab = (typeof MAIN_TABS)[number]['key'];

const EXTREMES_TABS = [
  { key: 'warmestDays', label: '🔥 Warmest Days' },
  { key: 'coldestDays', label: '❄️ Coldest Days' },
  { key: 'wettestDays', label: '🌧️ Wettest Days' },
  { key: 'highestGusts', label: '💨 Highest Gusts' },
  { key: 'highestPressure', label: '⬆️ Highest Pressure' },
  { key: 'lowestPressure', label: '⬇️ Lowest Pressure' },
  { key: 'highestLightning', label: '⚡ Most Lightning' },
] as const;

type ExtremesTab = (typeof EXTREMES_TABS)[number]['key'];

const YTD_VARS = [
  { key: 'rainfall', label: '💧 Rainfall (cumulative mm)' },
  { key: 'lightning', label: '⚡ Lightning (cumulative)' },
  { key: 'temperature', label: '🌡️ Temperature (monthly mean °C)' },
] as const;

type YtdVar = (typeof YTD_VARS)[number]['key'];

// ── API ───────────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// ── Year-to-Date chart data builder ──────────────────────────────────────────

function buildYtdChartData(
  monthly: YtdMonthlyRow[],
  currentMonth: number,
  ytdVar: YtdVar,
) {
  const years = [...new Set(monthly.map((r) => r.year))].sort();

  // For each year build a cumulative (or mean) series per month
  const seriesByYear: Record<number, Array<number | null>> = {};
  for (const year of years) {
    const rows = monthly.filter((r) => r.year === year);
    let cumulative = 0;
    seriesByYear[year] = MONTH_LABELS.map((_, idx) => {
      const monthNum = idx + 1;
      const row = rows.find((r) => r.month === monthNum);
      if (!row) return null;
      if (ytdVar === 'rainfall') {
        cumulative += row.total_rainfall ?? 0;
        return cumulative;
      }
      if (ytdVar === 'lightning') {
        cumulative += row.total_lightning_count ?? 0;
        return cumulative;
      }
      // temperature = monthly mean (not cumulative)
      return row.mean_temp ?? null;
    });
  }

  return MONTH_LABELS.slice(0, currentMonth).map((monthName, idx) => {
    const entry: Record<string, string | number | null> = { month: monthName };
    for (const year of years) {
      entry[String(year)] = seriesByYear[year][idx] ?? null;
    }
    return entry;
  });
}

// ── Extremes columns config ───────────────────────────────────────────────────

const EXTREMES_COLS: Record<ExtremesTab, Array<{ key: string; label: string; fmt?: (v: number) => string }>> = {
  warmestDays: [
    { key: 'date', label: 'Date' },
    { key: 'max_temp', label: 'Max Temp (°C)', fmt: (v) => v.toFixed(1) },
    { key: 'min_temp', label: 'Min Temp (°C)', fmt: (v) => v.toFixed(1) },
    { key: 'mean_temp', label: 'Mean Temp (°C)', fmt: (v) => v.toFixed(1) },
  ],
  coldestDays: [
    { key: 'date', label: 'Date' },
    { key: 'min_temp', label: 'Min Temp (°C)', fmt: (v) => v.toFixed(1) },
    { key: 'max_temp', label: 'Max Temp (°C)', fmt: (v) => v.toFixed(1) },
    { key: 'mean_temp', label: 'Mean Temp (°C)', fmt: (v) => v.toFixed(1) },
  ],
  wettestDays: [
    { key: 'date', label: 'Date' },
    { key: 'rainfall_total', label: 'Rainfall (mm)', fmt: (v) => v.toFixed(1) },
  ],
  highestGusts: [
    { key: 'date', label: 'Date' },
    { key: 'max_adjusted_gust', label: 'Adjusted Gust (mph)', fmt: (v) => v.toFixed(1) },
    { key: 'max_raw_gust', label: 'Raw Gust (mph)', fmt: (v) => v.toFixed(1) },
  ],
  highestPressure: [
    { key: 'date', label: 'Date' },
    { key: 'max_pressure', label: 'Max Pressure (hPa)', fmt: (v) => v.toFixed(1) },
    { key: 'min_pressure', label: 'Min Pressure (hPa)', fmt: (v) => v.toFixed(1) },
    { key: 'mean_pressure', label: 'Mean Pressure (hPa)', fmt: (v) => v.toFixed(1) },
  ],
  lowestPressure: [
    { key: 'date', label: 'Date' },
    { key: 'min_pressure', label: 'Min Pressure (hPa)', fmt: (v) => v.toFixed(1) },
    { key: 'max_pressure', label: 'Max Pressure (hPa)', fmt: (v) => v.toFixed(1) },
    { key: 'mean_pressure', label: 'Mean Pressure (hPa)', fmt: (v) => v.toFixed(1) },
  ],
  highestLightning: [
    { key: 'date', label: 'Date' },
    { key: 'lightning_count', label: 'Lightning Count', fmt: (v) => String(v) },
  ],
};

// ── Sub-components ────────────────────────────────────────────────────────────

function LoadingRow() {
  return (
    <tr>
      <td colSpan={10} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
        Loading…
      </td>
    </tr>
  );
}

function ExtremesTable({
  category,
  rows,
}: {
  category: ExtremesTab;
  rows: ExtremeDay[];
}) {
  const cols = EXTREMES_COLS[category];
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>#</th>
            {cols.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={cols.length + 1} style={{ textAlign: 'center', color: '#94a3b8', padding: '2rem' }}>
                No data available.
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i}>
                <td style={{ color: '#94a3b8', fontWeight: 600 }}>{i + 1}</td>
                {cols.map((c) => {
                  const raw = row[c.key];
                  const display =
                    raw === null || raw === undefined
                      ? '—'
                      : c.fmt && typeof raw === 'number'
                        ? c.fmt(raw)
                        : String(raw);
                  return <td key={c.key}>{display}</td>;
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Year-to-Date section ──────────────────────────────────────────────────────

function YtdSection({ data }: { data: YtdData | null }) {
  const [ytdVar, setYtdVar] = useState<YtdVar>('rainfall');

  if (!data) {
    return <p className="panel-body-text">Loading year-to-date data…</p>;
  }

  const { monthly, currentYear, currentMonth } = data;
  const years = [...new Set(monthly.map((r) => r.year))].sort();

  const chartData = buildYtdChartData(monthly, currentMonth, ytdVar);

  const varCfg = YTD_VARS.find((v) => v.key === ytdVar)!;

  return (
    <div>
      <div className="var-tabs">
        {YTD_VARS.map((v) => (
          <button
            key={v.key}
            className={`var-tab${ytdVar === v.key ? ' active' : ''}`}
            onClick={() => setYtdVar(v.key)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="chart-wrap" style={{ height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#dbeafe" />
            <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 12 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 12 }} width={60} />
            <Tooltip />
            <Legend />

            {years.filter((y) => y !== currentYear).map((year) => (
              <Line
                key={year}
                type="monotone"
                dataKey={String(year)}
                stroke="#94a3b8"
                strokeWidth={1}
                dot={false}
                name={String(year)}
                connectNulls={false}
              />
            ))}

            {years.includes(currentYear) && (
              <Line
                type="monotone"
                dataKey={String(currentYear)}
                stroke="#ef4444"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#ef4444' }}
                name={`${currentYear} (Current)`}
                connectNulls={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.5rem' }}>
        {varCfg.label}. Current year shown to end of {MONTH_LABELS[currentMonth - 1]}.
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export const ClimateAnalyticsPage = () => {
  const [tab, setTab] = useState<MainTab>('year-comparison');
  const [extremesTab, setExtremesTab] = useState<ExtremesTab>('warmestDays');

  const [ycData, setYcData] = useState<YearComparisonData | null>(null);
  const [ytdData, setYtdData] = useState<YtdData | null>(null);
  const [trendsData, setTrendsData] = useState<TrendsData | null>(null);
  const [extremesData, setExtremesData] = useState<ExtremesData | null>(null);

  const [ycError, setYcError] = useState<string | null>(null);
  const [ytdError, setYtdError] = useState<string | null>(null);
  const [trendsError, setTrendsError] = useState<string | null>(null);
  const [extremesError, setExtremesError] = useState<string | null>(null);

  useEffect(() => {
    if (!ycData && !ycError) {
      apiFetch<YearComparisonData>('/api/climate/analytics/year-comparison')
        .then(setYcData)
        .catch((e: unknown) => setYcError(e instanceof Error ? e.message : 'Unknown error'));
    }
  }, [ycData, ycError]);

  useEffect(() => {
    if (tab === 'ytd' && !ytdData && !ytdError) {
      apiFetch<YtdData>('/api/climate/analytics/year-to-date')
        .then(setYtdData)
        .catch((e: unknown) => setYtdError(e instanceof Error ? e.message : 'Unknown error'));
    }
  }, [tab, ytdData, ytdError]);

  useEffect(() => {
    if (tab === 'trends' && !trendsData && !trendsError) {
      apiFetch<TrendsData>('/api/climate/analytics/trends')
        .then(setTrendsData)
        .catch((e: unknown) => setTrendsError(e instanceof Error ? e.message : 'Unknown error'));
    }
  }, [tab, trendsData, trendsError]);

  useEffect(() => {
    if (tab === 'extremes' && !extremesData && !extremesError) {
      apiFetch<ExtremesData>('/api/climate/analytics/extremes')
        .then(setExtremesData)
        .catch((e: unknown) => setExtremesError(e instanceof Error ? e.message : 'Unknown error'));
    }
  }, [tab, extremesData, extremesError]);

  const currentYear = ycData?.currentYear ?? new Date().getFullYear();
  const yearCount = ycData ? [...new Set(ycData.monthly.map((r) => r.year))].length : 0;

  return (
    <div className="page-grid">
      <section className="metrics-grid">
        <MetricCard label="Years of Data" value={yearCount > 0 ? String(yearCount) : '—'} trend="Monthly comparison series" />
        <MetricCard label="Current Year" value={String(currentYear)} trend="Highlighted in red" />
        <MetricCard label="Trend Analysis" value="Linear · 10yr · 5yr Avg" trend="All key variables" />
      </section>

      {/* Main tab bar */}
      <div className="analytics-tabs">
        {MAIN_TABS.map((t) => (
          <button
            key={t.key}
            className={`analytics-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Year Comparison ── */}
      {tab === 'year-comparison' && (
        <PanelCard
          title="Year Comparison"
          subtitle="Monthly values per year — red = current year, blue = climate average, grey = previous years"
        >
          {ycError ? (
            <p style={{ color: '#ef4444' }}>Error: {ycError}</p>
          ) : !ycData ? (
            <p className="panel-body-text">Loading year comparison data…</p>
          ) : ycData.monthly.length === 0 ? (
            <p className="panel-body-text">No monthly data available yet. Process some daily summaries to populate this chart.</p>
          ) : (
            <YearComparisonChart
              monthly={ycData.monthly}
              monthlyAverages={ycData.monthlyAverages}
              currentYear={ycData.currentYear}
            />
          )}
        </PanelCard>
      )}

      {/* ── Year to Date ── */}
      {tab === 'ytd' && (
        <PanelCard
          title="Year to Date"
          subtitle="Current year vs all previous years — cumulative totals up to the same point in the year"
        >
          {ytdError ? (
            <p style={{ color: '#ef4444' }}>Error: {ytdError}</p>
          ) : (
            <YtdSection data={ytdData} />
          )}
        </PanelCard>
      )}

      {/* ── Trend Analysis ── */}
      {tab === 'trends' && (
        <PanelCard
          title="Trend Analysis"
          subtitle="Annual series with linear trend, 10-year trend and 5-year rolling average"
        >
          {trendsError ? (
            <p style={{ color: '#ef4444' }}>Error: {trendsError}</p>
          ) : !trendsData ? (
            <p className="panel-body-text">Loading trend data…</p>
          ) : trendsData.annual.length === 0 ? (
            <p className="panel-body-text">No annual summary data available yet.</p>
          ) : (
            <TrendChart
              annual={trendsData.annual}
              linearTrends={trendsData.linearTrends}
              tenYearTrends={trendsData.tenYearTrends}
              rollingAvg={trendsData.rollingAvg}
              currentYear={currentYear}
            />
          )}
        </PanelCard>
      )}

      {/* ── Extremes ── */}
      {tab === 'extremes' && (
        <PanelCard title="Extremes Explorer" subtitle="Top 50 days ranked by each climate variable">
          {extremesError ? (
            <p style={{ color: '#ef4444' }}>Error: {extremesError}</p>
          ) : (
            <>
              <div className="var-tabs" style={{ flexWrap: 'wrap' }}>
                {EXTREMES_TABS.map((t) => (
                  <button
                    key={t.key}
                    className={`var-tab${extremesTab === t.key ? ' active' : ''}`}
                    onClick={() => setExtremesTab(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {!extremesData ? (
                <div className="table-shell">
                  <table>
                    <thead>
                      <tr>
                        {EXTREMES_COLS[extremesTab].map((c) => (
                          <th key={c.key}>{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <LoadingRow />
                    </tbody>
                  </table>
                </div>
              ) : (
                <ExtremesTable
                  category={extremesTab}
                  rows={extremesData[extremesTab]}
                />
              )}
            </>
          )}
        </PanelCard>
      )}
    </div>
  );
};
