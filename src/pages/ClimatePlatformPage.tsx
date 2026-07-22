import { useEffect, useMemo, useState } from 'react';
import { IsobrontChat } from '../components/isobront/IsobrontChat';
import Papa from 'papaparse';
import {
  Brush,
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

type RecordValue = {
  value: number;
  date?: string;
  year: number;
  label?: string;
  month?: string;
};

type RankingRow = {
  year: number;
  value: number;
  rank: number;
};

type ChartRow = Record<string, string | number | null>;

type ClimateOverview = {
  station: {
    stationId: string;
    timezone: string;
    temperatureCoverageStart: number;
    rainfallCoverageStart: number;
  };
  dataStatus: {
    temperatureDays: number;
    rainfallDays: number;
    monthlySummaryMonths: number;
    firstTemperatureDate: string | null;
    latestTemperatureDate: string | null;
    firstRainfallDate: string | null;
    latestRainfallDate: string | null;
    yearsCovered: number;
  };
  temperature: {
    dailyExtremes: {
      highestDailyMaximum: RecordValue | null;
      lowestDailyMaximum: RecordValue | null;
      highestDailyMinimum: RecordValue | null;
      lowestDailyMinimum: RecordValue | null;
      largestDailyRange: {
        difference: number;
        maximumTemperature: number | null;
        minimumTemperature: number | null;
        year: number;
        label: string;
      } | null;
      smallestDailyRange: {
        difference: number;
        year: number;
        label: string;
      } | null;
    };
    annualExtremes: {
      warmestYear: RankingRow | null;
      coldestYear: RankingRow | null;
      highestAnnualMeanMaximum: RankingRow | null;
      lowestAnnualMeanMaximum: RankingRow | null;
      highestAnnualMeanMinimum: RankingRow | null;
      lowestAnnualMeanMinimum: RankingRow | null;
    };
    monthlyClimatology: Array<{
      month: number;
      monthName: string;
      averageMaximum: number | null;
      averageMinimum: number | null;
      averageMean: number | null;
      recordHigh: RecordValue | null;
      recordLow: RecordValue | null;
    }>;
    monthlyRankings: {
      warmest: Array<{ month: number; monthName: string; rows: Array<RankingRow & { label: string }> }>;
      coldest: Array<{ month: number; monthName: string; rows: Array<RankingRow & { label: string }> }>;
    };
    dayOfYearClimatology: Array<{
      month: number;
      day: number;
      label: string;
      averageMax: number | null;
      averageMin: number | null;
      yearsAbove20: number;
      yearsAbove25: number;
      yearsAbove30: number;
      frostYears: number;
    }>;
    thresholdStats: {
      maxTemperatureDays: Array<{ threshold: number; count: number }>;
      minimumTemperature: Array<{ threshold: number; count: number }>;
      warmNights: Array<{ threshold: number; count: number }>;
      frostDays: number;
      iceDays: number;
    };
    streaks: Array<{
      label: string;
      length: number;
      startDate: string | null;
      endDate: string | null;
      year: number | null;
    }>;
    earliestLatestEvents: Record<string, unknown>;
  };
  rainfall: {
    extremes: {
      wettestDay: RecordValue | null;
      wettestMonth: RecordValue | null;
      driestMonth: RecordValue | null;
      wettestYear: RankingRow | null;
      driestYear: RankingRow | null;
    };
    spells: {
      longestDrySpell: { length: number; startDate: string | null; endDate: string | null };
      longestWetSpell: { length: number; startDate: string | null; endDate: string | null };
    };
    rainDayCounts: Array<{ threshold: number; count: number }>;
  };
  monthlySummary: {
    latestEntries: Array<{
      year: number;
      month: number;
      highestPressure: number | null;
      lowestPressure: number | null;
      highestWindGust: number | null;
      lightningCount: number | null;
      thunderDays: number | null;
    }>;
    extremes: {
      highestPressure: RecordValue | null;
      lowestPressure: RecordValue | null;
      highestWindGust: RecordValue | null;
      highestLightningCount: RecordValue | null;
      mostThunderDaysMonth: RecordValue | null;
      mostThunderDaysYear: RankingRow | null;
    };
  };
  rankings: Record<string, RankingRow[]>;
  comparisons: {
    currentYear: number;
    availableYears: number[];
    temperatureYtd: ChartRow[];
    rainfallYtd: ChartRow[];
  };
  recordHistory: Array<{
    category: string;
    label: string;
    value: number;
    date: string;
    year: number;
    previousValue: number | null;
    previousDate: string | null;
    isLatest: boolean;
  }>;
  ai: {
    prompts: string[];
    generatedSummaries: string[];
  };
};

type ImportResult = {
  imported: number;
  duplicates: number;
  rejected: number;
  missingData: number;
  issues: Array<{ row: number; field: string; message: string }>;
  report: { dateRange: { start: string | null; end: string | null } };
};

type MonthlyFormState = {
  year: string;
  month: string;
  highestPressure: string;
  lowestPressure: string;
  highestWindGust: string;
  lightningCount: string;
  thunderDays: string;
};

const NAV_ITEMS = [
  { path: '/', label: 'Overview', icon: '⌂' },
  { path: '/data-hub', label: 'Data Hub', icon: '⇪' },
  { path: '/climate/extremes/temperature', label: 'Temperature Extremes', icon: '🌡' },
  { path: '/climate/extremes/rainfall', label: 'Rainfall Extremes', icon: '🌧' },
  { path: '/climate/monthly-climatology', label: 'Monthly Climatology', icon: '◫' },
  { path: '/climate/rankings', label: 'Rankings', icon: '▣' },
  { path: '/climate/comparisons', label: 'Comparisons', icon: '↗' },
  { path: '/climate/assistant', label: 'AI Assistant', icon: '✦' },
  { path: '/isobront', label: 'Isobront', icon: '⚡' }
] as const;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SAVED_ARTICLES_KEY = 'wakefield-climate-articles';

const toTemperatureColor = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '#dbe3f4';
  if (value < -10) return '#7c3aed';
  if (value < 0) return '#2563eb';
  if (value < 10) return '#22d3ee';
  if (value < 20) return '#16a34a';
  if (value < 25) return '#facc15';
  if (value < 30) return '#fb923c';
  if (value < 35) return '#ef4444';
  return '#7f1d1d';
};

const formatNumber = (value: number | null | undefined, suffix = '') =>
  value === null || value === undefined ? '—' : `${value}${suffix}`;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string; issues?: string[] };
    throw new Error(body.message ?? body.issues?.join(', ') ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

const parseCsv = async (file: File): Promise<Record<string, string>[]> => {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return parsed.data;
};

const toDateFromParts = (row: Record<string, string>, keys: { date: string[]; year: string[]; month: string[]; day: string[] }) => {
  const find = (candidates: string[]) => {
    const key = Object.keys(row).find((entry) => candidates.includes(entry.toLowerCase().trim()));
    return key ? row[key]?.trim() : '';
  };
  const directDate = find(keys.date);
  if (directDate) return directDate;
  const year = find(keys.year);
  const month = find(keys.month);
  const day = find(keys.day);
  if (!year || !month || !day) return '';
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
};

const toNumber = (value: string | undefined) => {
  if (!value?.trim()) return null;
  const numeric = Number(value.trim());
  return Number.isFinite(numeric) ? numeric : null;
};

const getPath = () => `${window.location.hash.replace(/^#/, '') || '/'}`;

const ComparisonChart = ({
  title,
  subtitle,
  data,
  currentYear,
  years,
  unit
}: {
  title: string;
  subtitle: string;
  data: ChartRow[];
  currentYear: number;
  years: number[];
  unit: string;
}) => (
  <PanelCard title={title} subtitle={subtitle}>
    <div className="chart-shell">
      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#dbe3f4" strokeDasharray="3 3" />
          <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 12 }} />
          <YAxis stroke="#64748b" tick={{ fontSize: 12 }} width={64} unit={unit} />
          <Tooltip />
          <Legend />
          {years.filter((year) => year !== currentYear).map((year) => (
            <Line key={year} type="monotone" dataKey={String(year)} stroke="#94a3b8" dot={false} strokeWidth={1.2} />
          ))}
          <Line type="monotone" dataKey="average" stroke="#2563eb" dot={false} strokeWidth={2.2} name="Archive average" />
          <Line
            type="monotone"
            dataKey={String(currentYear)}
            stroke="#ef4444"
            strokeWidth={3}
            dot={{ r: 3, fill: '#ef4444' }}
            name={`${currentYear} current year`}
          />
          <Brush dataKey="month" height={18} stroke="#7c3aed" travellerWidth={10} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </PanelCard>
);

const RankingTable = ({ rows, label }: { rows: RankingRow[]; label: string }) => (
  <PanelCard title={label} subtitle="Sorted automatically from the archive engine.">
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Year</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((row) => (
            <tr key={`${label}-${row.year}`}>
              <td>{row.rank}</td>
              <td>{row.year}</td>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </PanelCard>
);

const SavedArticles = ({ saved, onDelete }: { saved: string[]; onDelete: (index: number) => void }) => (
  <PanelCard title="Saved climate articles" subtitle="Useful AI-ready summaries can be kept as permanent notes in the browser.">
    {saved.length === 0 ? (
      <p className="panel-copy">No saved climate articles yet.</p>
    ) : (
      <div className="saved-articles">
        {saved.map((entry, index) => (
          <article key={`${index}-${entry.slice(0, 12)}`} className="saved-article">
            <p>{entry}</p>
            <button type="button" className="button button--ghost" onClick={() => onDelete(index)}>
              Remove
            </button>
          </article>
        ))}
      </div>
    )}
  </PanelCard>
);

export const ClimatePlatformPage = () => {
  const [path, setPath] = useState(getPath());
  const [data, setData] = useState<ClimateOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [temperatureImport, setTemperatureImport] = useState<ImportResult | null>(null);
  const [rainfallImport, setRainfallImport] = useState<ImportResult | null>(null);
  const [monthlyStatus, setMonthlyStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [savedArticles, setSavedArticles] = useState<string[]>(() => {
    const existing = window.localStorage.getItem(SAVED_ARTICLES_KEY);
    return existing ? (JSON.parse(existing) as string[]) : [];
  });
  const [selectedMonth, setSelectedMonth] = useState(0);
  const [rankingKey, setRankingKey] = useState('warmestYears');
  const [monthlyForm, setMonthlyForm] = useState<MonthlyFormState>({
    year: String(new Date().getFullYear()),
    month: String(new Date().getMonth() + 1),
    highestPressure: '',
    lowestPressure: '',
    highestWindGust: '',
    lightningCount: '',
    thunderDays: ''
  });

  useEffect(() => {
    const onHashChange = () => setPath(getPath());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await apiFetch<ClimateOverview>('/api/climate-platform/overview');
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load archive');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SAVED_ARTICLES_KEY, JSON.stringify(savedArticles));
  }, [savedArticles]);

  const selectedMonthWarm = data?.temperature.monthlyRankings.warmest[selectedMonth] ?? null;
  const selectedMonthCold = data?.temperature.monthlyRankings.coldest[selectedMonth] ?? null;
  const selectedMonthClimatology = data?.temperature.monthlyClimatology[selectedMonth] ?? null;

  const rankingEntries = useMemo(() => {
    if (!data) return [] as RankingRow[];
    return data.rankings[rankingKey] ?? [];
  }, [data, rankingKey]);

  const handleTemperatureUpload = async (file: File) => {
    setBusy('temperature');
    setTemperatureImport(null);
    try {
      const rows = await parseCsv(file);
      const payload = rows.map((row) => ({
        observed_date: toDateFromParts(row, {
          date: ['date'],
          year: ['year'],
          month: ['month'],
          day: ['day']
        }),
        tmax: toNumber(row[Object.keys(row).find((key) => ['maximum temperature', 'max temperature', 'maximum_temperature', 'tmax'].includes(key.toLowerCase().trim())) ?? '']),
        tmin: toNumber(row[Object.keys(row).find((key) => ['minimum temperature', 'min temperature', 'minimum_temperature', 'tmin'].includes(key.toLowerCase().trim())) ?? '']),
        source: file.name
      }));
      const result = await apiFetch<ImportResult>('/api/climate-platform/import/temperature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload })
      });
      setTemperatureImport(result);
      await refresh();
    } catch (err) {
      setTemperatureImport({ imported: 0, duplicates: 0, rejected: 1, missingData: 0, issues: [{ row: 0, field: 'file', message: err instanceof Error ? err.message : 'Upload failed' }], report: { dateRange: { start: null, end: null } } });
    } finally {
      setBusy(null);
    }
  };

  const handleRainfallUpload = async (file: File) => {
    setBusy('rainfall');
    setRainfallImport(null);
    try {
      const rows = await parseCsv(file);
      const payload = rows.map((row) => ({
        observed_date: toDateFromParts(row, {
          date: ['date'],
          year: ['year'],
          month: ['month'],
          day: ['day']
        }),
        rainfall_total: toNumber(row[Object.keys(row).find((key) => ['rainfall total', 'rainfall_total', 'rainfall', 'precipitation'].includes(key.toLowerCase().trim())) ?? '']),
        source: file.name
      }));
      const result = await apiFetch<ImportResult>('/api/climate-platform/import/rainfall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload })
      });
      setRainfallImport(result);
      await refresh();
    } catch (err) {
      setRainfallImport({ imported: 0, duplicates: 0, rejected: 1, missingData: 0, issues: [{ row: 0, field: 'file', message: err instanceof Error ? err.message : 'Upload failed' }], report: { dateRange: { start: null, end: null } } });
    } finally {
      setBusy(null);
    }
  };

  const submitMonthlySummary = async () => {
    setBusy('monthly');
    setMonthlyStatus(null);
    try {
      await apiFetch<{ ok: boolean }>('/api/climate-platform/monthly-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: Number(monthlyForm.year),
          month: Number(monthlyForm.month),
          highestPressure: toNumber(monthlyForm.highestPressure),
          lowestPressure: toNumber(monthlyForm.lowestPressure),
          highestWindGust: toNumber(monthlyForm.highestWindGust),
          lightningCount: toNumber(monthlyForm.lightningCount),
          thunderDays: toNumber(monthlyForm.thunderDays)
        })
      });
      setMonthlyStatus('Monthly summary saved and ready for immediate climate analysis.');
      await refresh();
    } catch (err) {
      setMonthlyStatus(err instanceof Error ? err.message : 'Failed to save monthly summary.');
    } finally {
      setBusy(null);
    }
  };

  const saveArticle = (text: string) => setSavedArticles((current) => (current.includes(text) ? current : [text, ...current]));
  const removeArticle = (index: number) => setSavedArticles((current) => current.filter((_, entryIndex) => entryIndex !== index));

  if (loading) {
    return <div className="loading-state">Loading climatology archive…</div>;
  }

  if (error || !data) {
    return (
      <div className="climate-app">
        <aside className="climate-sidebar">
          <div className="brand-block">
            <div className="brand-mark">⛅</div>
            <div>
              <h1>Wakefield Climatology Platform</h1>
              <p>Professional archive · extremes · rankings · comparisons</p>
            </div>
          </div>
          <div className="sidebar-pill-group">
            <span className="sidebar-pill">White · blue · purple premium theme</span>
            <span className="sidebar-pill sidebar-pill--secondary">Climate engine recalculates automatically</span>
          </div>
          <nav className="climate-nav">
            {NAV_ITEMS.map((item) => (
              <a key={item.path} href={`#${item.path}`}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </a>
            ))}
          </nav>
        </aside>
        <main className="climate-content">
          <header className="hero-panel">
            <div>
              <span className="hero-kicker">Climate → Extremes Centre → Temperature / Rainfall</span>
              <h2>Personal climate archive for decades of future data</h2>
              <p>
                Daily weather history, monthly climate, annual climate, records, extremes, rankings,
                trends, comparisons and AI-ready climate analysis from a minimal manual data model.
              </p>
            </div>
          </header>
          <PanelCard title="Archive not connected" subtitle="The climate archive backend is not reachable. Start the backend service to load the climate data.">
            <p className="panel-copy">{error ?? 'Failed to load climate archive.'}</p>
            <div className="button-row">
              <button type="button" className="button" onClick={() => void refresh()}>
                Retry connection
              </button>
            </div>
          </PanelCard>
        </main>
      </div>
    );
  }

  const overviewMetrics = [
    {
      label: 'Temperature archive',
      value: `${data.dataStatus.temperatureDays} days`,
      trend: `${data.station.temperatureCoverageStart} onwards`,
      tone: 'temperature' as const
    },
    {
      label: 'Rainfall archive',
      value: `${data.dataStatus.rainfallDays} days`,
      trend: `${data.station.rainfallCoverageStart} onwards`,
      tone: 'rain' as const
    },
    {
      label: 'Monthly summaries',
      value: `${data.dataStatus.monthlySummaryMonths} months`,
      trend: 'Pressure · wind · lightning · thunder',
      tone: 'pressure' as const
    },
    {
      label: 'Years covered',
      value: String(data.dataStatus.yearsCovered),
      trend: 'Automatic climate engine active',
      tone: 'lightning' as const
    }
  ];

  const renderOverview = () => (
    <>
      <section className="metrics-grid">
        {overviewMetrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>
      <section className="page-grid page-grid--two">
        <PanelCard title="Climate archive mission" subtitle="A professional climatology platform built around essential long-term data entry.">
          <ul className="feature-list">
            <li>Daily temperature archive with max/min coverage from 1995 onwards.</li>
            <li>Daily rainfall archive from 2020 onwards.</li>
            <li>Monthly manual summary fields for pressure, wind gust, lightning and thunder days.</li>
            <li>Automatic recalculation of extremes, climatology, streaks, rankings, comparisons and record history.</li>
          </ul>
        </PanelCard>
        <PanelCard title="Current archive highlights" subtitle="Key all-time records recalculated from the source tables.">
          <div className="highlight-grid">
            <div className="highlight-card" style={{ borderColor: toTemperatureColor(data.temperature.dailyExtremes.highestDailyMaximum?.value) }}>
              <span>Highest daily maximum</span>
              <strong>{formatNumber(data.temperature.dailyExtremes.highestDailyMaximum?.value, '°C')}</strong>
              <small>{data.temperature.dailyExtremes.highestDailyMaximum?.label ?? '—'}</small>
            </div>
            <div className="highlight-card">
              <span>Lowest daily minimum</span>
              <strong>{formatNumber(data.temperature.dailyExtremes.lowestDailyMinimum?.value, '°C')}</strong>
              <small>{data.temperature.dailyExtremes.lowestDailyMinimum?.label ?? '—'}</small>
            </div>
            <div className="highlight-card">
              <span>Wettest day</span>
              <strong>{formatNumber(data.rainfall.extremes.wettestDay?.value, ' mm')}</strong>
              <small>{data.rainfall.extremes.wettestDay?.label ?? '—'}</small>
            </div>
            <div className="highlight-card">
              <span>Warmest year</span>
              <strong>{formatNumber(data.temperature.annualExtremes.warmestYear?.value, '°C')}</strong>
              <small>{data.temperature.annualExtremes.warmestYear?.year ?? '—'}</small>
            </div>
          </div>
        </PanelCard>
      </section>
      <ComparisonChart
        title="Year-to-date temperature comparison"
        subtitle="Current year in red, all previous years in grey, archive mean in blue."
        data={data.comparisons.temperatureYtd}
        currentYear={data.comparisons.currentYear}
        years={data.comparisons.availableYears}
        unit="°C"
      />
      <ComparisonChart
        title="Year-to-date rainfall comparison"
        subtitle="Cumulative rainfall progression against the historical archive."
        data={data.comparisons.rainfallYtd}
        currentYear={data.comparisons.currentYear}
        years={data.comparisons.availableYears}
        unit="mm"
      />
      <IsobrontChat />
    </>
  );

  const renderIsobront = () => (
    <IsobrontChat />
  );

  const renderDataHub = () => (
    <section className="page-grid page-grid--two">
      <PanelCard title="Daily temperature import" subtitle="Upload CSV rows containing Date, Year/Month/Day, Maximum temperature and Minimum temperature.">
        <label className="upload-card">
          <input type="file" accept=".csv" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleTemperatureUpload(file);
          }} />
          <span>{busy === 'temperature' ? 'Importing temperature archive…' : 'Choose temperature CSV'}</span>
        </label>
        {temperatureImport ? (
          <ul className="status-list">
            <li><span>Imported</span><strong>{temperatureImport.imported}</strong></li>
            <li><span>Updated</span><strong>{temperatureImport.duplicates}</strong></li>
            <li><span>Rejected</span><strong>{temperatureImport.rejected}</strong></li>
          </ul>
        ) : null}
      </PanelCard>
      <PanelCard title="Daily rainfall import" subtitle="Upload CSV rows containing Date and Rainfall total for the climate rainfall archive.">
        <label className="upload-card">
          <input type="file" accept=".csv" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleRainfallUpload(file);
          }} />
          <span>{busy === 'rainfall' ? 'Importing rainfall archive…' : 'Choose rainfall CSV'}</span>
        </label>
        {rainfallImport ? (
          <ul className="status-list">
            <li><span>Imported</span><strong>{rainfallImport.imported}</strong></li>
            <li><span>Updated</span><strong>{rainfallImport.duplicates}</strong></li>
            <li><span>Rejected</span><strong>{rainfallImport.rejected}</strong></li>
          </ul>
        ) : null}
      </PanelCard>
      <PanelCard title="Monthly summary entry" subtitle="Store pressure, gust, lightning and thunder-day maxima once per month.">
        <div className="form-grid">
          {[
            ['Year', 'year'],
            ['Month', 'month'],
            ['Highest pressure', 'highestPressure'],
            ['Lowest pressure', 'lowestPressure'],
            ['Highest wind gust', 'highestWindGust'],
            ['Lightning count', 'lightningCount'],
            ['Thunder days', 'thunderDays']
          ].map(([label, key]) => (
            <label key={key}>
              <span>{label}</span>
              <input
                value={monthlyForm[key as keyof MonthlyFormState]}
                onChange={(event) => setMonthlyForm((current) => ({ ...current, [key]: event.target.value }))}
              />
            </label>
          ))}
        </div>
        <div className="button-row">
          <button type="button" className="button" onClick={() => void submitMonthlySummary()} disabled={busy === 'monthly'}>
            {busy === 'monthly' ? 'Saving…' : 'Save monthly summary'}
          </button>
          {monthlyStatus ? <span className="form-status">{monthlyStatus}</span> : null}
        </div>
      </PanelCard>
      <PanelCard title="Manual datasets only" subtitle="This platform keeps the input workload intentionally small.">
        <ul className="feature-list">
          <li>Daily temperatures: date, year, month, day, maximum and minimum temperature.</li>
          <li>Daily rainfall: date, year, month, day and rainfall total.</li>
          <li>Monthly summaries only for pressure, highest gust, lightning count and thunder days.</li>
          <li>No daily manual pressure, humidity, wind or lightning entry is required.</li>
        </ul>
      </PanelCard>
    </section>
  );

  const renderTemperature = () => (
    <>
      <section className="metrics-grid">
        <MetricCard label="Highest daily maximum" value={formatNumber(data.temperature.dailyExtremes.highestDailyMaximum?.value, '°C')} trend={data.temperature.dailyExtremes.highestDailyMaximum?.label} tone="temperature" />
        <MetricCard label="Lowest daily minimum" value={formatNumber(data.temperature.dailyExtremes.lowestDailyMinimum?.value, '°C')} trend={data.temperature.dailyExtremes.lowestDailyMinimum?.label} tone="temperature" />
        <MetricCard label="Largest daily range" value={formatNumber(data.temperature.dailyExtremes.largestDailyRange?.difference, '°C')} trend={data.temperature.dailyExtremes.largestDailyRange?.label} tone="temperature" />
        <MetricCard label="Warmest year" value={formatNumber(data.temperature.annualExtremes.warmestYear?.value, '°C')} trend={String(data.temperature.annualExtremes.warmestYear?.year ?? '—')} tone="temperature" />
      </section>
      <section className="page-grid page-grid--two">
        <PanelCard title="All-time daily extremes" subtitle="Professional record cards for the daily temperature archive.">
          <div className="key-value-grid">
            {[
              ['Highest daily maximum', `${formatNumber(data.temperature.dailyExtremes.highestDailyMaximum?.value, '°C')} · ${data.temperature.dailyExtremes.highestDailyMaximum?.label ?? '—'}`],
              ['Lowest daily maximum', `${formatNumber(data.temperature.dailyExtremes.lowestDailyMaximum?.value, '°C')} · ${data.temperature.dailyExtremes.lowestDailyMaximum?.label ?? '—'}`],
              ['Highest daily minimum', `${formatNumber(data.temperature.dailyExtremes.highestDailyMinimum?.value, '°C')} · ${data.temperature.dailyExtremes.highestDailyMinimum?.label ?? '—'}`],
              ['Lowest daily minimum', `${formatNumber(data.temperature.dailyExtremes.lowestDailyMinimum?.value, '°C')} · ${data.temperature.dailyExtremes.lowestDailyMinimum?.label ?? '—'}`],
              ['Largest daily range', `${formatNumber(data.temperature.dailyExtremes.largestDailyRange?.difference, '°C')} · ${data.temperature.dailyExtremes.largestDailyRange?.label ?? '—'}`],
              ['Smallest daily range', `${formatNumber(data.temperature.dailyExtremes.smallestDailyRange?.difference, '°C')} · ${data.temperature.dailyExtremes.smallestDailyRange?.label ?? '—'}`]
            ].map(([label, value]) => (
              <div key={label} className="key-value-card">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </PanelCard>
        <PanelCard title="Annual temperature extremes" subtitle="Warmest/coldest years and annual mean maximum/minimum records.">
          <div className="table-shell">
            <table>
              <tbody>
                {[
                  { label: 'Warmest year', record: data.temperature.annualExtremes.warmestYear },
                  { label: 'Coldest year', record: data.temperature.annualExtremes.coldestYear },
                  { label: 'Highest annual mean maximum', record: data.temperature.annualExtremes.highestAnnualMeanMaximum },
                  { label: 'Lowest annual mean maximum', record: data.temperature.annualExtremes.lowestAnnualMeanMaximum },
                  { label: 'Highest annual mean minimum', record: data.temperature.annualExtremes.highestAnnualMeanMinimum },
                  { label: 'Lowest annual mean minimum', record: data.temperature.annualExtremes.lowestAnnualMeanMinimum }
                ].map(({ label, record }) => (
                  <tr key={label}>
                    <th>{label}</th>
                    <td>{record ? `${record.value} · ${record.year}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelCard>
      </section>
      <section className="page-grid page-grid--two">
        <PanelCard title="Threshold statistics" subtitle="Automatic counts for heat, frost, ice and warm-night events.">
          <div className="threshold-grid">
            {data.temperature.thresholdStats.maxTemperatureDays.map((entry) => (
              <div key={`max-${entry.threshold}`} className="threshold-card">
                <span>Max ≥ {entry.threshold}°C</span>
                <strong>{entry.count}</strong>
              </div>
            ))}
            {data.temperature.thresholdStats.minimumTemperature.map((entry) => (
              <div key={`min-${entry.threshold}`} className="threshold-card">
                <span>Min {'<'} {entry.threshold}°C</span>
                <strong>{entry.count}</strong>
              </div>
            ))}
            {data.temperature.thresholdStats.warmNights.map((entry) => (
              <div key={`warm-${entry.threshold}`} className="threshold-card">
                <span>Warm nights ≥ {entry.threshold}°C</span>
                <strong>{entry.count}</strong>
              </div>
            ))}
            <div className="threshold-card"><span>Frost days</span><strong>{data.temperature.thresholdStats.frostDays}</strong></div>
            <div className="threshold-card"><span>Ice days</span><strong>{data.temperature.thresholdStats.iceDays}</strong></div>
          </div>
        </PanelCard>
        <PanelCard title="Streak analysis" subtitle="Longest heat, frost and freezing runs across the archive.">
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Statistic</th>
                  <th>Length</th>
                  <th>Start</th>
                  <th>End</th>
                </tr>
              </thead>
              <tbody>
                {data.temperature.streaks.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.length}</td>
                    <td>{row.startDate ?? '—'}</td>
                    <td>{row.endDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelCard>
      </section>
    </>
  );

  const renderRainfall = () => (
    <>
      <section className="metrics-grid">
        <MetricCard label="Wettest day" value={formatNumber(data.rainfall.extremes.wettestDay?.value, ' mm')} trend={data.rainfall.extremes.wettestDay?.label} tone="rain" />
        <MetricCard label="Wettest month" value={formatNumber(data.rainfall.extremes.wettestMonth?.value, ' mm')} trend={data.rainfall.extremes.wettestMonth?.label} tone="rain" />
        <MetricCard label="Wettest year" value={formatNumber(data.rainfall.extremes.wettestYear?.value, ' mm')} trend={String(data.rainfall.extremes.wettestYear?.year ?? '—')} tone="rain" />
        <MetricCard label="Longest dry spell" value={`${data.rainfall.spells.longestDrySpell.length} days`} trend={data.rainfall.spells.longestDrySpell.startDate ?? '—'} tone="rain" />
      </section>
      <section className="page-grid page-grid--two">
        <PanelCard title="Rainfall extremes centre" subtitle="Wettest and driest monthly and annual archive metrics.">
          <div className="key-value-grid">
            {[
              ['Wettest day', `${formatNumber(data.rainfall.extremes.wettestDay?.value, ' mm')} · ${data.rainfall.extremes.wettestDay?.label ?? '—'}`],
              ['Wettest month', `${formatNumber(data.rainfall.extremes.wettestMonth?.value, ' mm')} · ${data.rainfall.extremes.wettestMonth?.label ?? '—'}`],
              ['Driest month', `${formatNumber(data.rainfall.extremes.driestMonth?.value, ' mm')} · ${data.rainfall.extremes.driestMonth?.label ?? '—'}`],
              ['Wettest year', `${formatNumber(data.rainfall.extremes.wettestYear?.value, ' mm')} · ${data.rainfall.extremes.wettestYear?.year ?? '—'}`],
              ['Driest year', `${formatNumber(data.rainfall.extremes.driestYear?.value, ' mm')} · ${data.rainfall.extremes.driestYear?.year ?? '—'}`],
              ['Longest wet spell', `${data.rainfall.spells.longestWetSpell.length} days · ${data.rainfall.spells.longestWetSpell.startDate ?? '—'}`]
            ].map(([label, value]) => (
              <div key={label} className="key-value-card">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </PanelCard>
        <PanelCard title="Rain day thresholds" subtitle="Automatic rain-day counts using the climate archive rainfall totals.">
          <div className="threshold-grid">
            {data.rainfall.rainDayCounts.map((entry) => (
              <div key={entry.threshold} className="threshold-card">
                <span>Rain {'>'} {entry.threshold} mm</span>
                <strong>{entry.count}</strong>
              </div>
            ))}
          </div>
        </PanelCard>
      </section>
      <PanelCard title="Monthly summary extremes" subtitle="Manual end-of-month datasets feed a separate extremes centre.">
        <div className="table-shell">
          <table>
            <tbody>
              {[
                { label: 'Highest pressure', record: data.monthlySummary.extremes.highestPressure },
                { label: 'Lowest pressure', record: data.monthlySummary.extremes.lowestPressure },
                { label: 'Highest wind gust', record: data.monthlySummary.extremes.highestWindGust },
                { label: 'Highest monthly lightning count', record: data.monthlySummary.extremes.highestLightningCount },
                { label: 'Most thunder days in a month', record: data.monthlySummary.extremes.mostThunderDaysMonth },
                { label: 'Most thunder days in a year', record: data.monthlySummary.extremes.mostThunderDaysYear }
              ].map(({ label, record }) => (
                <tr key={label}>
                  <th>{label}</th>
                  <td>
                    {record
                      ? `${record.value} · ${'month' in record && record.month ? `${record.month} ` : ''}${record.year}`.trim()
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>
    </>
  );

  const renderMonthlyClimatology = () => (
    <>
      <PanelCard title="Monthly climatology" subtitle="Average maximum, minimum and mean temperature by calendar month, with record high and low anchors.">
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Avg max</th>
                <th>Avg min</th>
                <th>Avg mean</th>
                <th>Record high</th>
                <th>Record low</th>
              </tr>
            </thead>
            <tbody>
              {data.temperature.monthlyClimatology.map((row) => (
                <tr key={row.month}>
                  <td>{row.monthName}</td>
                  <td>{formatNumber(row.averageMaximum, '°C')}</td>
                  <td>{formatNumber(row.averageMinimum, '°C')}</td>
                  <td>{formatNumber(row.averageMean, '°C')}</td>
                  <td>{row.recordHigh ? `${row.recordHigh.value}°C · ${row.recordHigh.year}` : '—'}</td>
                  <td>{row.recordLow ? `${row.recordLow.value}°C · ${row.recordLow.year}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>
      <section className="page-grid page-grid--two">
        <PanelCard title="Monthly rankings" subtitle="Warmest and coldest month rankings update automatically.">
          <div className="button-row button-row--wrap">
            {MONTH_NAMES.map((name, index) => (
              <button
                key={name}
                type="button"
                className={`button button--ghost${selectedMonth === index ? ' button--active' : ''}`}
                onClick={() => setSelectedMonth(index)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th colSpan={2}>{selectedMonthClimatology?.monthName} warmest</th>
                  <th colSpan={2}>{selectedMonthClimatology?.monthName} coldest</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: Math.max(selectedMonthWarm?.rows.slice(0, 8).length ?? 0, selectedMonthCold?.rows.slice(0, 8).length ?? 0) }).map((_, index) => (
                  <tr key={index}>
                    <td>{selectedMonthWarm?.rows[index]?.rank ?? '—'}</td>
                    <td>{selectedMonthWarm?.rows[index] ? `${selectedMonthWarm.rows[index].label} · ${selectedMonthWarm.rows[index].value}°C` : '—'}</td>
                    <td>{selectedMonthCold?.rows[index]?.rank ?? '—'}</td>
                    <td>{selectedMonthCold?.rows[index] ? `${selectedMonthCold.rows[index].label} · ${selectedMonthCold.rows[index].value}°C` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PanelCard>
        <PanelCard title="Day-of-year climatology heatmap" subtitle="Average daily thermal behaviour across every calendar day in the archive.">
          <div className="heatmap-grid">
            {data.temperature.dayOfYearClimatology.map((entry) => {
              const averageMean = entry.averageMax !== null && entry.averageMin !== null ? (entry.averageMax + entry.averageMin) / 2 : null;
              return (
                <div
                  key={`${entry.month}-${entry.day}`}
                  className="heatmap-cell"
                  style={{ background: toTemperatureColor(averageMean) }}
                  title={`${entry.label}: avg max ${formatNumber(entry.averageMax, '°C')}, avg min ${formatNumber(entry.averageMin, '°C')}`}
                >
                  {entry.day}
                </div>
              );
            })}
          </div>
        </PanelCard>
      </section>
    </>
  );

  const renderRankings = () => (
    <>
      <PanelCard title="Climate rankings" subtitle="Sort warm, cold, wet and event-based rankings directly from the archive tables.">
        <div className="button-row button-row--wrap">
          {[
            ['warmestYears', 'Warmest years'],
            ['coldestYears', 'Coldest years'],
            ['wettestYears', 'Wettest years'],
            ['driestYears', 'Driest years'],
            ['mostFrostDays', 'Most frost days'],
            ['mostHotDays', 'Most hot days'],
            ['most30cDays', 'Most 30°C days'],
            ['mostThunderDays', 'Most thunder days'],
            ['highestLightningYears', 'Highest lightning years']
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`button button--ghost${rankingKey === key ? ' button--active' : ''}`}
              onClick={() => setRankingKey(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </PanelCard>
      <RankingTable rows={rankingEntries} label={rankingKey.replace(/([A-Z])/g, ' $1').trim()} />
      <PanelCard title="Record system timeline" subtitle="Automatic record chronology with NEW RECORD flags for the latest value in each category.">
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Record</th>
                <th>Date</th>
                <th>Previous</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.recordHistory.slice(-12).reverse().map((row) => (
                <tr key={`${row.category}-${row.date}-${row.value}`}>
                  <td>{row.category}</td>
                  <td>{row.label}: {row.value}</td>
                  <td>{row.date}</td>
                  <td>{row.previousValue ?? '—'}{row.previousDate ? ` · ${row.previousDate}` : ''}</td>
                  <td>{row.isLatest ? <span className="record-badge">NEW RECORD</span> : 'Historical'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>
    </>
  );

  const renderAssistant = () => (
    <>
      <section className="page-grid page-grid--two">
        <PanelCard title="AI-ready climate prompts" subtitle="Calculated statistics are exposed through stable question-ready summaries.">
          <div className="prompt-list">
            {data.ai.prompts.map((prompt) => (
              <div key={prompt} className="prompt-chip">{prompt}</div>
            ))}
          </div>
        </PanelCard>
        <PanelCard title="Generated archive summaries" subtitle="Save any useful response as a permanent climate article card.">
          <div className="saved-articles">
            {data.ai.generatedSummaries.map((summary) => (
              <article key={summary} className="saved-article">
                <p>{summary}</p>
                <button type="button" className="button" onClick={() => saveArticle(summary)}>
                  Save as article
                </button>
              </article>
            ))}
          </div>
        </PanelCard>
      </section>
      <SavedArticles saved={savedArticles} onDelete={removeArticle} />
    </>
  );

  const renderComparisons = () => (
    <>
      <ComparisonChart
        title="Temperature comparison analytics"
        subtitle="Red current year, grey all previous years, blue archive average with hover and brush controls."
        data={data.comparisons.temperatureYtd}
        currentYear={data.comparisons.currentYear}
        years={data.comparisons.availableYears}
        unit="°C"
      />
      <ComparisonChart
        title="Rainfall comparison analytics"
        subtitle="Cumulative rainfall trajectories for rapid year-to-date context."
        data={data.comparisons.rainfallYtd}
        currentYear={data.comparisons.currentYear}
        years={data.comparisons.availableYears}
        unit="mm"
      />
    </>
  );

  const renderContent = () => {
    switch (path) {
      case '/data-hub':
        return renderDataHub();
      case '/climate/extremes/temperature':
        return renderTemperature();
      case '/climate/extremes/rainfall':
        return renderRainfall();
      case '/climate/monthly-climatology':
        return renderMonthlyClimatology();
      case '/climate/rankings':
        return renderRankings();
      case '/climate/comparisons':
        return renderComparisons();
      case '/climate/assistant':
        return renderAssistant();
      case '/isobront':
        return renderIsobront();
      default:
        return renderOverview();
    }
  };

  return (
    <div className="climate-app">
      <aside className="climate-sidebar">
        <div className="brand-block">
          <div className="brand-mark">⛅</div>
          <div>
            <h1>Wakefield Climatology Platform</h1>
            <p>Professional archive · extremes · rankings · comparisons</p>
          </div>
        </div>
        <div className="sidebar-pill-group">
          <span className="sidebar-pill">White · blue · purple premium theme</span>
          <span className="sidebar-pill sidebar-pill--secondary">Climate engine recalculates automatically</span>
        </div>
        <nav className="climate-nav">
          {NAV_ITEMS.map((item) => (
            <a key={item.path} href={`#${item.path}`} className={path === item.path ? 'active' : ''}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar-meta">
          <strong>{data.station.stationId}</strong>
          <span>{data.station.timezone}</span>
          <span>{data.dataStatus.firstTemperatureDate ?? 'No temperature data'} → {data.dataStatus.latestTemperatureDate ?? '—'}</span>
        </div>
      </aside>
      <main className="climate-content">
        <header className="hero-panel">
          <div>
            <span className="hero-kicker">Climate → Extremes Centre → Temperature / Rainfall</span>
            <h2>Personal climate archive for decades of future data</h2>
            <p>
              Daily weather history, monthly climate, annual climate, records, extremes, rankings,
              trends, comparisons and AI-ready climate analysis from a minimal manual data model.
            </p>
          </div>
          <div className="hero-status">
            <div>
              <strong>{data.dataStatus.temperatureDays}</strong>
              <span>temperature rows</span>
            </div>
            <div>
              <strong>{data.dataStatus.rainfallDays}</strong>
              <span>rainfall rows</span>
            </div>
            <div>
              <strong>{data.dataStatus.monthlySummaryMonths}</strong>
              <span>monthly summaries</span>
            </div>
          </div>
        </header>
        {renderContent()}
      </main>
    </div>
  );
};
