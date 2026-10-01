import {
  useCallback,
  useMemo,
  useReducer,
  useState,
  type ChangeEvent,
} from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Badge,
  ErrorState,
  IncompleteDataWarning,
  Modal,
  ProvisionalBadge,
  ResponsiveChartContainer,
  Skeleton,
  TableWrapper,
  VisuallyHidden,
} from '@/components/ui'
import { chartTokens } from '@/components/ui/chartTokens'
import { MONTHLY_NORMAL_BASELINE, RAINFALL_START_DATE, WEATHER_UNITS } from '@/config/weather'
import {
  useAnnualClimateQueries,
  useAnnualClimateQuery,
  useClimateArchiveIndexQuery,
  useDailyNormalsQuery,
  useMonthlyNormalsQuery,
} from '@/hooks/usePublicWeatherQueries'
import {
  formatEuropeLondonDisplay,
  formatNullableMeasurement,
} from '@/lib/climate'
import { DateSeriesChart } from '@/components/charts/DateSeriesChart'
import {
  buildAnnualTrendData,
  formatAnnualChartTick,
} from '@/features/annualCharts/calculations'
import {
  buildAnnualSummary,
  buildMonthlySummary,
  isRainfallAvailableForMonth,
  isRainfallAvailableForYear,
} from '@/features/climateArchive/calculations'
import { useArchiveSelection } from '@/features/climateArchive/useArchiveSelection'
import {
  buildAnnualMonthlyCsv,
  buildDailyCsv,
  downloadCsvBlob,
} from '@/features/climateArchive/csv'
import type {
  ClimateDateString,
  ClimateDay,
  DailyNormal,
  MonthlySummary as MonthlySummaryType,
  AnnualSummary as AnnualSummaryType,
} from '@/types/weather'
import { ClimateStatsCharts } from '@/features/climateStats/ClimateStatsCharts'

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
}

type SortKey = 'date' | 'max' | 'min' | 'mean' | 'rainfall'
type SortDir = 'asc' | 'desc'

type SortState = { key: SortKey; dir: SortDir }

// ── Helper functions ──────────────────────────────────────────────────────────

function fmtTemp(value: number | null): string {
  return formatNullableMeasurement(value, { unit: WEATHER_UNITS.temperature })
}

function fmtRainfall(value: number | null): string {
  return formatNullableMeasurement(value, { unit: WEATHER_UNITS.rainfall })
}

function fmtAnomaly(value: number | null): string {
  if (value == null) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)} ${WEATHER_UNITS.temperature}`
}

function fmtPercent(value: number | null): string {
  if (value == null) return '—'
  return `${Math.round(value)}%`
}

function rainfallDisplay(date: ClimateDateString, rainfallMm: number | null): string {
  if (date < RAINFALL_START_DATE) return 'Unavailable'
  if (rainfallMm == null) return '—'
  return fmtRainfall(rainfallMm)
}

function sortedRecords(
  records: readonly ClimateDay[],
  sort: SortState,
): ClimateDay[] {
  return [...records].sort((a, b) => {
    let diff = 0
    switch (sort.key) {
      case 'date':
        diff = a.date < b.date ? -1 : a.date > b.date ? 1 : 0
        break
      case 'max':
        diff = (a.maxTempC ?? -Infinity) - (b.maxTempC ?? -Infinity)
        break
      case 'min':
        diff = (a.minTempC ?? -Infinity) - (b.minTempC ?? -Infinity)
        break
      case 'mean':
        diff = (a.meanTempC ?? -Infinity) - (b.meanTempC ?? -Infinity)
        break
      case 'rainfall':
        diff = (a.rainfallMm ?? -Infinity) - (b.rainfallMm ?? -Infinity)
        break
    }
    return sort.dir === 'asc' ? diff : -diff
  })
}

// ── Chart primitives (SVG, no third-party library) ───────────────────────────

const CHART_W = 560
const CHART_H = 180
const CHART_PAD = { top: 12, right: 16, bottom: 28, left: 42 }

function chartInnerW() {
  return CHART_W - CHART_PAD.left - CHART_PAD.right
}
function chartInnerH() {
  return CHART_H - CHART_PAD.top - CHART_PAD.bottom
}

function scaleY(value: number, min: number, max: number): number {
  if (max === min) return CHART_PAD.top + chartInnerH() / 2
  return CHART_PAD.top + chartInnerH() - ((value - min) / (max - min)) * chartInnerH()
}

function scaleX(index: number, count: number): number {
  if (count <= 1) return CHART_PAD.left + chartInnerW() / 2
  return CHART_PAD.left + (index / (count - 1)) * chartInnerW()
}

function buildLinePath(
  points: readonly (number | null)[],
  min: number,
  max: number,
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
    const y = scaleY(v, min, max)
    seg.push(`${seg.length === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
  })
  if (seg.length > 1) segments.push(seg.join(' '))
  return segments.join(' ')
}

function YAxis({
  min,
  max,
  unit,
}: {
  readonly min: number
  readonly max: number
  readonly unit: string
}) {
  const ticks = 4
  return (
    <>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = min + ((max - min) * i) / ticks
        const y = scaleY(v, min, max)
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

function MonthXAxis({ months }: { readonly months: readonly string[] }) {
  return (
    <>
      {months.map((label, i) => {
        const x = scaleX(i, months.length)
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

function DayXAxis({ days, step }: { readonly days: number; readonly step: number }) {
  const labels: React.ReactNode[] = []
  for (let d = 1; d <= days; d += step) {
    const x = scaleX(d - 1, days)
    labels.push(
      <text
        key={d}
        x={x}
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

function AnnualTempChart({
  summaries,
  monthlyNormals,
}: {
  readonly summaries: readonly MonthlySummaryType[]
  readonly monthlyNormals: readonly { month: number; meanTempC: number | null; meanMaxTempC: number | null; meanMinTempC: number | null }[]
}) {
  const maxValues = summaries.map((s) => s.meanMaxTempC)
  const minValues = summaries.map((s) => s.meanMinTempC)
  const normMaxValues = MONTH_ABBR.map((_, i) => {
    const n = monthlyNormals.find((n) => n.month === i + 1)
    return n?.meanMaxTempC ?? null
  })
  const normMinValues = MONTH_ABBR.map((_, i) => {
    const n = monthlyNormals.find((n) => n.month === i + 1)
    return n?.meanMinTempC ?? null
  })

  const allValues = [...maxValues, ...minValues, ...normMaxValues, ...normMinValues].filter(
    (v): v is number => v != null,
  )
  if (allValues.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>
        No temperature data available.
      </p>
    )
  }

  const minV = Math.floor(Math.min(...allValues)) - 1
  const maxV = Math.ceil(Math.max(...allValues)) + 1

  const maxPath = buildLinePath(maxValues, minV, maxV)
  const minPath = buildLinePath(minValues, minV, maxV)
  const normMaxPath = buildLinePath(normMaxValues, minV, maxV)
  const normMinPath = buildLinePath(normMinValues, minV, maxV)

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      aria-label="Annual mean monthly temperature chart"
      role="img"
      style={{ width: '100%', height: 'auto', minWidth: 320 }}
    >
      <YAxis min={minV} max={maxV} unit="°C" />
      <MonthXAxis months={MONTH_ABBR} />
      {normMaxPath && (
        <path d={normMaxPath} fill="none" stroke={chartTokens.series.reference} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.7} />
      )}
      {normMinPath && (
        <path d={normMinPath} fill="none" stroke={chartTokens.series.reference} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.7} />
      )}
      {maxPath && (
        <path d={maxPath} fill="none" stroke={chartTokens.series.observed} strokeWidth={2} />
      )}
      {minPath && (
        <path d={minPath} fill="none" stroke={chartTokens.series.comparison} strokeWidth={2} />
      )}
    </svg>
  )
}

function MonthlyRainfallChart({
  summaries,
}: {
  readonly summaries: readonly MonthlySummaryType[]
}) {
  const values = summaries.map((s) => s.rainfallTotalMm)
  const valid = values.filter((v): v is number => v != null)
  if (valid.length === 0) {
    return (
      <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>
        No rainfall data available.
      </p>
    )
  }
  const maxV = Math.ceil(Math.max(...valid)) + 2
  const barW = Math.max(6, chartInnerW() / 12 - 2)

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      aria-label="Annual monthly rainfall bar chart"
      role="img"
      style={{ width: '100%', height: 'auto', minWidth: 320 }}
    >
      <YAxis min={0} max={maxV} unit="mm" />
      <MonthXAxis months={MONTH_ABBR} />
      {values.map((v, i) => {
        const x = scaleX(i, 12)
        if (v == null) {
          const y = CHART_PAD.top + chartInnerH() - 4
          return (
            <rect
              key={i}
              x={x - barW / 2}
              y={y}
              width={barW}
              height={4}
              fill={chartTokens.series.missing}
              opacity={0.5}
            />
          )
        }
        const y = scaleY(v, 0, maxV)
        const h = Math.max(1, CHART_PAD.top + chartInnerH() - y)
        const isAvailable = isRainfallAvailableForMonth(summaries[i]?.year ?? 0, i + 1)
        return (
          <rect
            key={i}
            x={x - barW / 2}
            y={y}
            width={barW}
            height={h}
            fill={isAvailable ? chartTokens.series.observed : chartTokens.series.missing}
            opacity={0.85}
          />
        )
      })}
    </svg>
  )
}

function DailyTempChart({
  records,
  normals,
}: {
  readonly records: readonly ClimateDay[]
  readonly normals: readonly DailyNormal[]
}) {
  const sorted = [...records].sort((a, b) => (a.date < b.date ? -1 : 1))
  const daysInMonth = sorted.length
  if (daysInMonth === 0) return null

  const maxValues = sorted.map((r) => r.maxTempC)
  const minValues = sorted.map((r) => r.minTempC)
  const normalMaxValues = sorted.map((r) => {
    const parts = r.date.split('-')
    const key = `${parts[1]}-${parts[2]}`
    return normals.find((n) => n.dateKey === key)?.normalMaxTempC ?? null
  })
  const normalMinValues = sorted.map((r) => {
    const parts = r.date.split('-')
    const key = `${parts[1]}-${parts[2]}`
    return normals.find((n) => n.dateKey === key)?.normalMinTempC ?? null
  })

  const allValues = [...maxValues, ...minValues, ...normalMaxValues, ...normalMinValues].filter(
    (v): v is number => v != null,
  )
  if (allValues.length === 0) return null

  const minV = Math.floor(Math.min(...allValues)) - 1
  const maxV = Math.ceil(Math.max(...allValues)) + 1

  const maxPath = buildLinePath(maxValues, minV, maxV)
  const minPath = buildLinePath(minValues, minV, maxV)
  const normMaxPath = buildLinePath(normalMaxValues, minV, maxV)
  const normMinPath = buildLinePath(normalMinValues, minV, maxV)

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      aria-label="Daily maximum and minimum temperature chart"
      role="img"
      style={{ width: '100%', height: 'auto', minWidth: 320 }}
    >
      <YAxis min={minV} max={maxV} unit="°C" />
      <DayXAxis days={daysInMonth} step={5} />
      {normMaxPath && (
        <path d={normMaxPath} fill="none" stroke={chartTokens.series.reference} strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
      )}
      {normMinPath && (
        <path d={normMinPath} fill="none" stroke={chartTokens.series.reference} strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
      )}
      {maxPath && (
        <path d={maxPath} fill="none" stroke={chartTokens.series.observed} strokeWidth={2} />
      )}
      {minPath && (
        <path d={minPath} fill="none" stroke={chartTokens.series.comparison} strokeWidth={2} />
      )}
    </svg>
  )
}

function DailyRainfallChart({
  records,
  showCumulative,
}: {
  readonly records: readonly ClimateDay[]
  readonly showCumulative: boolean
}) {
  const sorted = [...records].sort((a, b) => (a.date < b.date ? -1 : 1))
  const daysInMonth = sorted.length
  if (daysInMonth === 0) return null

  const values = sorted.map((r) => r.rainfallMm)
  const valid = values.filter((v): v is number => v != null)
  if (valid.length === 0) return null

  const maxV = Math.ceil(Math.max(...valid)) + 1
  const barW = Math.max(4, chartInnerW() / daysInMonth - 1)

  let cumulative = 0
  const cumulativeValues: Array<number | null> = values.map((v) => {
    if (v == null) return null
    cumulative += v
    return cumulative
  })
  const maxCumulative = cumulative > 0 ? cumulative : 1

  const cumulativePath = showCumulative
    ? buildLinePath(cumulativeValues, 0, maxCumulative)
    : ''

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      aria-label="Daily rainfall bar chart"
      role="img"
      style={{ width: '100%', height: 'auto', minWidth: 320 }}
    >
      <YAxis min={0} max={maxV} unit="mm" />
      <DayXAxis days={daysInMonth} step={5} />
      {values.map((v, i) => {
        const x = scaleX(i, daysInMonth)
        if (v == null) {
          const isAvailable = sorted[i] != null && sorted[i]!.date >= RAINFALL_START_DATE
          if (!isAvailable) return null
          return (
            <rect
              key={i}
              x={x - barW / 2}
              y={CHART_PAD.top + chartInnerH() - 3}
              width={barW}
              height={3}
              fill={chartTokens.series.missing}
              opacity={0.5}
            />
          )
        }
        const y = scaleY(v, 0, maxV)
        const h = Math.max(1, CHART_PAD.top + chartInnerH() - y)
        return (
          <rect
            key={i}
            x={x - barW / 2}
            y={y}
            width={barW}
            height={h}
            fill={chartTokens.series.observed}
            opacity={0.85}
          />
        )
      })}
      {showCumulative && cumulativePath && (
        <path
          d={cumulativePath}
          fill="none"
          stroke={chartTokens.series.reference}
          strokeWidth={1.5}
        />
      )}
    </svg>
  )
}

// ── Coverage summary ──────────────────────────────────────────────────────────

function CoverageSummary({
  valid,
  missing,
  expected,
  label,
}: {
  readonly valid: number
  readonly missing: number
  readonly expected: number
  readonly label: string
}) {
  if (missing === 0) return null
  return (
    <IncompleteDataWarning
      message={`${label}: ${valid}/${expected} days valid, ${missing} missing.`}
    />
  )
}

function AnnualTrendCharts({
  trendData,
}: {
  readonly trendData: ReturnType<typeof buildAnnualTrendData>
}) {
  if (trendData.points.length === 0) {
    return <p className="archive-obs-note">No annual trend data available.</p>
  }

  const charts = [
    {
      title: 'Mean maximum temperature by year',
      unit: WEATHER_UNITS.temperature,
      observedKey: 'meanMaxTempC',
      observedLabel: 'Observed mean max',
      referenceValue: trendData.references.meanMaxTempC,
      referenceLabel: 'Complete-year average',
    },
    {
      title: 'Mean minimum temperature by year',
      unit: WEATHER_UNITS.temperature,
      observedKey: 'meanMinTempC',
      observedLabel: 'Observed mean min',
      referenceValue: trendData.references.meanMinTempC,
      referenceLabel: 'Complete-year average',
    },
    {
      title: 'Mean temperature by year',
      unit: WEATHER_UNITS.temperature,
      observedKey: 'meanTempC',
      observedLabel: 'Observed mean temperature',
      referenceValue: trendData.references.meanTempC,
      referenceLabel: 'Complete-year average',
    },
    {
      title: 'Annual rainfall total by year',
      unit: WEATHER_UNITS.rainfall,
      observedKey: 'rainfallTotalMm',
      observedLabel: 'Annual rainfall total',
      referenceValue: trendData.references.rainfallTotalMm,
      referenceLabel: 'Complete-year average annual rainfall',
    },
  ] as const

  return (
    <div className="card-grid">
      {charts.map((chart) => {
        const rows = trendData.points.map((point) => ({
          timestamp: point.timestamp,
          label: `${point.label}${point.provisional ? ' (provisional)' : ''}`,
          provisional: point.provisional,
          values: {
            observed: point[chart.observedKey],
            reference: chart.referenceValue,
          },
        }))

        return (
          <div key={chart.title}>
            <h3>{chart.title}</h3>
            <ResponsiveChartContainer size="page">
              <DateSeriesChart
                rows={rows}
                unit={chart.unit}
                ariaLabel={chart.title}
                gapThresholdMs={Number.POSITIVE_INFINITY}
                xTickFormatter={formatAnnualChartTick}
                series={[
                  { key: 'observed', label: chart.observedLabel, color: chartTokens.series.observed },
                  { key: 'reference', label: chart.referenceLabel, color: chartTokens.series.reference, dashed: true },
                ]}
              />
            </ResponsiveChartContainer>
          </div>
        )
      })}
    </div>
  )
}

// ── Day details drawer ────────────────────────────────────────────────────────

function DayDetailsDrawer({
  day,
  normals,
  onClose,
}: {
  readonly day: ClimateDay | null
  readonly normals: readonly DailyNormal[]
  readonly onClose: () => void
}) {
  if (day == null) return null

  const parts = day.date.split('-')
  const monthNum = Number(parts[1])
  const dayNum = Number(parts[2])
  const dateKey = `${String(monthNum).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
  const normal = normals.find((n) => n.dateKey === dateKey) ?? null

  const maxAnomaly =
    day.maxTempC != null && normal?.normalMaxTempC != null
      ? day.maxTempC - normal.normalMaxTempC
      : null
  const minAnomaly =
    day.minTempC != null && normal?.normalMinTempC != null
      ? day.minTempC - normal.normalMinTempC
      : null
  const meanAnomaly =
    day.meanTempC != null && normal?.normalMeanTempC != null
      ? day.meanTempC - normal.normalMeanTempC
      : null

  return (
    <Modal
      title={`${formatEuropeLondonDisplay(day.date, DATE_FORMAT)} — daily detail`}
      open
      onClose={onClose}
    >
      <section aria-label="Daily observations">
        <h3>Observations</h3>
        <dl className="archive-detail-grid">
          <div>
            <dt>Maximum temperature</dt>
            <dd>{fmtTemp(day.maxTempC)}</dd>
          </div>
          <div>
            <dt>Minimum temperature</dt>
            <dd>{fmtTemp(day.minTempC)}</dd>
          </div>
          <div>
            <dt>Mean temperature</dt>
            <dd>{fmtTemp(day.meanTempC)}</dd>
          </div>
          <div>
            <dt>Rainfall</dt>
            <dd>{rainfallDisplay(day.date, day.rainfallMm)}</dd>
          </div>
        </dl>
      </section>

      {normal != null && (
        <section aria-label="Climate normals and anomalies">
          <h3>Normals &amp; anomalies <span className="archive-baseline-note">(1995–2024 daily baseline)</span></h3>
          <dl className="archive-detail-grid">
            <div>
              <dt>Normal max</dt>
              <dd>{fmtTemp(normal.normalMaxTempC)}</dd>
            </div>
            <div>
              <dt>Normal min</dt>
              <dd>{fmtTemp(normal.normalMinTempC)}</dd>
            </div>
            <div>
              <dt>Normal mean</dt>
              <dd>{fmtTemp(normal.normalMeanTempC)}</dd>
            </div>
            <div>
              <dt>Max anomaly</dt>
              <dd>{fmtAnomaly(maxAnomaly)}</dd>
            </div>
            <div>
              <dt>Min anomaly</dt>
              <dd>{fmtAnomaly(minAnomaly)}</dd>
            </div>
            <div>
              <dt>Mean anomaly</dt>
              <dd>{fmtAnomaly(meanAnomaly)}</dd>
            </div>
          </dl>
        </section>
      )}

      <section aria-label="Data status">
        <h3>Data status</h3>
        <p>
          <Badge
            variant={
              day.status === 'finalised'
                ? 'success'
                : day.status === 'provisional'
                  ? 'provisional'
                  : 'warning'
            }
          >
            {day.status.charAt(0).toUpperCase() + day.status.slice(1)}
          </Badge>
        </p>
      </section>

      <section aria-label="Links">
        <h3>Links</h3>
        <ul className="archive-detail-links">
          <li>
            <Link
              to={`/on-this-day?date=${day.date}`}
              className="link-focus"
            >
              On This Day — {formatEuropeLondonDisplay(day.date, { day: '2-digit', month: 'short' })}
            </Link>
          </li>
          <li>
            <Link
              to={`/data-corrections?date=${day.date}`}
              className="link-focus"
            >
              Data Corrections (authorised users only)
            </Link>
          </li>
        </ul>
      </section>
    </Modal>
  )
}

// ── Tied dates display ────────────────────────────────────────────────────────

function TiedDates({
  dates,
  label,
}: {
  readonly dates: readonly ClimateDateString[]
  readonly label: string
}) {
  if (dates.length === 0) return <span>—</span>
  return (
    <span aria-label={label}>
      {dates.map((d, i) => (
        <span key={d}>
          {i > 0 && ', '}
          {formatEuropeLondonDisplay(d, { day: '2-digit', month: 'short' })}
        </span>
      ))}
      {dates.length > 1 && (
        <Badge variant="default">&nbsp;{dates.length} tied</Badge>
      )}
    </span>
  )
}

// ── Monthly breakdown table (in annual view) ──────────────────────────────────

function MonthlyBreakdownTable({
  summaries,
  year,
  onSelectMonth,
}: {
  readonly summaries: readonly MonthlySummaryType[]
  readonly year: number
  readonly onSelectMonth: (month: number) => void
}) {
  return (
    <TableWrapper>
      <table aria-label="Monthly climate breakdown">
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Mean Max</th>
            <th scope="col">Mean Min</th>
            <th scope="col">Mean</th>
            <th scope="col">Rainfall</th>
            <th scope="col">Rain days</th>
            <th scope="col">Wettest day</th>
            <th scope="col">Coverage</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((m) => {
            const rainfallAvail = isRainfallAvailableForMonth(year, m.month)
            const rainfallValue =
              !rainfallAvail
                ? 'Unavailable'
                : m.rainfallTotalMm != null
                  ? fmtRainfall(m.rainfallTotalMm)
                  : '—'
            const expected = m.coverage.maxTemperature.availableDays + m.coverage.maxTemperature.missing
            const coverageText = `${m.coverage.maxTemperature.valid}/${expected}`

            return (
              <tr key={m.month}>
                <td>
                  <button
                    type="button"
                    className="button button-ghost archive-month-link"
                    onClick={() => { onSelectMonth(m.month) }}
                  >
                    {MONTH_NAMES[m.month - 1]}
                  </button>
                </td>
                <td>{fmtTemp(m.meanMaxTempC)}</td>
                <td>{fmtTemp(m.meanMinTempC)}</td>
                <td>{fmtTemp(m.meanTempC)}</td>
                <td>{rainfallValue}</td>
                <td>{rainfallAvail ? m.rainDays : '—'}</td>
                <td>
                  {rainfallAvail ? fmtRainfall(m.wettestDay.value) : '—'}
                </td>
                <td>{m.coverage.provisional ? `${coverageText} Prov.` : coverageText}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableWrapper>
  )
}

// ── Annual view ───────────────────────────────────────────────────────────────

function AnnualView({
  summary,
  year,
  records,
  dailyNormals,
  payload,
  monthlyNormals,
  onSelectMonth,
  trendData,
}: {
  readonly summary: AnnualSummaryType
  readonly year: number
  readonly records: readonly ClimateDay[]
  readonly dailyNormals: readonly DailyNormal[]
  readonly payload: { complete: boolean; through: ClimateDateString | null; observationCount: number | null }
  readonly monthlyNormals: readonly { month: number; meanTempC: number | null; meanMaxTempC: number | null; meanMinTempC: number | null }[]
  readonly onSelectMonth: (month: number) => void
  readonly trendData: ReturnType<typeof buildAnnualTrendData>
}) {
  const rainfallYearAvailable = isRainfallAvailableForYear(year)
  const rainfallYearComplete = rainfallYearAvailable && summary.coverage.rainfall.complete

  const handleExportCsv = useCallback(() => {
    const csv = buildAnnualMonthlyCsv(year, summary.monthlySummaries)
    downloadCsvBlob(csv, `climate-${year}-monthly.csv`)
  }, [year, summary.monthlySummaries])

  return (
    <div className="archive-annual-layout">
      {summary.coverage.provisional && (
        <div className="card archive-provisional-banner">
          <ProvisionalBadge />
          <span>
            {' '}This year is still in progress. Data through{' '}
            {payload.through
              ? formatEuropeLondonDisplay(payload.through, { day: '2-digit', month: 'short', year: 'numeric' })
              : 'an unknown date'}{' '}
            is shown.
          </span>
        </div>
      )}
      {!payload.complete && !summary.coverage.provisional && (
        <IncompleteDataWarning message="This year's archive is incomplete. Some months may be missing observations." />
      )}
      {year === 2020 && (
        <IncompleteDataWarning message="2020 is not a complete rainfall year. Rainfall records begin 1 May 2020." />
      )}

      <section className="card" aria-labelledby="annual-headline">
        <div className="archive-card-heading">
          <h2 id="annual-headline">Annual summary — {year}</h2>
          <button type="button" className="button" onClick={handleExportCsv}>
            Export monthly CSV
          </button>
        </div>

        <dl className="archive-stats-grid">
          <div>
            <dt>Annual mean max</dt>
            <dd>{fmtTemp(summary.meanMaxTempC)}</dd>
          </div>
          <div>
            <dt>Annual mean min</dt>
            <dd>{fmtTemp(summary.meanMinTempC)}</dd>
          </div>
          <div>
            <dt>Annual mean temperature</dt>
            <dd>
              {fmtTemp(summary.meanTempC)}
              {summary.meanTempAnomalyC != null ? ` (${fmtAnomaly(summary.meanTempAnomalyC)})` : ''}
            </dd>
          </div>
          <div>
            <dt>Highest maximum</dt>
            <dd>
              {fmtTemp(summary.highestMax.value)}{' '}
              <TiedDates dates={summary.highestMax.dates} label="Dates of highest max" />
            </dd>
          </div>
          <div>
            <dt>Lowest minimum</dt>
            <dd>
              {fmtTemp(summary.lowestMin.value)}{' '}
              <TiedDates dates={summary.lowestMin.dates} label="Dates of lowest min" />
            </dd>
          </div>
          <div>
            <dt>Rainfall total</dt>
            <dd>
              {rainfallYearAvailable ? (
                <>
                  {fmtRainfall(summary.rainfallTotalMm)}
                  {summary.rainfallPercentageOfNormal != null
                    ? ` (${fmtPercent(summary.rainfallPercentageOfNormal)} of normal)`
                    : ''}
                  {!rainfallYearComplete && (
                    <Badge variant="warning">&nbsp;Partial year</Badge>
                  )}
                </>
              ) : (
                'Unavailable'
              )}
            </dd>
          </div>
          <div>
            <dt>Rain days</dt>
            <dd>{rainfallYearAvailable ? summary.rainDays : '—'}</dd>
          </div>
          <div>
            <dt>Wettest day</dt>
            <dd>
              {rainfallYearAvailable ? (
                <>
                  {fmtRainfall(summary.wettestDay.value)}{' '}
                  <TiedDates dates={summary.wettestDay.dates} label="Dates of wettest day" />
                </>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt>Temperature coverage</dt>
            <dd>
              {summary.coverage.maxTemperature.valid}/{summary.coverage.expectedDays} valid
              {' '}({summary.coverage.maxTemperature.missing} missing)
            </dd>
          </div>
          <div>
            <dt>Rainfall coverage</dt>
            <dd>
              {rainfallYearAvailable
                ? `${summary.coverage.rainfall.valid}/${summary.coverage.rainfall.availableDays} valid (${summary.coverage.rainfall.missing} missing)`
                : 'Unavailable'}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              {summary.coverage.provisional
                ? 'Provisional'
                : payload.complete && (!rainfallYearAvailable || rainfallYearComplete)
                  ? 'Complete'
                  : 'Incomplete'}
            </dd>
          </div>
        </dl>

        <div className="archive-coverage-warnings">
          <CoverageSummary
            valid={summary.coverage.maxTemperature.valid}
            missing={summary.coverage.maxTemperature.missing}
            expected={summary.coverage.maxTemperature.availableDays}
            label="Max temperature"
          />
          <CoverageSummary
            valid={summary.coverage.minTemperature.valid}
            missing={summary.coverage.minTemperature.missing}
            expected={summary.coverage.minTemperature.availableDays}
            label="Min temperature"
          />
          {rainfallYearAvailable && (
            <CoverageSummary
              valid={summary.coverage.rainfall.valid}
              missing={summary.coverage.rainfall.missing}
              expected={summary.coverage.rainfall.availableDays}
              label="Rainfall"
            />
          )}
        </div>

        <p className="archive-obs-note">
          Valid observations: {payload.observationCount ?? summary.coverage.maxTemperature.valid}.
        </p>
      </section>

      <section className="card" aria-labelledby="monthly-breakdown-title">
        <h2 id="monthly-breakdown-title">Monthly breakdown</h2>
        <MonthlyBreakdownTable
          summaries={summary.monthlySummaries}
          year={year}
          onSelectMonth={onSelectMonth}
        />
      </section>

      <section className="card" aria-labelledby="annual-temp-chart-title">
        <h2 id="annual-temp-chart-title">Monthly mean temperature</h2>
        <p className="archive-legend">
          <span className="legend-swatch" style={{ background: 'var(--chart-series-observed)' }} /> Mean Max
          <span style={{ marginLeft: '0.8rem' }} />
          <span className="legend-swatch" style={{ background: 'var(--chart-series-comparison)' }} /> Mean Min
          <span style={{ marginLeft: '0.8rem' }} />
          <span className="legend-swatch legend-dashed" style={{ background: 'var(--chart-series-reference)' }} /> Normals
        </p>
        <ResponsiveChartContainer size="page">
          <AnnualTempChart
            summaries={summary.monthlySummaries}
            monthlyNormals={monthlyNormals}
          />
        </ResponsiveChartContainer>
      </section>

      {rainfallYearAvailable && (
        <section className="card" aria-labelledby="annual-rain-chart-title">
          <h2 id="annual-rain-chart-title">Monthly rainfall</h2>
          <ResponsiveChartContainer size="page">
            <MonthlyRainfallChart summaries={summary.monthlySummaries} />
          </ResponsiveChartContainer>
        </section>
      )}

      <section className="card" aria-labelledby="annual-trends-title">
        <h2 id="annual-trends-title">Annual trend charts</h2>
        <p className="archive-obs-note">
          Reference lines use complete years only. Incomplete or provisional years remain visible but are excluded from long-term averages and complete-year comparisons.
        </p>
        <AnnualTrendCharts trendData={trendData} />
      </section>

      <ClimateStatsCharts
        year={year}
        records={records}
        summaries={summary.monthlySummaries}
        dailyNormals={dailyNormals}
        monthlyNormals={monthlyNormals}
      />

      <section className="card" aria-labelledby="archive-links-title">
        <h2 id="archive-links-title">Related</h2>
        <ul className="archive-links-list">
          <li>
            <Link to={`/reports?year=${year}`} className="link-focus">
              View {year} annual report
            </Link>
          </li>
          <li>
            <Link to="/records" className="link-focus">
              All-time records
            </Link>
          </li>
        </ul>
      </section>
    </div>
  )
}

// ── Monthly view ──────────────────────────────────────────────────────────────

type SortAction = { type: 'toggle'; key: SortKey }

function sortReducer(state: SortState, action: SortAction): SortState {
  if (action.type === 'toggle') {
    if (state.key === action.key) {
      return { ...state, dir: state.dir === 'asc' ? 'desc' : 'asc' }
    }
    return { key: action.key, dir: 'asc' }
  }
  return state
}

function SortButton({
  label,
  sortKey,
  current,
  onSort,
}: {
  readonly label: string
  readonly sortKey: SortKey
  readonly current: SortState
  readonly onSort: (key: SortKey) => void
}) {
  const active = current.key === sortKey
  return (
    <button
      type="button"
      className={`archive-sort-btn${active ? ' archive-sort-btn--active' : ''}`}
      onClick={() => { onSort(sortKey) }}
      aria-sort={active ? (current.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      {active ? (current.dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </button>
  )
}

function MonthlyView({
  year,
  month,
  allRecords,
  summary,
  monthlyNormal,
  dailyNormals,
  onBack,
}: {
  readonly year: number
  readonly month: number
  readonly allRecords: readonly ClimateDay[]
  readonly summary: MonthlySummaryType
  readonly monthlyNormal: { month: number; meanMaxTempC: number | null; meanMinTempC: number | null; meanTempC: number | null; rainfallMm: number | null } | null
  readonly dailyNormals: readonly DailyNormal[]
  readonly onBack: () => void
}) {
  const [sort, dispatchSort] = useReducer(sortReducer, { key: 'date', dir: 'asc' })
  const [selectedDay, setSelectedDay] = useState<ClimateDay | null>(null)
  const [showCumulative, setShowCumulative] = useState(false)

  const monthRecords = useMemo(
    () =>
      allRecords.filter((r) => {
        const parts = r.date.split('-')
        return Number(parts[0]) === year && Number(parts[1]) === month
      }),
    [allRecords, year, month],
  )

  const displayedRecords = useMemo(
    () => sortedRecords(monthRecords, sort),
    [monthRecords, sort],
  )

  const rainfallAvailable = isRainfallAvailableForMonth(year, month)

  const handleSort = useCallback((key: SortKey) => {
    dispatchSort({ type: 'toggle', key })
  }, [])

  const handleExportCsv = useCallback(() => {
    const csv = buildDailyCsv(allRecords, year, month)
    const monthStr = String(month).padStart(2, '0')
    downloadCsvBlob(csv, `climate-${year}-${monthStr}-daily.csv`)
  }, [allRecords, year, month])

  return (
    <div className="archive-monthly-layout">
      <div className="archive-monthly-header">
        <button type="button" className="button button-ghost" onClick={onBack}>
          ← Annual view
        </button>
        <h2>
          {MONTH_NAMES[month - 1]} {year}
          {summary.coverage.provisional && <> <ProvisionalBadge /></>}
        </h2>
      </div>

      {summary.coverage.provisional && (
        <div className="card archive-provisional-banner">
          <ProvisionalBadge />
          <span> This month is still in progress and data is provisional.</span>
        </div>
      )}
      {year === 2020 && month < 5 && (
        <IncompleteDataWarning message="Rainfall data is unavailable before 1 May 2020." />
      )}
      {year === 2020 && month === 5 && (
        <IncompleteDataWarning message="Rainfall records begin 1 May 2020. January–April are unavailable." />
      )}

      <section className="card" aria-labelledby="monthly-summary-title">
        <div className="archive-card-heading">
          <h2 id="monthly-summary-title">Monthly summary</h2>
          <button type="button" className="button" onClick={handleExportCsv}>
            Export daily CSV
          </button>
        </div>

        <dl className="archive-stats-grid">
          <div>
            <dt>Highest maximum</dt>
            <dd>
              {fmtTemp(summary.highestMax.value)}{' '}
              <TiedDates dates={summary.highestMax.dates} label="Dates of highest max" />
            </dd>
          </div>
          <div>
            <dt>Lowest minimum</dt>
            <dd>
              {fmtTemp(summary.lowestMin.value)}{' '}
              <TiedDates dates={summary.lowestMin.dates} label="Dates of lowest min" />
            </dd>
          </div>
          <div>
            <dt>Mean maximum</dt>
            <dd>
              {fmtTemp(summary.meanMaxTempC)}
              {summary.meanMaxTempAnomalyC != null && (
                <span className="archive-anomaly">{fmtAnomaly(summary.meanMaxTempAnomalyC)}</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Mean minimum</dt>
            <dd>
              {fmtTemp(summary.meanMinTempC)}
              {summary.meanMinTempAnomalyC != null && (
                <span className="archive-anomaly">{fmtAnomaly(summary.meanMinTempAnomalyC)}</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Mean temperature</dt>
            <dd>
              {fmtTemp(summary.meanTempC)}
              {summary.meanTempAnomalyC != null && (
                <span className="archive-anomaly">{fmtAnomaly(summary.meanTempAnomalyC)}</span>
              )}
            </dd>
          </div>
          {rainfallAvailable ? (
            <>
              <div>
                <dt>Rainfall total</dt>
                <dd>{fmtRainfall(summary.rainfallTotalMm)}</dd>
              </div>
              <div>
                <dt>Rainfall normal ({MONTHLY_NORMAL_BASELINE})</dt>
                <dd>{fmtRainfall(monthlyNormal?.rainfallMm ?? null)}</dd>
              </div>
              <div>
                <dt>Rainfall % of normal</dt>
                <dd>{fmtPercent(summary.rainfallPercentageOfNormal)}</dd>
              </div>
              <div>
                <dt>Rain days (&gt;0.1 mm)</dt>
                <dd>{summary.rainDays}</dd>
              </div>
              <div>
                <dt>Wettest day</dt>
                <dd>
                  {fmtRainfall(summary.wettestDay.value)}{' '}
                  <TiedDates dates={summary.wettestDay.dates} label="Dates of wettest day" />
                </dd>
              </div>
            </>
          ) : (
            <div>
              <dt>Rainfall</dt>
              <dd>Unavailable (pre-May 2020)</dd>
            </div>
          )}
        </dl>

        <div className="archive-coverage-warnings">
          <p className="archive-obs-note">
            Temperature: {summary.coverage.maxTemperature.valid} valid,{' '}
            {summary.coverage.maxTemperature.missing} missing,{' '}
            {summary.coverage.expectedDays} expected days.
            {rainfallAvailable && (
              <> Rainfall: {summary.coverage.rainfall.valid} valid,{' '}
              {summary.coverage.rainfall.missing} missing.</>
            )}
          </p>
          <CoverageSummary
            valid={summary.coverage.maxTemperature.valid}
            missing={summary.coverage.maxTemperature.missing}
            expected={summary.coverage.maxTemperature.availableDays}
            label="Max temperature"
          />
          {rainfallAvailable && (
            <CoverageSummary
              valid={summary.coverage.rainfall.valid}
              missing={summary.coverage.rainfall.missing}
              expected={summary.coverage.rainfall.availableDays}
              label="Rainfall"
            />
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="monthly-temp-chart-title">
        <h2 id="monthly-temp-chart-title">Daily temperatures</h2>
        <p className="archive-legend">
          <span className="legend-swatch" style={{ background: 'var(--chart-series-observed)' }} /> Max
          <span style={{ marginLeft: '0.8rem' }} />
          <span className="legend-swatch" style={{ background: 'var(--chart-series-comparison)' }} /> Min
          <span style={{ marginLeft: '0.8rem' }} />
          <span className="legend-swatch legend-dashed" style={{ background: 'var(--chart-series-reference)' }} /> Normals (1995–2024)
        </p>
        <ResponsiveChartContainer size="page">
          <DailyTempChart records={monthRecords} normals={dailyNormals} />
        </ResponsiveChartContainer>
      </section>

      {rainfallAvailable && (
        <section className="card" aria-labelledby="monthly-rain-chart-title">
          <div className="archive-card-heading">
            <h2 id="monthly-rain-chart-title">Daily rainfall</h2>
            <label className="archive-toggle-label">
              <input
                type="checkbox"
                checked={showCumulative}
                onChange={(e: ChangeEvent<HTMLInputElement>) => { setShowCumulative(e.target.checked) }}
              />
              <span> Show cumulative</span>
            </label>
          </div>
          <ResponsiveChartContainer size="page">
            <DailyRainfallChart records={monthRecords} showCumulative={showCumulative} />
          </ResponsiveChartContainer>
        </section>
      )}

      <section className="card" aria-labelledby="daily-table-title">
        <h2 id="daily-table-title">Daily observations</h2>
        <TableWrapper>
          <table aria-label={`Daily observations for ${MONTH_NAMES[month - 1]} ${year}`}>
            <thead>
              <tr>
                <th scope="col">
                  <SortButton label="Date" sortKey="date" current={sort} onSort={handleSort} />
                </th>
                <th scope="col">
                  <SortButton label="Max" sortKey="max" current={sort} onSort={handleSort} />
                </th>
                <th scope="col">
                  <SortButton label="Min" sortKey="min" current={sort} onSort={handleSort} />
                </th>
                <th scope="col" className="archive-hide-compact">
                  <SortButton label="Mean" sortKey="mean" current={sort} onSort={handleSort} />
                </th>
                <th scope="col">
                  <SortButton label="Rainfall" sortKey="rainfall" current={sort} onSort={handleSort} />
                </th>
                <th scope="col" className="archive-hide-compact">Status</th>
              </tr>
            </thead>
            <tbody>
              {displayedRecords.map((record) => (
                <tr
                  key={record.date}
                  className="archive-daily-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => { setSelectedDay(record) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setSelectedDay(record)
                    }
                  }}
                  aria-label={`Show details for ${record.date}`}
                >
                  <td>{formatEuropeLondonDisplay(record.date, { day: '2-digit', month: 'short' })}</td>
                  <td>{fmtTemp(record.maxTempC)}</td>
                  <td>{fmtTemp(record.minTempC)}</td>
                  <td className="archive-hide-compact">{fmtTemp(record.meanTempC)}</td>
                  <td>{rainfallDisplay(record.date, record.rainfallMm)}</td>
                  <td className="archive-hide-compact">
                    <Badge
                      variant={
                        record.status === 'finalised'
                          ? 'success'
                          : record.status === 'provisional'
                            ? 'provisional'
                            : 'warning'
                      }
                    >
                      {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>
      </section>

      <DayDetailsDrawer
        day={selectedDay}
        normals={dailyNormals}
        onClose={() => { setSelectedDay(null) }}
      />

      <section className="card" aria-labelledby="monthly-links-title">
        <h2 id="monthly-links-title">Related</h2>
        <ul className="archive-links-list">
          <li>
            <Link to={`/reports?year=${year}&month=${month}`} className="link-focus">
              View {MONTH_NAMES[month - 1]} {year} report
            </Link>
          </li>
          <li>
            <Link to="/records" className="link-focus">
              All-time records
            </Link>
          </li>
        </ul>
      </section>
    </div>
  )
}

// ── Archive header ────────────────────────────────────────────────────────────

function ArchiveHeader({
  archiveIndex,
}: {
  readonly archiveIndex: { station: string; years: readonly { year: number; startDate: string | null; endDate: string | null }[] } | null | undefined
}) {
  if (archiveIndex == null) return null

  const years = archiveIndex.years
  const firstYear = years.length > 0 ? years[0]?.year : null
  const lastYear = years.length > 0 ? years.at(-1)?.year : null

  return (
    <section className="card archive-coverage-header" aria-labelledby="archive-coverage-title">
      <h2 id="archive-coverage-title">Archive coverage</h2>
      <dl className="archive-coverage-dl">
        <div>
          <dt>Station</dt>
          <dd>{archiveIndex.station}</dd>
        </div>
        <div>
          <dt>Temperature records</dt>
          <dd>From 1995</dd>
        </div>
        <div>
          <dt>Rainfall records</dt>
          <dd>From 1 May 2020</dd>
        </div>
        <div>
          <dt>Archive years</dt>
          <dd>
            {firstYear != null && lastYear != null
              ? `${firstYear}–${lastYear} (${years.length} year${years.length === 1 ? '' : 's'})`
              : '—'}
          </dd>
        </div>
      </dl>
    </section>
  )
}

// ── Archive selection controls ────────────────────────────────────────────────

function ArchiveControls({
  availableYears,
  year,
  month,
  view,
  onYearChange,
  onMonthChange,
}: {
  readonly availableYears: readonly number[]
  readonly year: number
  readonly month: number | null
  readonly view: 'annual' | 'monthly'
  readonly onYearChange: (year: number) => void
  readonly onMonthChange: (month: number | null) => void
}) {
  const yearsDescending = useMemo(
    () => [...availableYears].sort((a, b) => b - a),
    [availableYears],
  )

  return (
    <section className="card archive-controls" aria-label="Archive selection">
      <div className="archive-controls-row">
        <label className="archive-label" htmlFor="archive-year-select">
          Year
        </label>
        <select
          id="archive-year-select"
          value={year}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => { onYearChange(Number(e.target.value)) }}
          className="archive-select"
        >
          {yearsDescending.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <div className="archive-view-toggle" role="group" aria-label="View mode">
          <button
            type="button"
            className={`archive-toggle-btn${view === 'annual' ? ' archive-toggle-btn--active' : ''}`}
            onClick={() => { onMonthChange(null) }}
            aria-pressed={view === 'annual'}
          >
            Annual
          </button>
          <button
            type="button"
            className={`archive-toggle-btn${view === 'monthly' ? ' archive-toggle-btn--active' : ''}`}
            onClick={() => {
              if (month == null) {
                onMonthChange(new Date().getMonth() + 1)
              }
            }}
            aria-pressed={view === 'monthly'}
          >
            Monthly
          </button>
        </div>

        {view === 'monthly' && (
          <>
            <label className="archive-label" htmlFor="archive-month-select">
              Month
            </label>
            <select
              id="archive-month-select"
              value={month ?? 1}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => { onMonthChange(Number(e.target.value)) }}
              className="archive-select"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </>
        )}
      </div>
    </section>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ClimateArchivePage() {
  const archiveIndexQuery = useClimateArchiveIndexQuery()
  const monthlyNormalsQuery = useMonthlyNormalsQuery()
  const dailyNormalsQuery = useDailyNormalsQuery()

  const availableYears = useMemo(
    () => (archiveIndexQuery.data?.years ?? []).map((y) => y.year).sort((a, b) => a - b),
    [archiveIndexQuery.data],
  )

  const { year, month, view, setYear, setMonth } = useArchiveSelection(availableYears)

  const annualQuery = useAnnualClimateQuery(year)
  const annualTrendQueries = useAnnualClimateQueries(availableYears, {
    enabled: view === 'annual' && availableYears.length > 0,
  })

  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  // Support ?date=YYYY-MM-DD links from other pages (e.g. OverviewPage)
  // Redirect once on mount so the URL stays clean
  const handled = useState(false)
  if (!handled[0]) {
    handled[1](true)
    const dateParam = searchParams.get('date')
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && !searchParams.has('year')) {
      const parts = dateParam.split('-')
      const y = Number(parts[0])
      const m = Number(parts[1])
      if (y && m) {
        setTimeout(() => {
          navigate(`/climate-archive?year=${y}&month=${m}`, { replace: true })
        }, 0)
      }
    }
  }

  const monthlyNormals = monthlyNormalsQuery.data?.months ?? []
  const dailyNormals = dailyNormalsQuery.data?.records ?? []
  const records = annualQuery.data?.records ?? []
  const annualTrendPayloads = useMemo(
    () =>
      annualTrendQueries
        .map((query) => query.data)
        .filter((payload): payload is NonNullable<typeof payload> => payload != null),
    [annualTrendQueries],
  )
  const annualTrendData = useMemo(
    () => buildAnnualTrendData(annualTrendPayloads, monthlyNormals),
    [annualTrendPayloads, monthlyNormals],
  )

  const annualSummary = useMemo(() => {
    if (records.length === 0) return null
    return buildAnnualSummary(year, records, monthlyNormals)
  }, [year, records, monthlyNormals])

  const monthlySummary = useMemo(() => {
    if (month == null || records.length === 0) return null
    const normal = monthlyNormals.find((n) => n.month === month) ?? null
    return buildMonthlySummary(year, month, records, normal)
  }, [year, month, records, monthlyNormals])

  // ── Loading / error states ───────────────────────────────────────────────

  const indexLoading = archiveIndexQuery.isLoading && archiveIndexQuery.data == null
  if (indexLoading) {
    return (
      <section className="card" aria-live="polite">
        <Skeleton lines={4} />
        <VisuallyHidden>Loading climate archive index</VisuallyHidden>
      </section>
    )
  }

  if (archiveIndexQuery.error != null && archiveIndexQuery.data == null) {
    return (
      <ErrorState
        title="Archive index unavailable"
        message="Unable to load the climate archive index. Please try again."
        onRetry={() => { void archiveIndexQuery.refetch() }}
      />
    )
  }

  const annualLoading = annualQuery.isLoading && annualQuery.data == null
  if (annualLoading) {
    return (
      <>
        <ArchiveHeader archiveIndex={archiveIndexQuery.data} />
        <ArchiveControls
          availableYears={availableYears}
          year={year}
          month={month}
          view={view}
          onYearChange={setYear}
          onMonthChange={setMonth}
        />
        <section className="card" aria-live="polite">
          <Skeleton lines={6} />
          <VisuallyHidden>Loading {year} climate data</VisuallyHidden>
        </section>
      </>
    )
  }

  if (annualQuery.error != null && annualQuery.data == null) {
    return (
      <>
        <ArchiveHeader archiveIndex={archiveIndexQuery.data} />
        <ArchiveControls
          availableYears={availableYears}
          year={year}
          month={month}
          view={view}
          onYearChange={setYear}
          onMonthChange={setMonth}
        />
        <ErrorState
          title={`${year} data unavailable`}
          message={`Unable to load climate data for ${year}. Please try again.`}
          onRetry={() => { void annualQuery.refetch() }}
        />
      </>
    )
  }

  if (annualQuery.data == null || annualSummary == null) {
    return (
      <>
        <ArchiveHeader archiveIndex={archiveIndexQuery.data} />
        <ArchiveControls
          availableYears={availableYears}
          year={year}
          month={month}
          view={view}
          onYearChange={setYear}
          onMonthChange={setMonth}
        />
        <section className="card" role="status">
          <p>No climate data available for {year}.</p>
        </section>
      </>
    )
  }

  return (
    <div className="archive-layout">
      <ArchiveHeader archiveIndex={archiveIndexQuery.data} />
      <ArchiveControls
        availableYears={availableYears}
        year={year}
        month={month}
        view={view}
        onYearChange={setYear}
        onMonthChange={setMonth}
      />

      {view === 'annual' ? (
        <AnnualView
          summary={annualSummary}
          year={year}
          records={records}
          dailyNormals={dailyNormals}
          payload={{
            complete: annualQuery.data.complete,
            through: annualQuery.data.through,
            observationCount: annualQuery.data.observationCount,
          }}
          monthlyNormals={monthlyNormals}
          onSelectMonth={setMonth}
          trendData={annualTrendData}
        />
      ) : (
        month != null && monthlySummary != null ? (
          <MonthlyView
            year={year}
            month={month}
            allRecords={records}
            summary={monthlySummary}
            monthlyNormal={monthlyNormals.find((n) => n.month === month) ?? null}
            dailyNormals={dailyNormals}
            onBack={() => { setMonth(null) }}
          />
        ) : null
      )}
    </div>
  )
}
