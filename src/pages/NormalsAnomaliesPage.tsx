import { useMemo, useState } from 'react'
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
  buildAnnualSummary,
} from '@/features/climateArchive/calculations'
import {
  buildDailyNormalsRows,
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
  useClimateArchiveIndexQuery,
  useDailyNormalsQuery,
  useMonthlyNormalsQuery,
} from '@/hooks/usePublicWeatherQueries'
import {
  formatNullableMeasurement,
  getEuropeLondonClimateDate,
} from '@/lib/climate'
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

function buildLinePath(
  points: readonly (number | null)[],
  min: number,
  max: number,
  chartH = CHART_H,
): string {
  const segments: string[] = []
  let seg: string[] = []
  points.forEach((v, i) => {
    const x = scaleX(i, points.length)
    if (v == null) {
      if (seg.length > 1) segments.push(seg.join(' '))
      seg = []
      return
    }
    const y = scaleY(v, min, max, chartH)
    seg.push(`${seg.length === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
  })
  if (seg.length > 1) segments.push(seg.join(' '))
  return segments.join(' ')
}

function buildAreaPath(
  upper: readonly (number | null)[],
  lower: readonly (number | null)[],
  min: number,
  max: number,
  chartH = CHART_H,
): string {
  const topPoints: string[] = []
  const bottomPoints: string[] = []
  for (let i = 0; i < upper.length; i++) {
    const u = upper[i]
    const l = lower[i]
    if (u != null && l != null) {
      const x = scaleX(i, upper.length)
      topPoints.push(`${topPoints.length === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${scaleY(u, min, max, chartH).toFixed(1)}`)
      bottomPoints.unshift(`${x.toFixed(1)} ${scaleY(l, min, max, chartH).toFixed(1)}`)
    }
  }
  if (topPoints.length === 0) return ''
  return `${topPoints.join(' ')} L ${bottomPoints.join(' L ')} Z`
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

function DayOfYearXAxis({ totalDays, step = 30 }: { totalDays: number; step?: number }) {
  const labels: React.ReactNode[] = []
  for (let d = 1; d <= totalDays; d += step) {
    labels.push(
      <text
        key={d}
        x={scaleX(d - 1, totalDays)}
        y={CHART_H - CHART_PAD.bottom + 14}
        textAnchor="middle"
        fontSize={10}
        fill={chartTokens.axisText}
      >
        {d}
      </text>,
    )
  }
  return <>{labels}</>
}

// ── Daily temperature normals chart ──────────────────────────────────────────

interface DailyNormalsChartProps {
  readonly normals: readonly DailyNormal[]
  readonly yearRecords: readonly ClimateDay[]
  readonly year: number
}

function DailyNormalsChart({ normals, yearRecords, year }: DailyNormalsChartProps) {
  const rows = useMemo(
    () => buildDailyNormalsRows(normals, yearRecords, year),
    [normals, yearRecords, year],
  )

  const normalMaxC = rows.map((r) => r.normalMaxC)
  const normalMinC = rows.map((r) => r.normalMinC)
  const obsMaxC = rows.map((r) => r.obsMaxC)
  const obsMinC = rows.map((r) => r.obsMinC)

  const allValues = [...normalMaxC, ...normalMinC, ...obsMaxC, ...obsMinC].filter(
    (v): v is number => v != null,
  )
  if (allValues.length === 0) {
    return <p className="normals-no-data">No temperature data available.</p>
  }

  const minV = Math.floor(Math.min(...allValues)) - 2
  const maxV = Math.ceil(Math.max(...allValues)) + 2

  const normMaxPath = buildLinePath(normalMaxC, minV, maxV)
  const normMinPath = buildLinePath(normalMinC, minV, maxV)
  const obsMaxPath = buildLinePath(obsMaxC, minV, maxV)
  const obsMinPath = buildLinePath(obsMinC, minV, maxV)
  const areaPath = buildAreaPath(normalMaxC, normalMinC, minV, maxV)

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      aria-label={`Daily temperature normals and ${year} observed — max and min`}
      role="img"
      style={{ width: '100%', height: 'auto', minWidth: 300 }}
    >
      <YAxis min={minV} max={maxV} unit="°C" />
      <DayOfYearXAxis totalDays={rows.length} step={30} />
      {areaPath && (
        <path d={areaPath} fill={chartTokens.series.reference} fillOpacity={0.12} stroke="none" />
      )}
      {normMaxPath && (
        <path d={normMaxPath} fill="none" stroke={chartTokens.series.reference} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.8} />
      )}
      {normMinPath && (
        <path d={normMinPath} fill="none" stroke={chartTokens.series.reference} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.8} />
      )}
      {obsMaxPath && (
        <path d={obsMaxPath} fill="none" stroke={chartTokens.series.observed} strokeWidth={2} />
      )}
      {obsMinPath && (
        <path d={obsMinPath} fill="none" stroke={chartTokens.series.comparison} strokeWidth={2} />
      )}
    </svg>
  )
}

// ── Daily anomaly chart ───────────────────────────────────────────────────────

interface DailyAnomalyChartProps {
  readonly normals: readonly DailyNormal[]
  readonly yearRecords: readonly ClimateDay[]
  readonly year: number
}

function DailyAnomalyChart({ normals, yearRecords, year }: DailyAnomalyChartProps) {
  const rows = useMemo(
    () => buildDailyNormalsRows(normals, yearRecords, year),
    [normals, yearRecords, year],
  )

  const maxAnomalies = rows.map((r) => r.maxAnomalyC)
  const valid = maxAnomalies.filter((v): v is number => v != null)
  if (valid.length === 0) {
    return <p className="normals-no-data">No anomaly data available — observed values missing.</p>
  }

  const absMax = Math.ceil(Math.max(...valid.map(Math.abs))) + 1
  const minV = -absMax
  const maxV = absMax

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      aria-label={`Daily maximum temperature anomaly for ${year} against ${DAILY_NORMAL_BASELINE} normal`}
      role="img"
      style={{ width: '100%', height: 'auto', minWidth: 300 }}
    >
      <YAxis min={minV} max={maxV} unit="°C" />
      <DayOfYearXAxis totalDays={rows.length} step={30} />
      <ZeroLine min={minV} max={maxV} />
      {maxAnomalies.map((v, i) => {
        if (v == null) return null
        const x = scaleX(i, maxAnomalies.length)
        const zeroY = scaleY(0, minV, maxV)
        const valueY = scaleY(v, minV, maxV)
        const y = Math.min(zeroY, valueY)
        const h = Math.max(1, Math.abs(zeroY - valueY))
        return (
          <rect
            key={i}
            x={x - 0.5}
            y={y}
            width={1}
            height={h}
            fill={v >= 0 ? 'var(--anomaly-pos, #e05252)' : 'var(--anomaly-neg, #5291e0)'}
            opacity={0.8}
          />
        )
      })}
    </svg>
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
}: {
  readonly year: number
  readonly normals: readonly DailyNormal[]
  readonly yearRecords: readonly ClimateDay[]
}) {
  return (
    <section className="card normals-section" aria-labelledby="normals-daily-temp-heading">
      <div className="archive-card-heading">
        <h2 id="normals-daily-temp-heading">Daily temperature normals</h2>
        <span className="archive-baseline-note">Baseline: {DAILY_NORMAL_BASELINE}</span>
      </div>
      <p>Normal max and min temperature curves (dashed) compared with {year} observed values.</p>

      <ChartLegend items={[
        { color: chartTokens.series.reference, label: `Normal max/min (${DAILY_NORMAL_BASELINE})`, dashed: true },
        { color: chartTokens.series.observed, label: `${year} observed max` },
        { color: chartTokens.series.comparison, label: `${year} observed min` },
      ]} />

      <ResponsiveChartContainer>
        <DailyNormalsChart normals={normals} yearRecords={yearRecords} year={year} />
      </ResponsiveChartContainer>

      <h3 style={{ marginTop: '1.5rem' }}>Daily maximum temperature anomaly ({year} vs {DAILY_NORMAL_BASELINE})</h3>

      <ResponsiveChartContainer>
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

      <ResponsiveChartContainer>
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

      <ResponsiveChartContainer>
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

      <DailyTempNormalsSection year={year} normals={dailyNormals} yearRecords={yearRecords} />

      <MonthlyTempAnomaliesSection year={year} summaries={summaries} />

      <MonthlyRainfallSection year={year} summaries={summaries} monthlyNormals={monthlyNormals} />

      <YtdContextSection year={year} summaries={summaries} monthlyNormals={monthlyNormals} />

      <RankingTablesSection allSummaries={summaries} />
    </div>
  )
}
