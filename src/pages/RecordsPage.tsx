import { useMemo, type ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { WarmFrostSpellsChart } from '@/features/climateStats/WarmFrostSpellsChart'
import { Badge, ErrorState, ProvisionalBadge, Skeleton, TableWrapper } from '@/components/ui'
import {
  useClimateArchiveIndexQuery,
  useAnnualClimateQueries,
  useMonthlyNormalsQuery,
} from '@/hooks/usePublicWeatherQueries'
import {
  formatEuropeLondonDisplay,
  parseIsoClimateDate,
} from '@/lib/climate'
import { buildRecordsIndex, emptyRecordsIndex } from '@/features/records/analysis'
import {
  getDailyRankings,
  getCalendarDateRecords,
  getMonthlyRankings,
  getAnnualRankings,
  getThresholdSummary,
  getSpellSummary,
  getRecordProgression,
  getOverallRecords,
  getYearRecordCounts,
} from '@/features/records/calculations'
import {
  buildOverallRecordsCsv,
  buildDailyRankingsCsv,
  buildMonthlyRankingsCsv,
  buildAnnualRankingsCsv,
  buildProgressionCsv,
  buildThresholdCsv,
} from '@/features/records/csv'
import { downloadCsvBlob } from '@/features/climateArchive/csv'
import type {
  DailyMetric,
  MonthlyMetric,
  AnnualMetric,
  ProgressionMetric,
  SeasonFilter,
  OverallRecord,
  DailyRankEntry,
  MonthlyRankEntry,
  AnnualRankEntry,
  RecordProgressionSummary,
  SpellSummary,
  RecordsIndex,
} from '@/features/records/types'
import type { ClimateDateString } from '@/types/weather'

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const SHORT_DATE: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }

const TABS = [
  { id: 'overview',    label: 'Station Records' },
  { id: 'daily',       label: 'Daily Rankings' },
  { id: 'calendar',    label: 'Calendar Date' },
  { id: 'monthly',     label: 'Monthly Rankings' },
  { id: 'annual',      label: 'Annual Rankings' },
  { id: 'thresholds',  label: 'Thresholds' },
  { id: 'spells',      label: 'Spells' },
  { id: 'progression', label: 'Progression' },
] as const

type TabId = (typeof TABS)[number]['id']

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(date: ClimateDateString): string {
  return formatEuropeLondonDisplay(date, SHORT_DATE)
}

function archiveDatePath(date: ClimateDateString): string {
  const { year, month } = parseIsoClimateDate(date)
  return `/climate-archive?year=${year}&month=${month}`
}

function intOrNull(s: string | null): number | null {
  if (s == null || s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function floatOrDefault(s: string | null, def: number): number {
  if (s == null || s === '') return def
  const n = Number(s)
  return Number.isFinite(n) ? n : def
}

// ── Small shared UI components ────────────────────────────────────────────────

function RankCell({ rank }: { readonly rank: number }) {
  const cls =
    rank === 1
      ? 'records-rank-badge records-rank-1'
      : rank === 2
        ? 'records-rank-badge records-rank-2'
        : rank === 3
          ? 'records-rank-badge records-rank-3'
          : 'records-rank-badge'
  return <span className={cls}>{rank}</span>
}

function CsvButton({ label, onClick }: { readonly label: string; readonly onClick: () => void }) {
  return (
    <button type="button" className="button button-ghost" onClick={onClick}>
      ↓ {label}
    </button>
  )
}

interface RankingChartDatum {
  key: string
  label: string
  value: number
}

function RankingsBarChart({
  title,
  unit,
  entries,
  lowerIsBetter = false,
}: {
  readonly title: string
  readonly unit: string
  readonly entries: RankingChartDatum[]
  readonly lowerIsBetter?: boolean
}) {
  if (entries.length === 0) return null
  const values = entries.map((entry) => entry.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const headingId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-heading`

  return (
    <div className="records-ranking-chart" aria-labelledby={headingId}>
      <p id={headingId} className="visually-hidden">{title}</p>
      {entries.map((entry) => {
        const normalized = span === 0
          ? 1
          : lowerIsBetter
            ? (max - entry.value) / span
            : (entry.value - min) / span
        const pct = normalized * 100
        return (
          <div key={entry.key} className="records-ranking-chart-row">
            <span className="records-ranking-chart-label">{entry.label}</span>
            <div className="records-ranking-chart-track" aria-hidden="true">
              <div className="records-ranking-chart-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="records-ranking-chart-value">
              {entry.value.toFixed(1)} {unit}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function LoadingProgress({
  loaded,
  total,
}: {
  readonly loaded: number
  readonly total: number
}) {
  if (total === 0) return null
  const pct = total > 0 ? Math.round((loaded / total) * 100) : 0
  return (
    <div className="records-load-progress" role="status" aria-live="polite">
      <span>Loading archive: {loaded}/{total} years</span>
      <div className="records-load-progress-bar" aria-hidden="true">
        <div className="records-load-progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── 1. Overview tab ───────────────────────────────────────────────────────────

function OverviewTab({ index }: { readonly index: RecordsIndex }) {
  const records = useMemo(() => getOverallRecords(index), [index])

  function download() {
    downloadCsvBlob(buildOverallRecordsCsv(records), 'station-records.csv')
  }

  return (
    <section>
      <div className="records-section-header">
        <h2 className="records-section-title">Overall station records</h2>
        <CsvButton label="Export CSV" onClick={download} />
      </div>
      <p className="records-summary-text">
        Records are drawn from all {index.loadedYears.length} loaded years
        ({index.loadedYears[0]}–{index.loadedYears.at(-1)}). Only complete periods are eligible
        for warmest/coldest/wettest/driest month and year records. Rainfall records begin May 2020.
      </p>
      <div className="records-overall-grid">
        {records.map((rec) => (
          <OverallRecordCard key={rec.label} record={rec} />
        ))}
      </div>
    </section>
  )
}

function OverallRecordCard({ record }: { readonly record: OverallRecord }) {
  const value =
    record.value != null ? `${record.value.toFixed(1)} ${record.unit}` : '—'

  return (
    <div className="records-overall-card">
      <p className="records-overall-label">{record.label}</p>
      <p className="records-overall-value">{value}</p>
      <p className="records-overall-holders">
        {record.holders.length === 0 ? (
          <span>—</span>
        ) : (
          <>
            {record.holders.map((h, i) => (
              <span key={h.date}>
                {i > 0 ? ', ' : ''}
                <Link to={archiveDatePath(h.date)} className="link-focus">
                  {h.label}
                </Link>
              </span>
            ))}
            {record.note != null ? (
              <span style={{ display: 'block', marginTop: '0.2rem' }}>
                <em>{record.note}</em>
              </span>
            ) : null}
          </>
        )}
      </p>
    </div>
  )
}

// ── 2. Daily Rankings tab ─────────────────────────────────────────────────────

const DAILY_METRIC_LABELS: Record<DailyMetric, string> = {
  'highest-max': 'Highest daily maximum',
  'lowest-max':  'Lowest daily maximum',
  'highest-min': 'Highest daily minimum',
  'lowest-min':  'Lowest daily minimum',
  'highest-range': 'Highest diurnal range',
  'lowest-range':  'Lowest diurnal range',
  'wettest':     'Wettest days',
}

const DAILY_METRIC_UNIT: Record<DailyMetric, string> = {
  'highest-max': '°C',
  'lowest-max':  '°C',
  'highest-min': '°C',
  'lowest-min':  '°C',
  'highest-range': '°C',
  'lowest-range':  '°C',
  'wettest':     'mm',
}

function DailyRankingsTab({ index }: { readonly index: RecordsIndex }) {
  const [params, setParams] = useSearchParams()

  const metric = (params.get('dmetric') ?? 'highest-max') as DailyMetric
  const topN = intOrNull(params.get('dn')) ?? 10
  const month = intOrNull(params.get('dmonth'))
  const season = (params.get('dseason') ?? 'all') as SeasonFilter
  const yearFrom = intOrNull(params.get('dyearFrom'))
  const yearTo = intOrNull(params.get('dyearTo'))

  function set(key: string, value: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === '' || value === 'all' || value === 'null') {
        next.delete(key)
      } else {
        next.set(key, value)
      }
      next.set('tab', 'daily')
      return next
    }, { replace: true })
  }

  const entries = useMemo(
    () => getDailyRankings(index, metric, { month, season, yearFrom, yearTo }, topN),
    [index, metric, month, season, yearFrom, yearTo, topN],
  )

  function download() {
    downloadCsvBlob(
      buildDailyRankingsCsv(entries, DAILY_METRIC_LABELS[metric], DAILY_METRIC_UNIT[metric]),
      `daily-rankings-${metric}.csv`,
    )
  }

  function clearFilters() {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', 'daily')
      next.delete('dmetric')
      next.delete('dn')
      next.delete('dmonth')
      next.delete('dseason')
      next.delete('dyearFrom')
      next.delete('dyearTo')
      return next
    }, { replace: true })
  }

  const tiedCount = entries.filter((e) => entries.filter((x) => x.rank === e.rank).length > 1).length

  return (
    <section>
      <div className="records-section-header">
        <h2 className="records-section-title">Daily rankings</h2>
        <CsvButton label="Export CSV" onClick={download} />
      </div>

      <div className="records-filters">
        <label htmlFor="dmetric">Metric</label>
        <select
          id="dmetric"
          value={metric}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => set('dmetric', e.target.value)}
        >
          {(Object.keys(DAILY_METRIC_LABELS) as DailyMetric[]).map((m) => (
            <option key={m} value={m}>{DAILY_METRIC_LABELS[m]}</option>
          ))}
        </select>

        <label htmlFor="dn">Top</label>
        <input
          id="dn"
          type="number"
          min={1}
          max={200}
          value={topN}
          style={{ width: '4.5rem' }}
          onChange={(e: ChangeEvent<HTMLInputElement>) => set('dn', e.target.value)}
        />

        <label htmlFor="dmonth">Month</label>
        <select
          id="dmonth"
          value={month ?? ''}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => set('dmonth', e.target.value)}
        >
          <option value="">All months</option>
          {MONTH_NAMES.map((name, i) => (
            <option key={i + 1} value={i + 1}>{name}</option>
          ))}
        </select>

        <label htmlFor="dseason">Season</label>
        <select
          id="dseason"
          value={season}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => set('dseason', e.target.value)}
        >
          <option value="all">All seasons</option>
          <option value="winter">Winter (DJF)</option>
          <option value="spring">Spring (MAM)</option>
          <option value="summer">Summer (JJA)</option>
          <option value="autumn">Autumn (SON)</option>
        </select>

        <label htmlFor="dyearFrom">Year from</label>
        <input
          id="dyearFrom"
          type="number"
          min={1995}
          max={new Date().getFullYear()}
          value={yearFrom ?? ''}
          style={{ width: '5rem' }}
          onChange={(e: ChangeEvent<HTMLInputElement>) => set('dyearFrom', e.target.value)}
        />

        <label htmlFor="dyearTo">to</label>
        <input
          id="dyearTo"
          type="number"
          min={1995}
          max={new Date().getFullYear()}
          value={yearTo ?? ''}
          style={{ width: '5rem' }}
          onChange={(e: ChangeEvent<HTMLInputElement>) => set('dyearTo', e.target.value)}
        />

        <button type="button" className="button button-ghost" onClick={clearFilters}>
          Clear filters
        </button>
      </div>

      {tiedCount > 0 && (
        <p className="records-summary-text">
          {tiedCount} entries share a tied position. All ties are retained.
        </p>
      )}

      {entries.length === 0 ? (
        <p className="records-summary-text">No records match the current filters.</p>
      ) : (
        <TableWrapper>
          <RankingsBarChart
            title={`${DAILY_METRIC_LABELS[metric]} chart`}
            unit={DAILY_METRIC_UNIT[metric]}
            lowerIsBetter={metric === 'lowest-max' || metric === 'lowest-min' || metric === 'lowest-range'}
            entries={entries.slice(0, 15).map((entry, i) => ({
              key: `${entry.date}-${i}`,
              label: fmtDate(entry.date),
              value: entry.value,
            }))}
          />
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Date</th>
                <th>{DAILY_METRIC_LABELS[metric]} ({DAILY_METRIC_UNIT[metric]})</th>
                <th>Status</th>
                <th>Archive</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <DailyRankRow
                  key={`${entry.date}-${i}`}
                  entry={entry}
                  entries={entries}
                />
              ))}
            </tbody>
          </table>
        </TableWrapper>
      )}
    </section>
  )
}

function DailyRankRow({
  entry,
  entries,
}: {
  readonly entry: DailyRankEntry
  readonly entries: DailyRankEntry[]
}) {
  const tiedCount = entries.filter((e) => e.rank === entry.rank).length
  return (
    <tr>
      <td>
        <RankCell rank={entry.rank} />
        {tiedCount > 1 ? <span className="records-tie-indicator"> ={tiedCount}</span> : null}
      </td>
      <td>{fmtDate(entry.date)}</td>
      <td>{entry.value.toFixed(1)}</td>
      <td>{entry.provisional ? <ProvisionalBadge /> : <Badge variant="success">Final</Badge>}</td>
      <td>
        <Link to={archiveDatePath(entry.date)} className="link-focus">
          View
        </Link>
      </td>
    </tr>
  )
}

// ── 3. Calendar Date tab ──────────────────────────────────────────────────────

function CalendarDateTab({ index }: { readonly index: RecordsIndex }) {
  const [params, setParams] = useSearchParams()

  const month = intOrNull(params.get('cmonth')) ?? 7
  const day = intOrNull(params.get('cday')) ?? 15

  function setMonthDay(m: number, d: number) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', 'calendar')
      next.set('cmonth', String(m))
      next.set('cday', String(d))
      return next
    }, { replace: true })
  }

  const safeMonth = Math.min(Math.max(month, 1), 12)
  const maxDay = new Date(Date.UTC(2024, safeMonth, 0)).getUTCDate()
  const safeDay = Math.min(Math.max(day, 1), maxDay)

  const result = useMemo(
    () => getCalendarDateRecords(index, safeMonth, safeDay),
    [index, safeMonth, safeDay],
  )

  const displayDate = `${safeDay} ${MONTH_NAMES[safeMonth - 1]}`

  return (
    <section>
      <h2 className="records-section-title" style={{ marginBottom: '0.75rem' }}>
        Calendar-date records
      </h2>

      <div className="records-filters">
        <label htmlFor="cmonth">Month</label>
        <select
          id="cmonth"
          value={safeMonth}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            setMonthDay(Number(e.target.value), safeDay)
          }
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={i + 1} value={i + 1}>{name}</option>
          ))}
        </select>

        <label htmlFor="cday">Day</label>
        <input
          id="cday"
          type="number"
          min={1}
          max={maxDay}
          value={safeDay}
          style={{ width: '4rem' }}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setMonthDay(safeMonth, Number(e.target.value))
          }
        />
      </div>

      <p className="records-summary-text">
        {displayDate} — {result.sampleSize} year{result.sampleSize !== 1 ? 's' : ''} with a record
        for this date.
      </p>

      <div className="records-calendar-panel">
        <CalendarMetricCard
          title="Highest maximum"
          value={result.highestMax.value}
          years={result.highestMax.years}
          unit="°C"
          month={safeMonth}
          day={safeDay}
        />
        <CalendarMetricCard
          title="Lowest maximum"
          value={result.lowestMax.value}
          years={result.lowestMax.years}
          unit="°C"
          month={safeMonth}
          day={safeDay}
        />
        <CalendarMetricCard
          title="Highest minimum"
          value={result.highestMin.value}
          years={result.highestMin.years}
          unit="°C"
          month={safeMonth}
          day={safeDay}
        />
        <CalendarMetricCard
          title="Lowest minimum"
          value={result.lowestMin.value}
          years={result.lowestMin.years}
          unit="°C"
          month={safeMonth}
          day={safeDay}
        />
        <CalendarMetricCard
          title="Wettest year (rainfall from May 2020)"
          value={result.wettestYear.value}
          years={result.wettestYear.years}
          unit="mm"
          month={safeMonth}
          day={safeDay}
        />
      </div>
    </section>
  )
}

function CalendarMetricCard({
  title,
  value,
  years,
  unit,
  month,
  day,
}: {
  readonly title: string
  readonly value: number | null
  readonly years: number[]
  readonly unit: string
  readonly month: number
  readonly day: number
}) {
  return (
    <div className="records-calendar-metric">
      <h4>{title}</h4>
      <p className="records-calendar-value">
        {value != null ? `${value.toFixed(1)} ${unit}` : '—'}
      </p>
      <p className="records-calendar-holders">
        {years.length === 0
          ? '—'
          : years.map((year, i) => {
              const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as ClimateDateString
              return (
                <span key={year}>
                  {i > 0 ? ', ' : ''}
                  <Link to={archiveDatePath(date)} className="link-focus">
                    {year}
                  </Link>
                </span>
              )
            })}
        {years.length > 1 ? (
          <span style={{ marginLeft: '0.35rem' }}>
            <Badge variant="default">={years.length} tied</Badge>
          </span>
        ) : null}
      </p>
    </div>
  )
}

// ── 4. Monthly Rankings tab ───────────────────────────────────────────────────

const MONTHLY_METRIC_LABELS: Record<MonthlyMetric, string> = {
  'mean-max':  'Mean maximum',
  'mean-min':  'Mean minimum',
  'mean-temp': 'Mean temperature',
  'mean-diurnal-range': 'Mean diurnal range',
  'rainfall':  'Rainfall total',
}

const MONTHLY_METRIC_UNIT: Record<MonthlyMetric, string> = {
  'mean-max':  '°C',
  'mean-min':  '°C',
  'mean-temp': '°C',
  'mean-diurnal-range': '°C',
  'rainfall':  'mm',
}

function MonthlyRankingsTab({ index }: { readonly index: RecordsIndex }) {
  const [params, setParams] = useSearchParams()

  const metric = (params.get('mmetric') ?? 'mean-temp') as MonthlyMetric
  const monthFilter = intOrNull(params.get('mmonth'))
  const yearFrom = intOrNull(params.get('myearFrom'))
  const yearTo = intOrNull(params.get('myearTo'))
  const requireComplete = params.get('mcomplete') === 'true'

  function set(key: string, value: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', 'monthly')
      if (value === '' || value === 'null') { next.delete(key) } else { next.set(key, value) }
      return next
    }, { replace: true })
  }

  const entries = useMemo(
    () => getMonthlyRankings(index, metric, { monthFilter, yearFrom, yearTo, requireComplete }),
    [index, metric, monthFilter, yearFrom, yearTo, requireComplete],
  )

  function download() {
    downloadCsvBlob(
      buildMonthlyRankingsCsv(entries, MONTHLY_METRIC_LABELS[metric], MONTHLY_METRIC_UNIT[metric]),
      `monthly-rankings-${metric}.csv`,
    )
  }

  return (
    <section>
      <div className="records-section-header">
        <h2 className="records-section-title">Monthly rankings</h2>
        <CsvButton label="Export CSV" onClick={download} />
      </div>

      <div className="records-filters">
        <label htmlFor="mmetric">Metric</label>
        <select
          id="mmetric"
          value={metric}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => set('mmetric', e.target.value)}
        >
          {(Object.keys(MONTHLY_METRIC_LABELS) as MonthlyMetric[]).map((m) => (
            <option key={m} value={m}>{MONTHLY_METRIC_LABELS[m]}</option>
          ))}
        </select>

        <label htmlFor="mmonth">Month</label>
        <select
          id="mmonth"
          value={monthFilter ?? ''}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => set('mmonth', e.target.value)}
        >
          <option value="">All months</option>
          {MONTH_NAMES.map((name, i) => (
            <option key={i + 1} value={i + 1}>{name}</option>
          ))}
        </select>

        <label htmlFor="myearFrom">Year from</label>
        <input
          id="myearFrom"
          type="number"
          min={1995}
          max={new Date().getFullYear()}
          value={yearFrom ?? ''}
          style={{ width: '5rem' }}
          onChange={(e: ChangeEvent<HTMLInputElement>) => set('myearFrom', e.target.value)}
        />

        <label htmlFor="myearTo">to</label>
        <input
          id="myearTo"
          type="number"
          min={1995}
          max={new Date().getFullYear()}
          value={yearTo ?? ''}
          style={{ width: '5rem' }}
          onChange={(e: ChangeEvent<HTMLInputElement>) => set('myearTo', e.target.value)}
        />

        <label>
          <input
            type="checkbox"
            checked={requireComplete}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              set('mcomplete', e.target.checked ? 'true' : '')
            }
            style={{ marginRight: '0.3rem' }}
          />
          Complete only
        </label>
      </div>

      {entries.length === 0 ? (
        <p className="records-summary-text">No months match the current filters.</p>
      ) : (
        <TableWrapper>
          <RankingsBarChart
            title={`${MONTHLY_METRIC_LABELS[metric]} chart`}
            unit={MONTHLY_METRIC_UNIT[metric]}
            entries={entries.slice(0, 15).map((entry, i) => ({
              key: `${entry.year}-${entry.month}-${i}`,
              label: `${MONTH_NAMES[entry.month - 1] ?? entry.month} ${entry.year}`,
              value: entry.value,
            }))}
          />
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Month</th>
                <th>{MONTHLY_METRIC_LABELS[metric]} ({MONTHLY_METRIC_UNIT[metric]})</th>
                <th>Coverage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <MonthlyRankRow key={`${entry.year}-${entry.month}-${i}`} entry={entry} entries={entries} />
              ))}
            </tbody>
          </table>
        </TableWrapper>
      )}
    </section>
  )
}

function MonthlyRankRow({
  entry,
  entries,
}: {
  readonly entry: MonthlyRankEntry
  readonly entries: MonthlyRankEntry[]
}) {
  const tiedCount = entries.filter((e) => e.rank === entry.rank).length
  const monthName = MONTH_NAMES[entry.month - 1] ?? String(entry.month)
  const archivePath = `/climate-archive?year=${entry.year}&month=${entry.month}`

  return (
    <tr>
      <td>
        <RankCell rank={entry.rank} />
        {tiedCount > 1 ? <span className="records-tie-indicator"> ={tiedCount}</span> : null}
      </td>
      <td>
        <Link to={archivePath} className="link-focus">
          {monthName} {entry.year}
        </Link>
      </td>
      <td>{entry.value.toFixed(1)}</td>
      <td>{entry.complete ? 'Complete' : 'Incomplete'}</td>
      <td>{entry.provisional ? <ProvisionalBadge /> : <Badge variant="success">Final</Badge>}</td>
    </tr>
  )
}

// ── 5. Annual Rankings tab ────────────────────────────────────────────────────

const ANNUAL_METRIC_LABELS: Record<AnnualMetric, string> = {
  'mean-max':  'Mean maximum',
  'mean-min':  'Mean minimum',
  'mean-temp': 'Mean temperature',
  'mean-diurnal-range': 'Mean diurnal range',
  'rainfall':  'Rainfall total',
}

const ANNUAL_METRIC_UNIT: Record<AnnualMetric, string> = {
  'mean-max':  '°C',
  'mean-min':  '°C',
  'mean-temp': '°C',
  'mean-diurnal-range': '°C',
  'rainfall':  'mm',
}

function AnnualRankingsTab({ index }: { readonly index: RecordsIndex }) {
  const [params, setParams] = useSearchParams()

  const metric = (params.get('ametric') ?? 'mean-temp') as AnnualMetric

  function set(key: string, value: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', 'annual')
      next.set(key, value)
      return next
    }, { replace: true })
  }

  const entries = useMemo(() => getAnnualRankings(index, metric), [index, metric])

  function download() {
    downloadCsvBlob(
      buildAnnualRankingsCsv(entries, ANNUAL_METRIC_LABELS[metric], ANNUAL_METRIC_UNIT[metric]),
      `annual-rankings-${metric}.csv`,
    )
  }

  const rainfallNote =
    metric === 'rainfall'
      ? 'Only complete rainfall years (2021 onwards) are included.'
      : null

  return (
    <section>
      <div className="records-section-header">
        <h2 className="records-section-title">Annual rankings</h2>
        <CsvButton label="Export CSV" onClick={download} />
      </div>

      <div className="records-filters">
        <label htmlFor="ametric">Metric</label>
        <select
          id="ametric"
          value={metric}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => set('ametric', e.target.value)}
        >
          {(Object.keys(ANNUAL_METRIC_LABELS) as AnnualMetric[]).map((m) => (
            <option key={m} value={m}>{ANNUAL_METRIC_LABELS[m]}</option>
          ))}
        </select>
      </div>

      {rainfallNote != null ? (
        <p className="records-summary-text">{rainfallNote}</p>
      ) : null}

      {entries.length === 0 ? (
        <p className="records-summary-text">No years match the current filters.</p>
      ) : (
        <TableWrapper>
          <RankingsBarChart
            title={`${ANNUAL_METRIC_LABELS[metric]} chart`}
            unit={ANNUAL_METRIC_UNIT[metric]}
            entries={entries.slice(0, 15).map((entry, i) => ({
              key: `${entry.year}-${i}`,
              label: String(entry.year),
              value: entry.value,
            }))}
          />
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Year</th>
                <th>{ANNUAL_METRIC_LABELS[metric]} ({ANNUAL_METRIC_UNIT[metric]})</th>
                <th>Coverage</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => (
                <AnnualRankRow key={`${entry.year}-${i}`} entry={entry} entries={entries} />
              ))}
            </tbody>
          </table>
        </TableWrapper>
      )}
    </section>
  )
}

function AnnualRankRow({
  entry,
  entries,
}: {
  readonly entry: AnnualRankEntry
  readonly entries: AnnualRankEntry[]
}) {
  const tiedCount = entries.filter((e) => e.rank === entry.rank).length
  return (
    <tr>
      <td>
        <RankCell rank={entry.rank} />
        {tiedCount > 1 ? <span className="records-tie-indicator"> ={tiedCount}</span> : null}
      </td>
      <td>
        <Link to={`/climate-archive?year=${entry.year}`} className="link-focus">
          {entry.year}
        </Link>
      </td>
      <td>{entry.value.toFixed(1)}</td>
      <td>{entry.coverageNote}</td>
      <td>{entry.provisional ? <ProvisionalBadge /> : <Badge variant="success">Final</Badge>}</td>
    </tr>
  )
}

// ── 6. Thresholds tab ─────────────────────────────────────────────────────────

function ThresholdsTab({ index }: { readonly index: RecordsIndex }) {
  const [params, setParams] = useSearchParams()
  const heavyMm = floatOrDefault(params.get('heavy'), 5.0)

  function setHeavy(v: number) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', 'thresholds')
      next.set('heavy', String(v))
      return next
    }, { replace: true })
  }

  const summary = useMemo(() => getThresholdSummary(index, heavyMm), [index, heavyMm])

  function download() {
    downloadCsvBlob(buildThresholdCsv(summary), 'thresholds.csv')
  }

  return (
    <section>
      <div className="records-section-header">
        <h2 className="records-section-title">Threshold days</h2>
        <CsvButton label="Export CSV" onClick={download} />
      </div>

      <div className="records-filters">
        <label htmlFor="heavy">Heavy rain threshold (mm)</label>
        <input
          id="heavy"
          type="number"
          min={0.2}
          max={100}
          step={0.1}
          value={heavyMm}
          style={{ width: '5.5rem' }}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setHeavy(Number(e.target.value))}
        />
      </div>

      <div className="records-filters" style={{ marginBottom: '1.25rem' }}>
        <strong>All-time totals:</strong>
        <span>≥20°C: <strong>{summary.allTimeAtOrAbove20C}</strong></span>
        <span>≥25°C: <strong>{summary.allTimeAtOrAbove25C}</strong></span>
        <span>≥30°C: <strong>{summary.allTimeAtOrAbove30C}</strong></span>
        <span>Frost: <strong>{summary.allTimeFrostDays}</strong></span>
        <span>Rain days: <strong>{summary.allTimeRainDays}</strong></span>
        <span>Heavy rain: <strong>{summary.allTimeHeavyRainDays}</strong></span>
      </div>

      <TableWrapper>
        <table>
          <thead>
            <tr>
              <th>Year</th>
              <th>≥20°C</th>
              <th>≥25°C</th>
              <th>≥30°C</th>
              <th>Frost (&lt;0°C)</th>
              <th>Rain days (&gt;0.1 mm)</th>
              <th>Heavy rain (≥{heavyMm} mm)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {summary.byYear.map((row) => (
              <tr key={row.year}>
                <td>
                  <Link to={`/climate-archive?year=${row.year}`} className="link-focus">
                    {row.year}
                  </Link>
                </td>
                <td>{row.atOrAbove20C}</td>
                <td>{row.atOrAbove25C}</td>
                <td>{row.atOrAbove30C}</td>
                <td>{row.frostDays}</td>
                <td>{row.rainDays}</td>
                <td>{row.heavyRainDays}</td>
                <td>{row.provisional ? <ProvisionalBadge /> : <Badge variant="success">Final</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrapper>
    </section>
  )
}

// ── 7. Spells tab ─────────────────────────────────────────────────────────────

function SpellsTab({ index }: { readonly index: RecordsIndex }) {
  const [params, setParams] = useSearchParams()
  const warmC = floatOrDefault(params.get('swarm'), 20)
  const coldC = floatOrDefault(params.get('scold'), 0)

  function update(key: string, v: number) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', 'spells')
      next.set(key, String(v))
      return next
    }, { replace: true })
  }

  const summary = useMemo(() => getSpellSummary(index, warmC, coldC), [index, warmC, coldC])

  return (
    <section>
      <h2 className="records-section-title" style={{ marginBottom: '0.75rem' }}>
        Longest spells
      </h2>

      <div className="records-filters" style={{ marginBottom: '1rem' }}>
        <label htmlFor="swarm">Warm spell threshold (°C, max ≥)</label>
        <input
          id="swarm"
          type="number"
          step={0.5}
          value={warmC}
          style={{ width: '5rem' }}
          onChange={(e: ChangeEvent<HTMLInputElement>) => update('swarm', Number(e.target.value))}
        />

        <label htmlFor="scold">Cold spell threshold (°C, min &lt;)</label>
        <input
          id="scold"
          type="number"
          step={0.5}
          value={coldC}
          style={{ width: '5rem' }}
          onChange={(e: ChangeEvent<HTMLInputElement>) => update('scold', Number(e.target.value))}
        />
      </div>

      <p className="records-summary-text">{summary.missingDataRule}</p>

      <div className="records-spell-grid">
        <SpellCard
          title="Longest dry spell"
          description={`Rainfall ≤ 0.1 mm per day`}
          spell={summary.longestDry}
        />
        <SpellCard
          title="Longest wet spell"
          description={`Rainfall > 0.1 mm per day`}
          spell={summary.longestWet}
        />
        <SpellCard
          title={`Longest warm spell`}
          description={`Max ≥ ${warmC}°C per day`}
          spell={summary.longestWarm}
        />
        <SpellCard
          title={`Longest cold spell`}
          description={`Min < ${coldC}°C per day`}
          spell={summary.longestCold}
        />
      </div>
    </section>
  )
}

function SpellCard({
  title,
  description,
  spell,
}: {
  readonly title: string
  readonly description: string
  readonly spell: SpellSummary['longestDry']
}) {
  const hasData = spell.length > 0

  return (
    <div className="records-spell-card">
      <h4>{title}</h4>
      <p className="records-spell-duration">
        {hasData ? `${spell.length} day${spell.length !== 1 ? 's' : ''}` : '—'}
      </p>
      <p className="records-spell-dates">
        {hasData && spell.startDate != null && spell.endDate != null ? (
          <>
            <Link to={archiveDatePath(spell.startDate)} className="link-focus">
              {fmtDate(spell.startDate)}
            </Link>
            {' – '}
            <Link to={archiveDatePath(spell.endDate)} className="link-focus">
              {fmtDate(spell.endDate)}
            </Link>
          </>
        ) : (
          <em>{description}</em>
        )}
      </p>
      {hasData ? <p className="records-spell-dates"><em>{description}</em></p> : null}
    </div>
  )
}

// ── 8. Progression tab ────────────────────────────────────────────────────────

const PROGRESSION_METRIC_LABELS: Record<ProgressionMetric, string> = {
  'highest-max': 'Highest daily maximum',
  'lowest-min':  'Lowest daily minimum',
  'highest-min': 'Highest daily minimum',
  'lowest-max':  'Lowest daily maximum',
  'highest-range': 'Highest diurnal range',
  'lowest-range':  'Lowest diurnal range',
  'wettest':     'Wettest day',
}

const PROGRESSION_METRIC_UNIT: Record<ProgressionMetric, string> = {
  'highest-max': '°C',
  'lowest-min':  '°C',
  'highest-min': '°C',
  'lowest-max':  '°C',
  'highest-range': '°C',
  'lowest-range':  '°C',
  'wettest':     'mm',
}

function ProgressionTab({ index }: { readonly index: RecordsIndex }) {
  const [params, setParams] = useSearchParams()
  const metric = (params.get('pmetric') ?? 'highest-max') as ProgressionMetric

  function set(key: string, value: string) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', 'progression')
      next.set(key, value)
      return next
    }, { replace: true })
  }

  const allProgressions = useMemo(
    () =>
      ([
        'highest-max',
        'lowest-min',
        'highest-min',
        'lowest-max',
        'highest-range',
        'lowest-range',
        'wettest',
      ] as ProgressionMetric[]).map(
        (m) => getRecordProgression(index, m),
      ),
    [index],
  )

  const progression = useMemo(
    () => getRecordProgression(index, metric),
    [index, metric],
  )

  const yearCounts = useMemo(
    () => getYearRecordCounts(index, allProgressions),
    [index, allProgressions],
  )

  function download() {
    downloadCsvBlob(
      buildProgressionCsv(progression.entries),
      `record-progression-${metric}.csv`,
    )
  }

  return (
    <section>
      <div className="records-section-header">
        <h2 className="records-section-title">Record progression</h2>
        <CsvButton label="Export CSV" onClick={download} />
      </div>

      <div className="records-filters">
        <label htmlFor="pmetric">Record</label>
        <select
          id="pmetric"
          value={metric}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => set('pmetric', e.target.value)}
        >
          {(Object.keys(PROGRESSION_METRIC_LABELS) as ProgressionMetric[]).map((m) => (
            <option key={m} value={m}>{PROGRESSION_METRIC_LABELS[m]}</option>
          ))}
        </select>
      </div>

      {progression.currentValue != null ? (
        <p className="records-summary-text">
          Current record: <strong>
            {progression.currentValue.toFixed(1)} {PROGRESSION_METRIC_UNIT[metric]}
          </strong>{' '}
          — held by {progression.currentRecordYears.join(', ')}
          {progression.currentRecordYears.length > 1 ? ' (tied)' : ''}.{' '}
          {progression.eventCount} record event{progression.eventCount !== 1 ? 's' : ''} in total.
        </p>
      ) : (
        <p className="records-summary-text">No records available.</p>
      )}

      {progression.entries.length > 0 ? (
        <>
          <div className="records-progression-chart">
            <ProgressionChart progression={progression} unit={PROGRESSION_METRIC_UNIT[metric]} />
          </div>
          <TableWrapper>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Value ({PROGRESSION_METRIC_UNIT[metric]})</th>
                  <th>Event</th>
                  <th>Previous record</th>
                  <th>Archive</th>
                </tr>
              </thead>
              <tbody>
                {progression.entries.map((entry, i) => (
                  <tr key={`${entry.date}-${i}`}>
                    <td>{fmtDate(entry.date)}</td>
                    <td>{entry.value.toFixed(1)}</td>
                    <td>
                      {entry.isNewRecord ? (
                        <Badge variant="success">New record</Badge>
                      ) : (
                        <Badge variant="default">Tie</Badge>
                      )}
                    </td>
                    <td>
                      {entry.previousValue != null
                        ? `${entry.previousValue.toFixed(1)} ${PROGRESSION_METRIC_UNIT[metric]}`
                        : '—'}
                    </td>
                    <td>
                      <Link to={archiveDatePath(entry.date)} className="link-focus">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        </>
      ) : null}

      {yearCounts.length > 0 ? (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Current records held by year
          </h3>
          <TableWrapper>
            <table className="records-year-count-table">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Records held</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {yearCounts.map((row) => (
                  <tr key={row.year}>
                    <td>
                      <Link to={`/climate-archive?year=${row.year}`} className="link-focus">
                        {row.year}
                      </Link>
                    </td>
                    <td>{row.count}</td>
                    <td>
                      {row.provisional
                        ? <ProvisionalBadge />
                        : <Badge variant="success">Final</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrapper>
        </div>
      ) : null}
    </section>
  )
}

// ── Progression SVG chart ─────────────────────────────────────────────────────

const SVG_W = 700
const SVG_H = 220
const M = { t: 20, r: 30, b: 50, l: 60 } as const
const PLOT_W = SVG_W - M.l - M.r
const PLOT_H = SVG_H - M.t - M.b

function ProgressionChart({
  progression,
  unit,
}: {
  readonly progression: RecordProgressionSummary
  readonly unit: string
}) {
  const { entries } = progression
  if (entries.length === 0) return null

  const years = entries.map((e) => parseIsoClimateDate(e.date).year)
  const values = entries.map((e) => e.value)

  const minYear = Math.min(...years)
  const maxYear = Math.max(...years)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)

  const yPad = (maxVal - minVal) * 0.15 || 1
  const yMin = minVal - yPad
  const yMax = maxVal + yPad
  const yearSpan = Math.max(maxYear - minYear, 1)

  function xPos(year: number): number {
    return M.l + ((year - minYear) / yearSpan) * PLOT_W
  }

  function yPos(value: number): number {
    return M.t + PLOT_H - ((value - yMin) / (yMax - yMin)) * PLOT_H
  }

  // Build step path: hold value until next change
  let pathD = ''
  let prevY: number | null = null
  let prevX: number | null = null

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    const x = xPos(years[i]!)
    const y = yPos(entry.value)

    if (i === 0) {
      pathD += `M ${x},${y}`
    } else if (prevX != null && prevY != null) {
      pathD += ` H ${x} V ${y}`
    }
    prevX = x
    prevY = y
  }

  // Extend to right edge
  if (prevX != null && prevY != null) {
    pathD += ` H ${M.l + PLOT_W}`
  }

  // Y ticks
  const yTicks: number[] = []
  const yStep = (yMax - yMin) / 4
  for (let i = 0; i <= 4; i++) {
    yTicks.push(yMin + i * yStep)
  }

  // X ticks: up to 8 years
  const xTickStep = Math.ceil(yearSpan / 7)
  const xTicks: number[] = []
  for (let y = minYear; y <= maxYear; y += xTickStep) {
    xTicks.push(y)
  }
  if (!xTicks.includes(maxYear)) xTicks.push(maxYear)

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      aria-label={`Record progression chart`}
      role="img"
      style={{ width: '100%', height: 'auto' }}
    >
      {/* Grid lines */}
      {yTicks.map((t) => {
        const y = yPos(t)
        return (
          <line
            key={t}
            x1={M.l}
            y1={y}
            x2={M.l + PLOT_W}
            y2={y}
            stroke="var(--chart-grid-lines)"
            strokeWidth={1}
          />
        )
      })}

      {/* Y axis labels */}
      {yTicks.map((t) => (
        <text
          key={t}
          x={M.l - 6}
          y={yPos(t) + 4}
          textAnchor="end"
          fontSize={11}
          fill="var(--chart-axis-text)"
        >
          {t.toFixed(1)}
        </text>
      ))}

      {/* X axis labels */}
      {xTicks.map((yr) => (
        <text
          key={yr}
          x={xPos(yr)}
          y={M.t + PLOT_H + 20}
          textAnchor="middle"
          fontSize={11}
          fill="var(--chart-axis-text)"
        >
          {yr}
        </text>
      ))}

      {/* Y axis label */}
      <text
        x={14}
        y={M.t + PLOT_H / 2}
        textAnchor="middle"
        fontSize={11}
        fill="var(--chart-axis-text)"
        transform={`rotate(-90, 14, ${M.t + PLOT_H / 2})`}
      >
        {unit}
      </text>

      {/* Step line */}
      <path
        d={pathD}
        fill="none"
        stroke="var(--chart-series-observed)"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />

      {/* Points */}
      {entries.map((entry, i) => {
        const x = xPos(years[i]!)
        const y = yPos(entry.value)
        return (
          <circle
            key={`${entry.date}-${i}`}
            cx={x}
            cy={y}
            r={entry.isNewRecord ? 5 : 3.5}
            fill={entry.isNewRecord ? 'var(--chart-series-observed)' : 'var(--chart-series-provisional)'}
            stroke="var(--surface)"
            strokeWidth={1.5}
          >
            <title>
              {fmtDate(entry.date)}: {entry.value.toFixed(1)} {unit}
              {entry.isNewRecord ? ' (new record)' : ' (tie)'}
            </title>
          </circle>
        )
      })}

      {/* Legend */}
      <circle cx={M.l} cy={SVG_H - 10} r={5} fill="var(--chart-series-observed)" />
      <text x={M.l + 10} y={SVG_H - 7} fontSize={11} fill="var(--chart-axis-text)">New record</text>
      <circle cx={M.l + 110} cy={SVG_H - 10} r={3.5} fill="var(--chart-series-provisional)" />
      <text x={M.l + 122} y={SVG_H - 7} fontSize={11} fill="var(--chart-axis-text)">Tie</text>
    </svg>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RecordsPage() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') ?? 'overview') as TabId

  function setTab(id: TabId) {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', id)
      return next
    }, { replace: true })
  }

  const archiveIndexQuery = useClimateArchiveIndexQuery()
  const monthlyNormalsQuery = useMonthlyNormalsQuery()

  const availableYears = useMemo(
    () => archiveIndexQuery.data?.years.map((y) => y.year) ?? [],
    [archiveIndexQuery.data],
  )

  const yearQueries = useAnnualClimateQueries(availableYears)

  const { loadedPayloads, loadedCount } = useMemo(() => {
    const loaded = yearQueries
      .filter((q) => q.data != null)
      .map((q) => q.data!)
    return { loadedPayloads: loaded, loadedCount: loaded.length }
  }, [yearQueries])

  const monthlyNormalsData = monthlyNormalsQuery.data?.months
  const historyRecords = loadedPayloads.flatMap((payload) => payload.records)

  const index = useMemo(
    () => {
      const normals = monthlyNormalsData ?? []
      return loadedPayloads.length > 0
        ? buildRecordsIndex(loadedPayloads, normals)
        : emptyRecordsIndex()
    },
    [loadedPayloads, monthlyNormalsData],
  )

  const isInitialLoading =
    archiveIndexQuery.isLoading || (availableYears.length > 0 && loadedCount === 0)

  if (archiveIndexQuery.error != null) {
    return (
      <ErrorState
        title="Archive unavailable"
        message="Could not load the climate archive index."
        onRetry={() => void archiveIndexQuery.refetch()}
      />
    )
  }

  if (isInitialLoading) {
    return (
      <section className="card" aria-live="polite">
        <Skeleton lines={4} />
      </section>
    )
  }

  return (
    <div>
      <nav aria-label="Records sections">
        <div className="records-tab-bar" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={
                tab === t.id ? 'records-tab-btn records-tab-btn--active' : 'records-tab-btn'
              }
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      {availableYears.length > 0 && loadedCount < availableYears.length ? (
        <LoadingProgress loaded={loadedCount} total={availableYears.length} />
      ) : null}
      <WarmFrostSpellsChart records={historyRecords} currentYear={availableYears.at(-1) ?? new Date().getFullYear()} />

      <div className="card">
        {tab === 'overview' && <OverviewTab index={index} />}
        {tab === 'daily' && <DailyRankingsTab index={index} />}
        {tab === 'calendar' && <CalendarDateTab index={index} />}
        {tab === 'monthly' && <MonthlyRankingsTab index={index} />}
        {tab === 'annual' && <AnnualRankingsTab index={index} />}
        {tab === 'thresholds' && <ThresholdsTab index={index} />}
        {tab === 'spells' && <SpellsTab index={index} />}
        {tab === 'progression' && <ProgressionTab index={index} />}
      </div>
    </div>
  )
}
