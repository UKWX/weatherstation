import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { MetricCard } from '../components/MetricCard';
import { PanelCard } from '../components/PanelCard';

type ReportTab = 'monthly' | 'annual';

type DailySeriesRow = {
  date: string;
  day: number;
  mean_temp: number | null;
  rainfall_total: number | null;
  max_adjusted_gust: number | null;
  mean_pressure: number | null;
  lightning_count: number;
};

type MonthlyReport = {
  title: string;
  period: {
    year: number;
    month: number;
    label: string;
    timezone: string;
  };
  monthlyOverview: {
    mean_temp: number | null;
    total_rainfall: number | null;
    max_gust: number | null;
    total_lightning_days: number | null;
    observation_days: number;
  };
  temperatureSummary: {
    monthlyMean: number | null;
    monthlyRange: number | null;
    warmestDay: { date: string; max_temp: number } | null;
    coldestDay: { date: string; min_temp: number } | null;
  };
  rainfallSummary: {
    monthlyTotal: number | null;
    rainDays: number;
    wettestDay: { date: string; rainfall_total: number | null } | null;
  };
  windSummary: {
    monthlyPeakGust: number | null;
    strongestAdjustedGustDay: { date: string; max_adjusted_gust: number } | null;
  };
  pressureSummary: {
    maxPressure: number | null;
    minPressure: number | null;
    meanPressure: number | null;
  };
  lightningSummary: {
    totalLightningCount: number;
    thunderDays: number | null;
    highestDailyLightning: { date: string; lightning_count: number } | null;
  };
  anomalies: Array<{
    variable: string;
    mean_anomaly: number | null;
    mean_anomaly_percent: number | null;
    min_anomaly: number | null;
    max_anomaly: number | null;
  }>;
  records: Array<{
    period_type: string;
    variable: string;
    record_type: string;
    record_value: number;
    record_date: string | null;
  }>;
  graphs: {
    dailySeries: DailySeriesRow[];
  };
  qualityChecks: {
    noDuplicateProcessing: boolean;
    allCalculationsAccurate: boolean;
    timezoneCorrect: string;
    dataValidated: boolean;
  };
};

type AnnualReport = {
  title: string;
  period: {
    year: number;
    baseline: string;
    timezone: string;
  };
  annualStatistics: {
    mean_temp: number | null;
    total_rainfall: number | null;
    highest_temp: number | null;
    lowest_temp: number | null;
    max_gust: number | null;
    thunder_days: number | null;
    valid_days: number;
  };
  rankings: Array<{
    variable: string;
    rank_position: number | null;
    percentile: number | null;
  }>;
  records: Array<{
    variable: string;
    record_type: string;
    record_value: number;
    record_date: string | null;
  }>;
  trendAnalysis: {
    linearTemperatureTrendPerYear: number;
    baselineToCurrentTemperatureChange: number | null;
    baselineToCurrentRainfallChange: number | null;
  };
  anomalies: {
    temp_anomaly: number | null;
    rainfall_anomaly: number | null;
    thunder_days_anomaly: number | null;
  };
  graphs: {
    monthlyBreakdown: Array<{
      month: number;
      mean_temp: number | null;
      total_rainfall: number | null;
      max_gust: number | null;
      total_lightning_days: number | null;
    }>;
    annualTrendSeries: Array<{
      year: number;
      mean_temp: number | null;
      total_rainfall: number | null;
      thunder_days: number | null;
    }>;
  };
  qualityChecks: {
    noDuplicateProcessing: boolean;
    allCalculationsAccurate: boolean;
    timezoneCorrect: string;
    dataValidated: boolean;
  };
};


const STATION_TIMEZONE = 'Europe/London';
const stationNowParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: STATION_TIMEZONE,
  year: 'numeric',
  month: 'numeric'
})
  .formatToParts(new Date())
  .reduce<{ year: number; month: number }>(
    (acc, part) => {
      if (part.type === 'year') acc.year = Number(part.value);
      if (part.type === 'month') acc.month = Number(part.value);
      return acc;
    },
    { year: new Date().getUTCFullYear(), month: new Date().getUTCMonth() + 1 }
  );

const YEARS_TO_DISPLAY = 16;
const CURRENT_YEAR = stationNowParts.year;
const YEARS = Array.from({ length: YEARS_TO_DISPLAY }, (_, idx) => CURRENT_YEAR - idx);
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

async function fetchReport<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const formatValue = (value: number | null | undefined, suffix = ''): string =>
  value === null || value === undefined ? '—' : `${value.toFixed(1)}${suffix}`;

export const ReportsPage = () => {
  const [tab, setTab] = useState<ReportTab>('monthly');
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [month, setMonth] = useState<number>(stationNowParts.month);

  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);
  const [annualReport, setAnnualReport] = useState<AnnualReport | null>(null);
  const [monthlyError, setMonthlyError] = useState<string | null>(null);
  const [annualError, setAnnualError] = useState<string | null>(null);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [loadingAnnual, setLoadingAnnual] = useState(false);

  useEffect(() => {
    if (tab !== 'monthly') return;
    setLoadingMonthly(true);
    setMonthlyError(null);
    fetchReport<MonthlyReport>(`/api/reports/monthly?year=${year}&month=${month}`)
      .then(setMonthlyReport)
      .catch((error: unknown) => setMonthlyError(error instanceof Error ? error.message : 'Failed to load monthly report'))
      .finally(() => setLoadingMonthly(false));
  }, [tab, year, month]);

  useEffect(() => {
    if (tab !== 'annual') return;
    setLoadingAnnual(true);
    setAnnualError(null);
    fetchReport<AnnualReport>(`/api/reports/annual?year=${year}`)
      .then(setAnnualReport)
      .catch((error: unknown) => setAnnualError(error instanceof Error ? error.message : 'Failed to load annual report'))
      .finally(() => setLoadingAnnual(false));
  }, [tab, year]);

  const monthlyGraphData = useMemo(
    () =>
      (monthlyReport?.graphs.dailySeries ?? []).map((row) => ({
        ...row,
        label: String(row.day).padStart(2, '0')
      })),
    [monthlyReport]
  );

  const annualTrendData = useMemo(
    () =>
      (annualReport?.graphs.annualTrendSeries ?? []).map((row) => ({
        ...row,
        year: String(row.year)
      })),
    [annualReport]
  );

  return (
    <div className="page-grid">
      <section className="metrics-grid">
        <MetricCard label="Reports" value="Monthly + Annual" trend="Professional climate reporting" tone="pressure" />
        <MetricCard label="Export Ready" value="CSV · JSON · Excel · PDF" trend="Operational publication formats" tone="rain" />
        <MetricCard label="Quality Controls" value="Validation active" trend="Duplicates, timezone, and integrity checks" tone="wind" />
      </section>

      <PanelCard title="Climate reporting controls" subtitle="Generate professional monthly and annual climate reports">
        <div className="report-controls">
          <div className="report-tab-row">
            <button className={`analytics-tab${tab === 'monthly' ? ' active' : ''}`} onClick={() => setTab('monthly')}>
              Monthly report
            </button>
            <button className={`analytics-tab${tab === 'annual' ? ' active' : ''}`} onClick={() => setTab('annual')}>
              Annual report
            </button>
          </div>
          <div className="report-filters">
            <label>
              Year
              <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
                {YEARS.map((entryYear) => (
                  <option key={entryYear} value={entryYear}>
                    {entryYear}
                  </option>
                ))}
              </select>
            </label>
            {tab === 'monthly' ? (
              <label>
                Month
                <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
                  {MONTHS.map((name, index) => (
                    <option key={name} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        </div>
      </PanelCard>

      {tab === 'monthly' ? (
        <>
          <PanelCard
            title={monthlyReport?.title ?? 'Monthly Climate Report'}
            subtitle="Monthly overview, variable summaries, records, anomalies, and graph diagnostics"
            action={<span className="toolbar-chip toolbar-chip--muted">{monthlyReport?.period.timezone ?? '—'}</span>}
          >
            {loadingMonthly ? (
              <p className="panel-body-text">Loading monthly report…</p>
            ) : monthlyError ? (
              <p className="panel-body-text" style={{ color: '#ef4444' }}>{monthlyError}</p>
            ) : !monthlyReport ? (
              <p className="panel-body-text">No monthly report is available for this period.</p>
            ) : (
              <>
                <div className="summary-grid">
                  <article className="summary-stat summary-stat--temperature">
                    <span>Mean temperature</span>
                    <strong>{formatValue(monthlyReport.monthlyOverview.mean_temp, '°C')}</strong>
                    <small>Range {formatValue(monthlyReport.temperatureSummary.monthlyRange, '°C')}</small>
                  </article>
                  <article className="summary-stat summary-stat--rain">
                    <span>Total rainfall</span>
                    <strong>{formatValue(monthlyReport.rainfallSummary.monthlyTotal, ' mm')}</strong>
                    <small>{monthlyReport.rainfallSummary.rainDays} rain days</small>
                  </article>
                  <article className="summary-stat summary-stat--wind">
                    <span>Peak gust</span>
                    <strong>{formatValue(monthlyReport.windSummary.monthlyPeakGust, ' mph')}</strong>
                    <small>{monthlyReport.monthlyOverview.observation_days} observation days</small>
                  </article>
                  <article className="summary-stat summary-stat--pressure">
                    <span>Mean pressure</span>
                    <strong>{formatValue(monthlyReport.pressureSummary.meanPressure, ' hPa')}</strong>
                    <small>Lightning count {monthlyReport.lightningSummary.totalLightningCount}</small>
                  </article>
                </div>

                <div className="dashboard-chart-grid">
                  <PanelCard title="Temperature and pressure" subtitle="Daily mean temperature with pressure overlay">
                    <div className="chart-wrap">
                      <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={monthlyGraphData}>
                          <CartesianGrid strokeDasharray="4 4" stroke="#dbe6fb" />
                          <XAxis dataKey="label" stroke="#6b7a99" />
                          <YAxis yAxisId="temp" stroke="#6b7a99" unit="°C" />
                          <YAxis yAxisId="pressure" orientation="right" stroke="#6b7a99" unit=" hPa" />
                          <Tooltip />
                          <Legend />
                          <Line yAxisId="temp" type="monotone" dataKey="mean_temp" stroke="#ef4444" dot={false} strokeWidth={2.5} />
                          <Line yAxisId="pressure" type="monotone" dataKey="mean_pressure" stroke="#b91c1c" dot={false} strokeDasharray="6 4" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </PanelCard>

                  <PanelCard title="Rainfall, gust, and lightning" subtitle="Daily rainfall totals with wind gust and lightning context">
                    <div className="chart-wrap">
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={monthlyGraphData}>
                          <CartesianGrid strokeDasharray="4 4" stroke="#dbe6fb" />
                          <XAxis dataKey="label" stroke="#6b7a99" />
                          <YAxis yAxisId="rain" stroke="#6b7a99" unit=" mm" />
                          <YAxis yAxisId="wind" orientation="right" stroke="#6b7a99" unit=" mph" />
                          <Tooltip />
                          <Legend />
                          <Bar yAxisId="rain" dataKey="rainfall_total" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                          <Line yAxisId="wind" type="monotone" dataKey="max_adjusted_gust" stroke="#16a34a" strokeWidth={2.5} dot={false} />
                          <Line yAxisId="rain" type="monotone" dataKey="lightning_count" stroke="#a855f7" strokeWidth={2} dot={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </PanelCard>
                </div>

                <div className="dashboard-detail-grid">
                  <PanelCard title="Anomalies" subtitle="Period-average daily anomaly diagnostics">
                    <div className="table-shell">
                      <table>
                        <thead>
                          <tr>
                            <th>Variable</th>
                            <th>Mean anomaly</th>
                            <th>Mean anomaly %</th>
                            <th>Min</th>
                            <th>Max</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyReport.anomalies.map((item) => (
                            <tr key={item.variable}>
                              <td>{item.variable}</td>
                              <td>{formatValue(item.mean_anomaly)}</td>
                              <td>{formatValue(item.mean_anomaly_percent, '%')}</td>
                              <td>{formatValue(item.min_anomaly)}</td>
                              <td>{formatValue(item.max_anomaly)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </PanelCard>

                  <PanelCard title="Records and quality" subtitle="Records triggered in-period and final quality gates">
                    <ul className="status-list status-list--stacked report-status-list">
                      <li><span>No duplicate processing</span><strong className={monthlyReport.qualityChecks.noDuplicateProcessing ? 'ok' : 'warn'}>{monthlyReport.qualityChecks.noDuplicateProcessing ? 'Pass' : 'Check'}</strong></li>
                      <li><span>Calculation integrity</span><strong className={monthlyReport.qualityChecks.allCalculationsAccurate ? 'ok' : 'warn'}>{monthlyReport.qualityChecks.allCalculationsAccurate ? 'Pass' : 'Check'}</strong></li>
                      <li><span>Timezone</span><strong>{monthlyReport.qualityChecks.timezoneCorrect}</strong></li>
                      <li><span>Data validation</span><strong className={monthlyReport.qualityChecks.dataValidated ? 'ok' : 'warn'}>{monthlyReport.qualityChecks.dataValidated ? 'Pass' : 'Check'}</strong></li>
                    </ul>
                    <div className="table-shell">
                      <table>
                        <thead>
                          <tr>
                            <th>Scope</th>
                            <th>Variable</th>
                            <th>Type</th>
                            <th>Value</th>
                            <th>Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {monthlyReport.records.map((record, index) => (
                            <tr key={`${record.variable}-${record.record_type}-${index}`}>
                              <td>{record.period_type}</td>
                              <td>{record.variable}</td>
                              <td>{record.record_type}</td>
                              <td>{record.record_value.toFixed(1)}</td>
                              <td>{record.record_date ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </PanelCard>
                </div>
              </>
            )}
          </PanelCard>
        </>
      ) : (
        <PanelCard
          title={annualReport?.title ?? 'Annual Climate Report'}
          subtitle="Annual statistics, rankings, records, trend analysis, anomalies, and long-range graphs"
          action={<span className="toolbar-chip toolbar-chip--muted">{annualReport?.period.baseline ?? '—'}</span>}
        >
          {loadingAnnual ? (
            <p className="panel-body-text">Loading annual report…</p>
          ) : annualError ? (
            <p className="panel-body-text" style={{ color: '#ef4444' }}>{annualError}</p>
          ) : !annualReport ? (
            <p className="panel-body-text">No annual report is available for this year.</p>
          ) : (
            <>
              <div className="summary-grid">
                <article className="summary-stat summary-stat--temperature">
                  <span>Mean temperature</span>
                  <strong>{formatValue(annualReport.annualStatistics.mean_temp, '°C')}</strong>
                  <small>Trend {annualReport.trendAnalysis.linearTemperatureTrendPerYear.toFixed(3)} °C/yr</small>
                </article>
                <article className="summary-stat summary-stat--rain">
                  <span>Total rainfall</span>
                  <strong>{formatValue(annualReport.annualStatistics.total_rainfall, ' mm')}</strong>
                  <small>Anomaly {formatValue(annualReport.anomalies.rainfall_anomaly, ' mm')}</small>
                </article>
                <article className="summary-stat summary-stat--wind">
                  <span>Max gust</span>
                  <strong>{formatValue(annualReport.annualStatistics.max_gust, ' mph')}</strong>
                  <small>Thunder days {annualReport.annualStatistics.thunder_days ?? '—'}</small>
                </article>
                <article className="summary-stat summary-stat--pressure">
                  <span>Valid days</span>
                  <strong>{annualReport.annualStatistics.valid_days}</strong>
                  <small>Baseline {annualReport.period.baseline}</small>
                </article>
              </div>

              <div className="dashboard-chart-grid">
                <PanelCard title="Monthly climate profile" subtitle="Monthly rainfall and mean temperature">
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={annualReport.graphs.monthlyBreakdown}>
                        <CartesianGrid strokeDasharray="4 4" stroke="#dbe6fb" />
                        <XAxis dataKey="month" stroke="#6b7a99" />
                        <YAxis yAxisId="temp" stroke="#6b7a99" unit="°C" />
                        <YAxis yAxisId="rain" orientation="right" stroke="#6b7a99" unit=" mm" />
                        <Tooltip />
                        <Legend />
                        <Line yAxisId="temp" dataKey="mean_temp" stroke="#ef4444" strokeWidth={2.5} dot={false} />
                        <Line yAxisId="rain" dataKey="total_rainfall" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </PanelCard>

                <PanelCard title="Long-term trend" subtitle="Annual mean temperature and rainfall trend series">
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={annualTrendData}>
                        <CartesianGrid strokeDasharray="4 4" stroke="#dbe6fb" />
                        <XAxis dataKey="year" stroke="#6b7a99" />
                        <YAxis yAxisId="temp" stroke="#6b7a99" unit="°C" />
                        <YAxis yAxisId="rain" orientation="right" stroke="#6b7a99" unit=" mm" />
                        <Tooltip />
                        <Legend />
                        <Line yAxisId="temp" dataKey="mean_temp" stroke="#ef4444" strokeWidth={2.4} dot={false} />
                        <Line yAxisId="rain" dataKey="total_rainfall" stroke="#2563eb" strokeDasharray="6 4" dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </PanelCard>
              </div>

              <div className="dashboard-detail-grid">
                <PanelCard title="Annual rankings" subtitle="Relative station ranking position for annual metrics">
                  <div className="table-shell">
                    <table>
                      <thead>
                        <tr>
                          <th>Variable</th>
                          <th>Rank</th>
                          <th>Percentile</th>
                        </tr>
                      </thead>
                      <tbody>
                        {annualReport.rankings.map((row, index) => (
                          <tr key={`${row.variable}-${index}`}>
                            <td>{row.variable}</td>
                            <td>{row.rank_position ?? '—'}</td>
                            <td>{row.percentile !== null && row.percentile !== undefined ? `${row.percentile.toFixed(1)}%` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </PanelCard>

                <PanelCard title="Records and quality" subtitle="Annual records and final quality validation">
                  <ul className="status-list status-list--stacked report-status-list">
                    <li><span>No duplicate processing</span><strong className={annualReport.qualityChecks.noDuplicateProcessing ? 'ok' : 'warn'}>{annualReport.qualityChecks.noDuplicateProcessing ? 'Pass' : 'Check'}</strong></li>
                    <li><span>Calculation integrity</span><strong className={annualReport.qualityChecks.allCalculationsAccurate ? 'ok' : 'warn'}>{annualReport.qualityChecks.allCalculationsAccurate ? 'Pass' : 'Check'}</strong></li>
                    <li><span>Timezone</span><strong>{annualReport.qualityChecks.timezoneCorrect}</strong></li>
                    <li><span>Data validation</span><strong className={annualReport.qualityChecks.dataValidated ? 'ok' : 'warn'}>{annualReport.qualityChecks.dataValidated ? 'Pass' : 'Check'}</strong></li>
                  </ul>
                  <div className="table-shell">
                    <table>
                      <thead>
                        <tr>
                          <th>Variable</th>
                          <th>Type</th>
                          <th>Value</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {annualReport.records.map((record, index) => (
                          <tr key={`${record.variable}-${record.record_type}-${index}`}>
                            <td>{record.variable}</td>
                            <td>{record.record_type}</td>
                            <td>{record.record_value.toFixed(1)}</td>
                            <td>{record.record_date ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </PanelCard>
              </div>
            </>
          )}
        </PanelCard>
      )}
    </div>
  );
};
