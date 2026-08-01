import { useMemo, useState } from 'react'
import { DateSeriesChart } from '@/components/charts/DateSeriesChart'
import {
  Badge,
  ErrorState,
  IncompleteDataWarning,
  ResponsiveChartContainer,
  Skeleton,
  TableWrapper,
  VisuallyHidden,
} from '@/components/ui'
import { chartTokens } from '@/components/ui/chartTokens'
import {
  DAILY_NORMAL_BASELINE,
  MONTHLY_NORMAL_BASELINE,
  WEATHER_UNITS,
} from '@/config/weather'
import {
  buildAnnualQuickRangesForYear,
  buildAnnualTemperatureRows,
  buildCalendarDateExtremeSummaries,
  formatAnnualChartTick,
  type AnnualExtremeCategory,
  type CalendarDateExtremeSummary,
} from '@/features/annualCharts/calculations'
import {
  buildAnnualSummary,
} from '@/features/climateArchive/calculations'
import {
  buildMonthlyRainfallRows,
  buildMonthlyTempAnomalies,
  buildRankingRows,
  buildYtdContext,
  MONTH_ABBR,
  MONTH_NAMES,
  type RankingMetric,
  type RankingPeriod,
} from '@/features/normalsAnomalies/calculations'
import {
  useAnnualClimateQuery,
  useAnnualClimateQueries,
  useClimateArchiveIndexQuery,
  useDailyNormalsQuery,
  useMonthlyNormalsQuery,
} from '@/hooks/usePublicWeatherQueries'
import {
  formatEuropeLondonDisplay,
  formatNullableMeasurement,
  getEuropeLondonClimateDate,
} from '@/lib/climate'
import type { AnnualClimatePayload } from '@/types/weather'
import type {
  ClimateDay,
  DailyNormal,
  MonthlySummary,
  MonthlyNormal,
} from '@/types/weather'

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_W = 560
const CHART_H = 180
const CHART_PAD = { top: 12, right: 16, bottom: 28, left: 42 }

const EMPTY_RECORDS: readonly ClimateDay[] = []
const EMPTY_NORMALS: readonly DailyNormal[] = []
const EMPTY_MONTHLY_NORMALS: readonly MonthlyNormal[] = []

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtTemp(v: number | null): string {
  return formatNullableMeasurement(v, { unit: WEATHER_UNITS.temperature })
}

function fmtRain(v: number | null): string {
  return formatNullableMeasurement(v, { unit: WEATHER_UNITS.rainfall })
}

function fmtAnomaly(v: number | null): string {
  if (v == null) return '—'
  const sign = v > 0 ? '+' : ''
  return `${sign}${v.toFixed(1)} ${WEATHER_UNITS.temperature}`
}

function fmtPercent(v: number | null): string {
  if (v == null) return '—'
  return `${Math.round(v)}%`
}

function anomalyClass(v: number | null): string {
  if (v == null) return ''
  return v > 0 ? 'normals-anomaly--pos' : v < 0 ? 'normals-anomaly--neg' : ''
}

// ── SVG chart primitives ──────────────────────────────────────────────────────

function innerW(): number {
  return CHART_W - CHART_PAD.left - CHART_PAD.right
}

function innerH(chartH = CHART_H): number {
  return chartH - CHART_PAD.top - CHART_PAD.bottom
}

function scaleY(value: number, min: number, max: number, chartH = CHART_H): number {
  if (max === min) return CHART_PAD.top + innerH(chartH) / 2
  return CHART_PAD.top + innerH(chartH) - ((value - min) / (max - min)) * innerH(chartH)
}

function scaleX(index: number, count: number): number {
  if (count <= 1) return CHART_PAD.left + innerW() / 2
  return CHART_PAD.left + (index / (count - 1)) * innerW()
}

interface YAxisProps {
  readonly min: number
  readonly max: number
  readonly unit: string
  readonly chartH?: number
}

function YAxis({ min, max, unit, chartH = CHART_H }: YAxisProps) {
  const ticks = 4
  return (
    <>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = min + ((max - min) * i) / ticks
        const y = scaleY(v, min, max, chartH)
        return (
          <g key={i}>
            <line
              x1={CHART_PAD.left}
              x2={CHART_W - CHART_PAD.right}
              y1={y}
              y2={y}
              stroke={chartTokens.gridLines}
              strokeDasharray="4 4"
            />
            <text
              x={CHART_PAD.left - 4}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={10}
              fill={chartTokens.axisText}
            >
              {v.toFixed(1)}{unit}
            </text>
          </g>
        )
      })}
    </>
  )
}

function ZeroLine({ chartH = CHART_H, min, max }: { chartH?: number; min: number; max: number }) {
  if (min > 0 || max < 0) return null
  const y = scaleY(0, min, max, chartH)
  return (
    <line
      x1={CHART_PAD.left}
      x2={CHART_W - CHART_PAD.right}
      y1={y}
      y2={y}
      stroke={chartTokens.axisText}
      strokeWidth={0.8}
      opacity={0.5}
    />
  )
}

function MonthXAxis() {
  return (
    <>
      {MONTH_ABBR.map((label, i) => {
        const x = scaleX(i, 12)
        return (
          <text
            key={label}
            x={x}
            y={CHART_H - CHART_PAD.bottom + 14}
            textAnchor="middle"
            fontSize={10}
            fill={chartTokens.axisText}
          >
            {label}
          </text>
        )
      })}
    </>
  )
}

// ── Daily temperature normals chart ──────────────────────────────────────────

interface DailyNormalsChartProps {
  readonly normals: readonly DailyNormal[]
  readonly yearRecords: readonly ClimateDay[]
  readonly year: number
  readonly overlaySummaries: ReadonlyMap<string, CalendarDateExtremeSummary> | null
  readonly activeOverlays: Readonly<Record<AnnualExtremeCategory, boolean>>
}

function DailyNormalsChart({
  normals,
  yearRecords,
  year,
  overlaySummaries,
  activeOverlays,
}: DailyNormalsChartProps) {
  const rows = useMemo(() => buildAnnualTemperatureRows(normals, yearRecords), [normals, yearRecords])
  const chartRows = useMemo(
    () =>
      rows.map((row) => {
        const overlay = overlaySummaries?.get(row.dateKey) ?? null
        return {
          timestamp: row.timestamp,
          label: formatEuropeLondonDisplay(row.date, {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
          provisional: row.status !== 'finalised',
          values: {
            normalMax: row.normalMaxC,
            normalMin: row.normalMinC,
            observedMax: row.observedMaxC,
            observedMin: row.observedMinC,
            highestMax: activeOverlays['highest-max'] ? (overlay?.highestMax.value ?? null) : null,
            lowestMax: activeOverlays['lowest-max'] ? (overlay?.lowestMax.value ?? null) : null,
            highestMin: activeOverlays['highest-min'] ? (overlay?.highestMin.value ?? null) : null,
            lowestMin: activeOverlays['lowest-min'] ? (overlay?.lowestMin.value ?? null) : null,
          },
        }
      }),
    [activeOverlays, overlaySummaries, rows],
  )

  if (chartRows.length === 0) {
    return <p className="normals-no-data">No temperature data available.</p>
  }

  const overlayMeta = (rowDateKey: string) => overlaySummaries?.get(rowDateKey) ?? null

  return (
    <DateSeriesChart
      rows={chartRows}
      unit={WEATHER_UNITS.temperature}
      ariaLabel={`Daily temperature normals and ${year} observed — max and min`}
      gapThresholdMs={36 * 60 * 60 * 1000}
      presets={buildAnnualQuickRangesForYear(year)}
      xTickFormatter={formatAnnualChartTick}
      series={[
        { key: 'normalMax', label: `Normal max (${DAILY_NORMAL_BASELINE})`, color: chartTokens.series.reference, dashed: true },
        { key: 'normalMin', label: `Normal min (${DAILY_NORMAL_BASELINE})`, color: chartTokens.series.reference, dashed: true },
        { key: 'observedMax', label: `${year} observed max`, color: chartTokens.series.observed },
        { key: 'observedMin', label: `${year} observed min`, color: chartTokens.series.comparison },
        { key: 'highestMax', label: 'Highest daily maximum record', color: '#d81b60', dashed: true },
        { key: 'lowestMax', label: 'Lowest daily maximum record', color: '#6a1b9a', dashed: true },
        { key: 'highestMin', label: 'Highest daily minimum record', color: '#fb8c00', dashed: true },
        { key: 'lowestMin', label: 'Lowest daily minimum record', color: '#00897b', dashed: true },
      ].filter((series) => {
        if (series.key === 'highestMax') return activeOverlays['highest-max']
        if (series.key === 'lowestMax') return activeOverlays['lowest-max']
        if (series.key === 'highestMin') return activeOverlays['highest-min']
        if (series.key === 'lowestMin') return activeOverlays['lowest-min']
        return true
      })}
      tooltipRenderer={(row, series, unit) => {
        const matching = rows.find((entry) => entry.timestamp === row.timestamp)
        const overlay = matching != null ? overlayMeta(matching.dateKey) : null

        return (
          <>
            <strong>{row.label}</strong>
            {row.provisional ? <div>Provisional</div> : null}
            {series.map((entry) => {
              const value = row.values[entry.key]
              let suffix = ''
              if (entry.key === 'highestMax') suffix = overlay?.highestMax.years.join(', ') ?? ''
              if (entry.key === 'lowestMax') suffix = overlay?.lowestMax.years.join(', ') ?? ''
              if (entry.key === 'highestMin') suffix = overlay?.highestMin.years.join(', ') ?? ''
              if (entry.key === 'lowestMin') suffix = overlay?.lowestMin.years.join(', ') ?? ''
              return (
                <div key={entry.key} style={{ color: entry.color }}>
                  {entry.label}: {value == null ? 'Missing' : `${value.toFixed(1)} ${unit}`}
                  {suffix ? ` (${suffix})` : ''}
                </div>
              )
            })}
          </>
        )
      }}
    />
  )
}

// ── Daily anomaly chart ───────────────────────────────────────────────────────

interface DailyAnomalyChartProps {
  readonly normals: readonly DailyNormal[]
  readonly yearRecords: readonly ClimateDay[]
  readonly year: number
}

function DailyAnomalyChart({ normals, yearRecords, year }: DailyAnomalyChartProps) {
  const rows = useMemo(() => buildAnnualTemperatureRows(normals, yearRecords), [normals, yearRecords])
  const chartRows = useMemo(
    () =>
      rows.map((row) => ({
        timestamp: row.timestamp,
        label: formatEuropeLondonDisplay(row.date, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
        provisional: row.status !== 'finalised',
        values: { maxAnomaly: row.maxAnomalyC },
      })),
    [rows],
  )
  const valid = chartRows
    .map((row) => row.values.maxAnomaly)
    .filter((value): value is number => value != null)

  if (valid.length === 0) {
    return <p className="normals-no-data">No anomaly data available — observed values missing.</p>
  }

  return (
    <DateSeriesChart
      rows={chartRows}
      unit={WEATHER_UNITS.temperature}
      ariaLabel={`Daily maximum temperature anomaly for ${year} against ${DAILY_NORMAL_BASELINE} normal`}
      gapThresholdMs={36 * 60 * 60 * 1000}
      presets={buildAnnualQuickRangesForYear(year)}
      xTickFormatter={formatAnnualChartTick}
      series={[
        { key: 'maxAnomaly', label: 'Daily max anomaly', color: chartTokens.series.observed },
      ]}
    />
  )
}

// ── Monthly temperature anomaly chart ────────────────────────────────────────

function MonthlyAnomalyChart({ summaries }: { readonly summaries: readonly MonthlySummary[] }) {
  const rows = useMemo(() => buildMonthlyTempAnomalies(summaries), [summaries])
  const values = rows.map((r) => r.meanTempAnomalyC)
  const valid = values.filter((v): v is number => v != null)
  if (valid.length === 0) {
    return <p className="normals-no-data">No monthly anomaly data available.</p>
  }

  const absMax = Math.ceil(Math.max(...valid.map(Math.abs))) + 0.5
  const minV = -absMax
  const maxV = absMax
  const barW = Math.max(6, innerW() / 12 - 2)

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      aria-label="Monthly mean temperature anomaly chart"
      role="img"
      style={{ width: '100%', height: 'auto', minWidth: 300 }}
    >
      <YAxis min={minV} max={maxV} unit="°C" />
      <MonthXAxis />
      <ZeroLine min={minV} max={maxV} />
      {values.map((v, i) => {
        if (v == null) return null
        const x = scaleX(i, 12)
        const zeroY = scaleY(0, minV, maxV)
        const valueY = scaleY(v, minV, maxV)
        const barY = Math.min(zeroY, valueY)
        const h = Math.max(1, Math.abs(zeroY - valueY))
        return (
          <rect
            key={i}
            x={x - barW / 2}
            y={barY}
            width={barW}
            height={h}
            fill={v >= 0 ? 'var(--anomaly-pos, #e05252)' : 'var(--anomaly-neg, #5291e0)'}
            opacity={0.85}
          />
        )
      })}
    </svg>
  )
}

// ── Monthly rainfall chart ────────────────────────────────────────────────────

function MonthlyRainfallChart({
  year,
  summaries,
  monthlyNormals,
}: {
  readonly year: number
  readonly summaries: readonly MonthlySummary[]
  readonly monthlyNormals: readonly MonthlyNormal[]
}) {
  const rainfallRows = useMemo(
    () => buildMonthlyRainfallRows(year, summaries, monthlyNormals),
    [year, summaries, monthlyNormals],
  )

  const obsValues = rainfallRows.map((r) => r.observedMm)
  const normValues = rainfallRows.map((r) => r.normalMm)
  const valid = [...obsValues, ...normValues].filter((v): v is number => v != null)
  if (valid.length === 0) {
    return <p className="normals-no-data">No rainfall data available.</p>
  }

  const maxV = Math.ceil(Math.max(...valid)) + 5
  const barW = Math.max(5, innerW() / 12 - 4)

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      aria-label={`Monthly rainfall vs ${MONTHLY_NORMAL_BASELINE} normal`}
      role="img"
      style={{ width: '100%', height: 'auto', minWidth: 300 }}
    >
      <YAxis min={0} max={maxV} unit="mm" />
      <MonthXAxis />
      {rainfallRows.map((row, i) => {
        const x = scaleX(i, 12)
        const normV = row.normalMm
        const obsV = row.observedMm
        return (
          <g key={row.month}>
            {normV != null && (
              <rect
                x={x - barW / 2 - 1}
                y={scaleY(normV, 0, maxV)}
                width={barW / 2}
                height={Math.max(1, CHART_PAD.top + innerH() - scaleY(normV, 0, maxV))}
                fill={chartTokens.series.reference}
                opacity={0.5}
              />
            )}
            {obsV != null && !row.rainfallUnavailable && (
              <rect
                x={x + 1}
                y={scaleY(obsV, 0, maxV)}
                width={barW / 2}
                height={Math.max(1, CHART_PAD.top + innerH() - scaleY(obsV, 0, maxV))}
                fill={row.incomplete ? chartTokens.series.provisional : chartTokens.series.observed}
                opacity={0.85}
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Baseline explanation ──────────────────────────────────────────────────────

function BaselineExplanation() {
  return (
    <section className="card normals-section" aria-labelledby="normals-baseline-heading">
      <h2 id="normals-baseline-heading">Baselines</h2>
      <p>Two separate baseline periods are used on this page:</p>
      <ul className="normals-baseline-list">
        <li>
          <strong>Daily temperature normals ({DAILY_NORMAL_BASELINE}):</strong>{' '}
          Normal max and min temperatures computed from 30 years of daily observations.
        </li>
        <li>
          <strong>Monthly normals ({MONTHLY_NORMAL_BASELINE}):</strong>{' '}
          Monthly mean temperatures and rainfall totals use the standard WMO 30-year reference period.
        </li>
      </ul>
      <p className="normals-baseline-note">
        A single combined baseline is not shown because the two periods differ — using one label for both would be misleading.
      </p>
    </section>
  )
}

// ── Year selector ─────────────────────────────────────────────────────────────

function YearSelector({
  years,
  year,
  onChange,
}: {
  readonly years: readonly number[]
  readonly year: number
  readonly onChange: (y: number) => void
}) {
  return (
    <section className="card archive-controls">
      <div className="archive-controls-row">
        <label className="archive-label" htmlFor="normals-year-select">Year</label>
        <select
          id="normals-year-select"
          className="archive-select"
          value={year}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {[...years].sort((a, b) => b - a).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
    </section>
  )
}

// ── Chart legend row ──────────────────────────────────────────────────────────

function ChartLegend({ items }: { readonly items: readonly { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <ul className="normals-chart-legend" aria-label="Chart legend">
      {items.map((item) => (
        <li key={item.label}>
          <svg width={20} height={12} aria-hidden="true">
            <line
              x1={0}
              y1={6}
              x2={20}
              y2={6}
              stroke={item.color}
              strokeWidth={2}
              strokeDasharray={item.dashed ? '5 3' : undefined}
            />
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  )
}

// ── Section: Daily temperature normals ───────────────────────────────────────

function DailyTempNormalsSection({
  year,
  normals,
  yearRecords,
  availableYears,
}: {
  readonly year: number
  readonly normals: readonly DailyNormal[]
  readonly yearRecords: readonly ClimateDay[]
  readonly availableYears: readonly number[]
}) {
  const [activeOverlays, setActiveOverlays] = useState<Record<AnnualExtremeCategory, boolean>>({
    'highest-max': false,
    'lowest-max': false,
    'highest-min': false,
    'lowest-min': false,
  })
  const shouldLoadOverlays = Object.values(activeOverlays).some(Boolean)
  const overlayQueries = useAnnualClimateQueries(availableYears, { enabled: shouldLoadOverlays })
  const overlayPayloads = useMemo(
    () =>
      overlayQueries
        .map((query) => query.data)
        .filter((payload): payload is AnnualClimatePayload => payload != null),
    [overlayQueries],
  )
  const overlaySummaries = useMemo(
    () =>
      shouldLoadOverlays && overlayPayloads.length > 0
        ? buildCalendarDateExtremeSummaries(overlayPayloads)
        : null,
    [overlayPayloads, shouldLoadOverlays],
  )
  const overlayLoading = shouldLoadOverlays && overlayQueries.some((query) => query.isLoading && query.data == null)

  const legendItems = [
    { color: chartTokens.series.reference, label: `Normal max (${DAILY_NORMAL_BASELINE})`, dashed: true },
    { color: chartTokens.series.reference, label: `Normal min (${DAILY_NORMAL_BASELINE})`, dashed: true },
    { color: chartTokens.series.observed, label: `${year} observed max` },
    { color: chartTokens.series.comparison, label: `${year} observed min` },
    ...(activeOverlays['highest-max']
      ? [{ color: '#d81b60', label: 'Highest daily maximum record', dashed: true }]
      : []),
    ...(activeOverlays['lowest-max']
      ? [{ color: '#6a1b9a', label: 'Lowest daily maximum record', dashed: true }]
      : []),
    ...(activeOverlays['highest-min']
      ? [{ color: '#fb8c00', label: 'Highest daily minimum record', dashed: true }]
      : []),
    ...(activeOverlays['lowest-min']
      ? [{ color: '#00897b', label: 'Lowest daily minimum record', dashed: true }]
      : []),
  ]

  return (
    <section className="card normals-section" aria-labelledby="normals-daily-temp-heading">
      <div className="archive-card-heading">
        <h2 id="normals-daily-temp-heading">Daily temperature normals</h2>
        <span className="archive-baseline-note">Baseline: {DAILY_NORMAL_BASELINE}</span>
      </div>
      <p>Normal max and min temperature curves (dashed) compared with {year} observed values.</p>

      <fieldset className="normals-overlay-controls">
        <legend>All-time extremes</legend>
        {([
          ['highest-max', 'Highest daily maximum'],
          ['lowest-max', 'Lowest daily maximum'],
          ['highest-min', 'Highest daily minimum'],
          ['lowest-min', 'Lowest daily minimum'],
        ] as const).map(([key, label]) => (
          <label key={key} className="normals-overlay-option">
            <input
              type="checkbox"
              checked={activeOverlays[key]}
              onChange={(event) =>
                setActiveOverlays((current) => ({
                  ...current,
                  [key]: event.target.checked,
                }))
              }
            />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>

      {overlayLoading ? (
        <IncompleteDataWarning message="Loading all-time calendar-date extremes…" />
      ) : null}

      <ChartLegend items={legendItems} />

      <ResponsiveChartContainer size="detail">
        <DailyNormalsChart
          normals={normals}
          yearRecords={yearRecords}
          year={year}
          overlaySummaries={overlaySummaries}
          activeOverlays={activeOverlays}
        />
      </ResponsiveChartContainer>

      <h3 style={{ marginTop: '1.5rem' }}>Daily maximum temperature anomaly ({year} vs {DAILY_NORMAL_BASELINE})</h3>

      <ResponsiveChartContainer size="detail">
        <DailyAnomalyChart normals={normals} yearRecords={yearRecords} year={year} />
      </ResponsiveChartContainer>

      <p className="normals-baseline-note" style={{ marginTop: '0.5rem' }}>
        Positive (warm) anomalies shown in red, negative (cold) in blue.
        Only computed where both observed and normal values exist.
      </p>
    </section>
  )
}

// ── Section: Monthly temperature anomalies ────────────────────────────────────

function MonthlyTempAnomaliesSection({
  year,
  summaries,
}: {
  readonly year: number
  readonly summaries: readonly MonthlySummary[]
}) {
  const rows = useMemo(() => buildMonthlyTempAnomalies(summaries), [summaries])

  return (
    <section className="card normals-section" aria-labelledby="normals-monthly-temp-heading">
      <div className="archive-card-heading">
        <h2 id="normals-monthly-temp-heading">Monthly temperature anomalies — {year}</h2>
        <span className="archive-baseline-note">Baseline: {MONTHLY_NORMAL_BASELINE}</span>
      </div>
      <p>Departure from the {MONTHLY_NORMAL_BASELINE} monthly normal for each metric.</p>

      <ResponsiveChartContainer size="page">
        <MonthlyAnomalyChart summaries={summaries} />
      </ResponsiveChartContainer>

      <TableWrapper>
        <table className="normals-table">
          <caption className="visually-hidden">
            Monthly temperature anomalies for {year} against {MONTHLY_NORMAL_BASELINE} baseline
          </caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Mean max anomaly</th>
              <th scope="col">Mean min anomaly</th>
              <th scope="col">Mean temp anomaly</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month}>
                <td>{row.monthName}</td>
                <td className={anomalyClass(row.meanMaxAnomalyC)}>{fmtAnomaly(row.meanMaxAnomalyC)}</td>
                <td className={anomalyClass(row.meanMinAnomalyC)}>{fmtAnomaly(row.meanMinAnomalyC)}</td>
                <td className={anomalyClass(row.meanTempAnomalyC)}>{fmtAnomaly(row.meanTempAnomalyC)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrapper>
    </section>
  )
}

// ── Section: Monthly rainfall ─────────────────────────────────────────────────

function MonthlyRainfallSection({
  year,
  summaries,
  monthlyNormals,
}: {
  readonly year: number
  readonly summaries: readonly MonthlySummary[]
  readonly monthlyNormals: readonly MonthlyNormal[]
}) {
  const rows = useMemo(
    () => buildMonthlyRainfallRows(year, summaries, monthlyNormals),
    [year, summaries, monthlyNormals],
  )

  const hasAnyIncomplete = rows.some((r) => r.incomplete && !r.rainfallUnavailable)

  return (
    <section className="card normals-section" aria-labelledby="normals-monthly-rain-heading">
      <div className="archive-card-heading">
        <h2 id="normals-monthly-rain-heading">Monthly rainfall — {year}</h2>
        <span className="archive-baseline-note">Normal baseline: {MONTHLY_NORMAL_BASELINE}</span>
      </div>

      {hasAnyIncomplete && (
        <IncompleteDataWarning message="Some months have incomplete rainfall records. Totals shown are for observed valid days only and may underestimate true monthly totals." />
      )}

      <ChartLegend items={[
        { color: chartTokens.series.reference, label: `Normal (${MONTHLY_NORMAL_BASELINE})` },
        { color: chartTokens.series.observed, label: `${year} observed` },
      ]} />

      <ResponsiveChartContainer size="page">
        <MonthlyRainfallChart year={year} summaries={summaries} monthlyNormals={monthlyNormals} />
      </ResponsiveChartContainer>

      <TableWrapper>
        <table className="normals-table">
          <caption className="visually-hidden">
            Monthly rainfall for {year} vs {MONTHLY_NORMAL_BASELINE} normal
          </caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Observed</th>
              <th scope="col">Normal ({MONTHLY_NORMAL_BASELINE})</th>
              <th scope="col">Difference</th>
              <th scope="col">% of normal</th>
              <th scope="col">Coverage</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.month}>
                <td>{row.monthName}</td>
                <td>
                  {row.rainfallUnavailable
                    ? <span className="normals-unavailable">Unavailable</span>
                    : fmtRain(row.observedMm)}
                  {row.incomplete && !row.rainfallUnavailable && (
                    <abbr
                      title="Incomplete period — observed valid days only"
                      className="normals-incomplete-flag"
                    >
                      {' '}⚠
                    </abbr>
                  )}
                </td>
                <td>{fmtRain(row.normalMm)}</td>
                <td
                  className={
                    row.differenceMm != null && !row.rainfallUnavailable
                      ? row.differenceMm >= 0
                        ? 'normals-anomaly--pos'
                        : 'normals-anomaly--neg'
                      : ''
                  }
                >
                  {row.rainfallUnavailable ? '—' : fmtRain(row.differenceMm)}
                </td>
                <td>{row.rainfallUnavailable ? '—' : fmtPercent(row.percentageOfNormal)}</td>
                <td className="normals-coverage-cell">
                  {row.rainfallUnavailable
                    ? 'N/A'
                    : `${row.validDays}/${row.expectedDays} days`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrapper>
    </section>
  )
}

// ── Section: Year-to-date context ─────────────────────────────────────────────

function YtdContextSection({
  year,
  summaries,
  monthlyNormals,
}: {
  readonly year: number
  readonly summaries: readonly MonthlySummary[]
  readonly monthlyNormals: readonly MonthlyNormal[]
}) {
  const referenceDate = getEuropeLondonClimateDate()
  const ctx = useMemo(
    () => buildYtdContext(year, summaries, monthlyNormals, referenceDate),
    [year, summaries, monthlyNormals, referenceDate],
  )

  const t = ctx.temperature
  const r = ctx.rainfall

  return (
    <section className="card normals-section" aria-labelledby="normals-ytd-heading">
      <div className="archive-card-heading">
        <h2 id="normals-ytd-heading">Year-to-date context — {year}</h2>
        {ctx.provisional && <Badge variant="provisional">Provisional</Badge>}
      </div>

      {ctx.lastCompletedMonth != null ? (
        <p>
          Based on {ctx.temperatureMonthsCovered} completed month
          {ctx.temperatureMonthsCovered !== 1 ? 's' : ''} (through{' '}
          {MONTH_NAMES[ctx.lastCompletedMonth - 1]}).
        </p>
      ) : (
        <p>No completed months available yet.</p>
      )}

      <h3>Temperature ({MONTHLY_NORMAL_BASELINE} baseline)</h3>
      <dl className="normals-ytd-grid">
        <div>
          <dt>YTD mean max</dt>
          <dd>
            {fmtTemp(t.obsYtdMeanMaxC)}{' '}
            <span className={anomalyClass(t.ytdMeanMaxAnomalyC)}>({fmtAnomaly(t.ytdMeanMaxAnomalyC)})</span>
          </dd>
        </div>
        <div>
          <dt>Normal mean max</dt>
          <dd>{fmtTemp(t.normalYtdMeanMaxC)}</dd>
        </div>
        <div>
          <dt>YTD mean min</dt>
          <dd>
            {fmtTemp(t.obsYtdMeanMinC)}{' '}
            <span className={anomalyClass(t.ytdMeanMinAnomalyC)}>({fmtAnomaly(t.ytdMeanMinAnomalyC)})</span>
          </dd>
        </div>
        <div>
          <dt>Normal mean min</dt>
          <dd>{fmtTemp(t.normalYtdMeanMinC)}</dd>
        </div>
        <div>
          <dt>YTD mean temp</dt>
          <dd>
            {fmtTemp(t.obsYtdMeanTempC)}{' '}
            <span className={anomalyClass(t.ytdMeanTempAnomalyC)}>({fmtAnomaly(t.ytdMeanTempAnomalyC)})</span>
          </dd>
        </div>
        <div>
          <dt>Normal mean temp</dt>
          <dd>{fmtTemp(t.normalYtdMeanTempC)}</dd>
        </div>
      </dl>

      <h3>Rainfall ({MONTHLY_NORMAL_BASELINE} baseline)</h3>
      {r.completedRainfallMonths === 0 ? (
        <p className="normals-baseline-note">
          No completed months with rainfall records in the YTD window.
        </p>
      ) : (
        <>
          <dl className="normals-ytd-grid">
            <div>
              <dt>Observed total</dt>
              <dd>{fmtRain(r.observedMm)}</dd>
            </div>
            <div>
              <dt>
                Expected total
                {r.expectedIsProrated && (
                  <abbr
                    title="Prorated estimate from monthly normals — daily rainfall normals are unavailable"
                    className="normals-prorated-flag"
                  >
                    {' '}(est.)
                  </abbr>
                )}
              </dt>
              <dd>{fmtRain(r.expectedMm)}</dd>
            </div>
            <div>
              <dt>Difference</dt>
              <dd
                className={
                  r.differenceMm != null
                    ? r.differenceMm >= 0
                      ? 'normals-anomaly--pos'
                      : 'normals-anomaly--neg'
                    : ''
                }
              >
                {fmtRain(r.differenceMm)}
              </dd>
            </div>
            <div>
              <dt>% of normal</dt>
              <dd>{fmtPercent(r.percentageOfNormal)}</dd>
            </div>
          </dl>
          {r.expectedIsProrated && (
            <p className="normals-baseline-note">
              ⚠ Expected rainfall is a prorated estimate from {MONTHLY_NORMAL_BASELINE} monthly normals.
              Daily rainfall normals are not available, so this figure sums monthly normals for completed months only.
            </p>
          )}
        </>
      )}
    </section>
  )
}

// ── Section: Ranking tables ───────────────────────────────────────────────────

const RANKING_METRIC_OPTIONS: readonly { value: RankingMetric; label: string }[] = [
  { value: 'meanMaxAnomaly', label: 'Mean max anomaly' },
  { value: 'meanMinAnomaly', label: 'Mean min anomaly' },
  { value: 'meanTempAnomaly', label: 'Mean temp anomaly' },
  { value: 'rainfallPercentage', label: 'Rainfall % of normal' },
]

const PERIOD_OPTIONS: readonly { value: RankingPeriod; label: string }[] = [
  { value: 'annual', label: 'Annual (all months avg)' },
  ...MONTH_NAMES.map((name, i) => ({ value: (i + 1) as RankingPeriod, label: name })),
]

function RankingTablesSection({
  allSummaries,
}: {
  readonly allSummaries: readonly MonthlySummary[]
}) {
  const [metric, setMetric] = useState<RankingMetric>('meanTempAnomaly')
  const [period, setPeriod] = useState<RankingPeriod>('annual')

  const isRainfall = metric === 'rainfallPercentage'

  const warmestRows = useMemo(
    () => buildRankingRows(allSummaries, metric, period, isRainfall ? 'wettest' : 'warmest').slice(0, 10),
    [allSummaries, metric, period, isRainfall],
  )

  const coldestRows = useMemo(
    () => buildRankingRows(allSummaries, metric, period, isRainfall ? 'driest' : 'coldest').slice(0, 10),
    [allSummaries, metric, period, isRainfall],
  )

  function fmtValue(v: number): string {
    if (isRainfall) return `${Math.round(v)}%`
    const sign = v > 0 ? '+' : ''
    return `${sign}${v.toFixed(1)} ${WEATHER_UNITS.temperature}`
  }

  return (
    <section className="card normals-section" aria-labelledby="normals-ranking-heading">
      <div className="archive-card-heading">
        <h2 id="normals-ranking-heading">Anomaly rankings</h2>
        <span className="archive-baseline-note">Baselines: {MONTHLY_NORMAL_BASELINE}</span>
      </div>
      <p>
        Ranks months or years by departure from normal. Only rows where both observed and normal
        values exist are included.
      </p>

      <div className="archive-controls-row" style={{ flexWrap: 'wrap', gap: '0.5rem 1rem' }}>
        <div>
          <label className="archive-label" htmlFor="ranking-metric-select">Metric</label>
          <select
            id="ranking-metric-select"
            className="archive-select"
            value={metric}
            onChange={(e) => setMetric(e.target.value as RankingMetric)}
          >
            {RANKING_METRIC_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="archive-label" htmlFor="ranking-period-select">Period</label>
          <select
            id="ranking-period-select"
            className="archive-select"
            value={period}
            onChange={(e) => {
              const v = e.target.value
              setPeriod(v === 'annual' ? 'annual' : (Number(v) as RankingPeriod))
            }}
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="normals-ranking-grid">
        <div>
          <h3>{isRainfall ? 'Wettest' : 'Warmest'} departures</h3>
          {warmestRows.length === 0 ? (
            <p className="normals-no-data">No data with valid normals for this selection.</p>
          ) : (
            <TableWrapper>
              <table className="normals-table">
                <caption className="visually-hidden">
                  {isRainfall ? 'Wettest' : 'Warmest'} departures from normal
                </caption>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Period</th>
                    <th>Departure</th>
                  </tr>
                </thead>
                <tbody>
                  {warmestRows.map((row, i) => (
                    <tr key={`${row.year}-${row.month ?? 'annual'}`}>
                      <td>{i + 1}</td>
                      <td>{row.label}</td>
                      <td className={row.value >= 0 ? 'normals-anomaly--pos' : 'normals-anomaly--neg'}>
                        {fmtValue(row.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          )}
        </div>
        <div>
          <h3>{isRainfall ? 'Driest' : 'Coldest'} departures</h3>
          {coldestRows.length === 0 ? (
            <p className="normals-no-data">No data with valid normals for this selection.</p>
          ) : (
            <TableWrapper>
              <table className="normals-table">
                <caption className="visually-hidden">
                  {isRainfall ? 'Driest' : 'Coldest'} departures from normal
                </caption>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Period</th>
                    <th>Departure</th>
                  </tr>
                </thead>
                <tbody>
                  {coldestRows.map((row, i) => (
                    <tr key={`${row.year}-${row.month ?? 'annual'}`}>
                      <td>{i + 1}</td>
                      <td>{row.label}</td>
                      <td className={row.value >= 0 ? 'normals-anomaly--pos' : 'normals-anomaly--neg'}>
                        {fmtValue(row.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          )}
        </div>
      </div>
    </section>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function NormalsAnomaliesPage() {
  const archiveIndexQuery = useClimateArchiveIndexQuery()
  const dailyNormalsQuery = useDailyNormalsQuery()
  const monthlyNormalsQuery = useMonthlyNormalsQuery()

  const availableYears = useMemo(
    () =>
      (archiveIndexQuery.data?.years ?? [])
        .map((entry) => entry.year)
        .sort((a, b) => a - b),
    [archiveIndexQuery.data],
  )

  const latestYear = availableYears.at(-1) ?? new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const year = selectedYear ?? latestYear

  const annualQuery = useAnnualClimateQuery(year)

  const dailyNormals = dailyNormalsQuery.data?.records ?? EMPTY_NORMALS
  const monthlyNormals = monthlyNormalsQuery.data?.months ?? EMPTY_MONTHLY_NORMALS
  const yearRecords = annualQuery.data?.records ?? EMPTY_RECORDS

  const summaries = useMemo(
    () =>
      yearRecords.length > 0
        ? buildAnnualSummary(year, yearRecords, monthlyNormals).monthlySummaries
        : ([] as readonly MonthlySummary[]),
    [year, yearRecords, monthlyNormals],
  )

  if (archiveIndexQuery.isLoading && archiveIndexQuery.data == null) {
    return (
      <section className="card" aria-live="polite">
        <Skeleton lines={4} />
        <VisuallyHidden>Loading archive index</VisuallyHidden>
      </section>
    )
  }

  if (archiveIndexQuery.error != null && archiveIndexQuery.data == null) {
    return (
      <ErrorState
        title="Normals & Anomalies unavailable"
        message="Unable to load the archive year list right now."
        onRetry={() => { void archiveIndexQuery.refetch() }}
      />
    )
  }

  const dataLoading =
    (dailyNormalsQuery.isLoading && dailyNormalsQuery.data == null) ||
    (monthlyNormalsQuery.isLoading && monthlyNormalsQuery.data == null) ||
    (annualQuery.isLoading && annualQuery.data == null)

  if (dataLoading) {
    return (
      <section className="card" aria-live="polite">
        <Skeleton lines={8} />
        <VisuallyHidden>Loading normals and anomaly data for {year}</VisuallyHidden>
      </section>
    )
  }

  const dataError =
    (annualQuery.error != null && annualQuery.data == null) ||
    (dailyNormalsQuery.error != null && dailyNormalsQuery.data == null)

  if (dataError) {
    return (
      <ErrorState
        title="Unable to load normals data"
        message="Climate data or normals could not be loaded right now."
        onRetry={() => {
          void annualQuery.refetch()
          void dailyNormalsQuery.refetch()
          void monthlyNormalsQuery.refetch()
        }}
      />
    )
  }

  return (
    <div className="archive-layout">
      <section className="card">
        <div className="archive-card-heading">
          <h2>Normals &amp; Anomalies</h2>
          {annualQuery.data?.complete
            ? <Badge variant="success">Finalised year</Badge>
            : <Badge variant="provisional">Provisional coverage</Badge>}
        </div>
        <p>Compare observed temperatures and rainfall against established normals and explore anomalies.</p>
      </section>

      <YearSelector
        years={availableYears}
        year={year}
        onChange={(y) => setSelectedYear(y)}
      />

      <BaselineExplanation />

      <DailyTempNormalsSection
        year={year}
        normals={dailyNormals}
        yearRecords={yearRecords}
        availableYears={availableYears}
      />

      <MonthlyTempAnomaliesSection year={year} summaries={summaries} />

      <MonthlyRainfallSection year={year} summaries={summaries} monthlyNormals={monthlyNormals} />

      <YtdContextSection year={year} summaries={summaries} monthlyNormals={monthlyNormals} />

      <RankingTablesSection allSummaries={summaries} />
    </div>
  )
}
