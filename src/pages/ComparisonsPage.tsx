/**
 * Comparisons tab – full implementation.
 *
 * Supports six comparison modes:
 *   date-vs-date | month-vs-month | year-vs-year | season-vs-season
 *   same-period  | custom
 *
 * All selections are stored in URL query parameters so comparisons are
 * shareable and survive page refreshes.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  useAnnualClimateQueries,
  useMonthlyNormalsQuery,
} from '@/hooks/usePublicWeatherQueries'
import {
  formatNullableMeasurement,
  getEuropeLondonClimateDate,
  parseIsoClimateDate,
} from '@/lib/climate'
import {
  buildComparisonPeriodResult,
  buildComparisonResult,
  buildSamePeriodResults,
  deriveOutcomeLabel,
} from '@/features/comparisons/calculations'
import {
  getSeasonDateRange,
  periodDurationDays,
  resolveSamePeriodForYear,
  seasonLabel,
  selectorToUrlParams,
  urlParamsToSelector,
  validateSelector,
  yearsRequiredForTwoPeriod,
} from '@/features/comparisons/selectionLogic'
import {
  buildComparisonCsv,
  buildSamePeriodCsv,
} from '@/features/comparisons/csv'
import { downloadCsvBlob } from '@/features/climateArchive/csv'
import type {
  ClimateDateString,
  ClimateDay,
  ComparisonPeriodResult,
  ComparisonResult,
  MeteorologicalSeason,
  MonthlyNormal,
} from '@/types/weather'
import type {
  ComparisonSelector,
  CustomPeriodSelector,
  DateVsDateSelector,
  MonthVsMonthSelector,
  SamePeriodSelection,
  SamePeriodSelector,
  SeasonVsSeasonSelector,
  TwoPeriodSelection,
  ValidationResult,
  YearVsYearSelector,
} from '@/features/comparisons/types'
import type { SamePeriodYearResult } from '@/features/comparisons/calculations'

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const SEASONS: MeteorologicalSeason[] = ['winter', 'spring', 'summer', 'autumn']

const MODES: { id: ComparisonSelector['mode']; label: string }[] = [
  { id: 'date-vs-date', label: 'Date' },
  { id: 'month-vs-month', label: 'Month' },
  { id: 'year-vs-year', label: 'Year' },
  { id: 'season-vs-season', label: 'Season' },
  { id: 'same-period', label: 'Same Period' },
  { id: 'custom', label: 'Custom' },
]

const HEAVY_RAIN_THRESHOLD_MM = 10

// Year range available in the archive
const FIRST_YEAR = 1995
const THIS_YEAR = parseIsoClimateDate(getEuropeLondonClimateDate()).year

function yearOptions(): number[] {
  const years: number[] = []
  for (let y = THIS_YEAR; y >= FIRST_YEAR; y--) years.push(y)
  return years
}

// ── Small utilities ───────────────────────────────────────────────────────────

function fmt(value: number | null, unit?: string): string {
  return formatNullableMeasurement(value, { unit, nullText: '—' })
}

function fmtInt(value: number | null): string {
  if (value == null) return '—'
  return String(value)
}

function fmtPct(value: number | null): string {
  if (value == null) return '—'
  return value.toFixed(0) + '%'
}

function fmtDiff(value: number | null, unit?: string): string {
  if (value == null) return '—'
  const sign = value > 0 ? '+' : ''
  const formatted = formatNullableMeasurement(value, { unit, nullText: '—' })
  return formatted === '—' ? '—' : sign + formatted
}

function fmtPctDiff(value: number | null): string {
  if (value == null) return '—'
  const sign = value > 0 ? '+' : ''
  return sign + value.toFixed(1) + '%'
}

function ProvisionalBadge({ provisional }: { provisional: boolean }) {
  if (!provisional) return null
  return (
    <span className="badge badge--provisional" aria-label="provisional">
      Provisional
    </span>
  )
}

function OutcomeBadge({
  outcome,
}: {
  outcome: 'warmer' | 'colder' | 'wetter' | 'drier' | 'similar' | null
}) {
  if (outcome == null) return null
  const cls = {
    warmer: 'badge badge--warm',
    colder: 'badge badge--cool',
    wetter: 'badge badge--wet',
    drier: 'badge badge--dry',
    similar: 'badge',
  }[outcome]
  return <span className={cls}>{outcome.charAt(0).toUpperCase() + outcome.slice(1)}</span>
}

// ── Default selectors for each mode ──────────────────────────────────────────

function defaultSelector(mode: ComparisonSelector['mode']): ComparisonSelector {
  switch (mode) {
    case 'date-vs-date':
      return { mode, leftDate: '', rightDate: '' }
    case 'month-vs-month':
      return { mode, leftYear: THIS_YEAR, leftMonth: null, rightYear: THIS_YEAR - 1, rightMonth: null }
    case 'year-vs-year':
      return { mode, leftYear: THIS_YEAR, rightYear: THIS_YEAR - 1 }
    case 'season-vs-season':
      return {
        mode,
        leftSeason: 'summer',
        leftSeasonYear: THIS_YEAR,
        rightSeason: 'summer',
        rightSeasonYear: THIS_YEAR - 1,
      }
    case 'same-period':
      return { mode, startMD: '06-01', endMD: '08-31', years: [THIS_YEAR, THIS_YEAR - 1] }
    case 'custom':
      return { mode, leftStart: '', leftEnd: '', rightStart: '', rightEnd: '' }
  }
}

// ── Selector panel components ─────────────────────────────────────────────────

function DateVsDatePanel({
  selector,
  onChange,
}: {
  selector: DateVsDateSelector
  onChange: (s: DateVsDateSelector) => void
}) {
  return (
    <div className="comparisons-selector-grid">
      <div className="comparisons-selector-side">
        <label className="field-label" htmlFor="dvd-left">Period A</label>
        <input
          id="dvd-left"
          type="date"
          className="input"
          value={selector.leftDate}
          onChange={(e) =>
            onChange({ ...selector, leftDate: e.target.value as ClimateDateString })
          }
        />
      </div>
      <div className="comparisons-vs-label" aria-hidden="true">vs</div>
      <div className="comparisons-selector-side">
        <label className="field-label" htmlFor="dvd-right">Period B</label>
        <input
          id="dvd-right"
          type="date"
          className="input"
          value={selector.rightDate}
          onChange={(e) =>
            onChange({ ...selector, rightDate: e.target.value as ClimateDateString })
          }
        />
      </div>
    </div>
  )
}

function MonthVsMonthPanel({
  selector,
  onChange,
}: {
  selector: MonthVsMonthSelector
  onChange: (s: MonthVsMonthSelector) => void
}) {
  const years = yearOptions()
  return (
    <div className="comparisons-selector-grid">
      <div className="comparisons-selector-side">
        <label className="field-label" htmlFor="mvm-left-year">Period A</label>
        <div className="input-row">
          <select
            id="mvm-left-year"
            className="input"
            value={selector.leftYear ?? ''}
            onChange={(e) =>
              onChange({ ...selector, leftYear: e.target.value ? Number(e.target.value) : null })
            }
            aria-label="Left year"
          >
            <option value="">Year</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            className="input"
            value={selector.leftMonth ?? ''}
            onChange={(e) =>
              onChange({ ...selector, leftMonth: e.target.value ? Number(e.target.value) : null })
            }
            aria-label="Left month"
          >
            <option value="">Month</option>
            {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="comparisons-vs-label" aria-hidden="true">vs</div>
      <div className="comparisons-selector-side">
        <label className="field-label" htmlFor="mvm-right-year">Period B</label>
        <div className="input-row">
          <select
            id="mvm-right-year"
            className="input"
            value={selector.rightYear ?? ''}
            onChange={(e) =>
              onChange({ ...selector, rightYear: e.target.value ? Number(e.target.value) : null })
            }
            aria-label="Right year"
          >
            <option value="">Year</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            className="input"
            value={selector.rightMonth ?? ''}
            onChange={(e) =>
              onChange({ ...selector, rightMonth: e.target.value ? Number(e.target.value) : null })
            }
            aria-label="Right month"
          >
            <option value="">Month</option>
            {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}

function YearVsYearPanel({
  selector,
  onChange,
}: {
  selector: YearVsYearSelector
  onChange: (s: YearVsYearSelector) => void
}) {
  const years = yearOptions()
  return (
    <div className="comparisons-selector-grid">
      <div className="comparisons-selector-side">
        <label className="field-label" htmlFor="yvy-left">Period A</label>
        <select
          id="yvy-left"
          className="input"
          value={selector.leftYear ?? ''}
          onChange={(e) =>
            onChange({ ...selector, leftYear: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">Select year</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <div className="comparisons-vs-label" aria-hidden="true">vs</div>
      <div className="comparisons-selector-side">
        <label className="field-label" htmlFor="yvy-right">Period B</label>
        <select
          id="yvy-right"
          className="input"
          value={selector.rightYear ?? ''}
          onChange={(e) =>
            onChange({ ...selector, rightYear: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">Select year</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
    </div>
  )
}

function SeasonVsSeasonPanel({
  selector,
  onChange,
}: {
  selector: SeasonVsSeasonSelector
  onChange: (s: SeasonVsSeasonSelector) => void
}) {
  const years = yearOptions()
  return (
    <div className="comparisons-selector-grid">
      <div className="comparisons-selector-side">
        <label className="field-label">Period A</label>
        <div className="input-row">
          <select
            className="input"
            value={selector.leftSeason ?? ''}
            onChange={(e) =>
              onChange({ ...selector, leftSeason: (e.target.value as MeteorologicalSeason) || null })
            }
            aria-label="Left season"
          >
            <option value="">Season</option>
            {SEASONS.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <select
            className="input"
            value={selector.leftSeasonYear ?? ''}
            onChange={(e) =>
              onChange({ ...selector, leftSeasonYear: e.target.value ? Number(e.target.value) : null })
            }
            aria-label="Left season year"
          >
            <option value="">Year</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {selector.leftSeason != null && selector.leftSeasonYear != null && (
          <p className="comparisons-date-hint">
            {seasonLabel(selector.leftSeason, selector.leftSeasonYear)}
            {' — '}
            {(() => {
              const { startDate, endDate } = getSeasonDateRange(selector.leftSeason, selector.leftSeasonYear)
              return `${startDate} to ${endDate}`
            })()}
          </p>
        )}
      </div>
      <div className="comparisons-vs-label" aria-hidden="true">vs</div>
      <div className="comparisons-selector-side">
        <label className="field-label">Period B</label>
        <div className="input-row">
          <select
            className="input"
            value={selector.rightSeason ?? ''}
            onChange={(e) =>
              onChange({ ...selector, rightSeason: (e.target.value as MeteorologicalSeason) || null })
            }
            aria-label="Right season"
          >
            <option value="">Season</option>
            {SEASONS.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
          <select
            className="input"
            value={selector.rightSeasonYear ?? ''}
            onChange={(e) =>
              onChange({ ...selector, rightSeasonYear: e.target.value ? Number(e.target.value) : null })
            }
            aria-label="Right season year"
          >
            <option value="">Year</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {selector.rightSeason != null && selector.rightSeasonYear != null && (
          <p className="comparisons-date-hint">
            {seasonLabel(selector.rightSeason, selector.rightSeasonYear)}
            {' — '}
            {(() => {
              const { startDate, endDate } = getSeasonDateRange(selector.rightSeason, selector.rightSeasonYear)
              return `${startDate} to ${endDate}`
            })()}
          </p>
        )}
      </div>
    </div>
  )
}

function SamePeriodPanel({
  selector,
  onChange,
}: {
  selector: SamePeriodSelector
  onChange: (s: SamePeriodSelector) => void
}) {
  const years = yearOptions()
  const toggleYear = useCallback(
    (year: number, checked: boolean) => {
      const next = checked
        ? [...selector.years, year].sort((a, b) => a - b)
        : selector.years.filter((y) => y !== year)
      onChange({ ...selector, years: next })
    },
    [selector, onChange],
  )

  const previewYear = selector.years[0] ?? THIS_YEAR
  const previewEntry =
    selector.startMD && selector.endMD
      ? resolveSamePeriodForYear(selector.startMD, selector.endMD, previewYear)
      : null

  return (
    <div className="comparisons-same-period">
      <fieldset>
        <legend className="field-label">Period range (MM-DD)</legend>
        <div className="input-row">
          <div>
            <label className="field-label-sm" htmlFor="sp-start">Start</label>
            <input
              id="sp-start"
              type="text"
              className="input input--narrow"
              placeholder="06-01"
              value={selector.startMD}
              pattern="\d{2}-\d{2}"
              onChange={(e) => onChange({ ...selector, startMD: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label-sm" htmlFor="sp-end">End</label>
            <input
              id="sp-end"
              type="text"
              className="input input--narrow"
              placeholder="08-31"
              value={selector.endMD}
              pattern="\d{2}-\d{2}"
              onChange={(e) => onChange({ ...selector, endMD: e.target.value })}
            />
          </div>
        </div>
        {previewEntry != null && (
          <p className="comparisons-date-hint" aria-live="polite">
            e.g. {previewEntry.startDate} – {previewEntry.endDate}
            {' ('}
            {periodDurationDays(previewEntry.startDate, previewEntry.endDate)} days)
          </p>
        )}
      </fieldset>
      <fieldset className="comparisons-year-checkboxes">
        <legend className="field-label">Years to compare (select two or more)</legend>
        <div className="year-checkbox-grid">
          {years.map((y) => (
            <label key={y} className="year-checkbox-label">
              <input
                type="checkbox"
                checked={selector.years.includes(y)}
                onChange={(e) => toggleYear(y, e.target.checked)}
              />
              {' '}{y}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  )
}

function CustomPeriodPanel({
  selector,
  onChange,
}: {
  selector: CustomPeriodSelector
  onChange: (s: CustomPeriodSelector) => void
}) {
  const leftDays =
    selector.leftStart && selector.leftEnd && selector.leftStart <= selector.leftEnd
      ? periodDurationDays(selector.leftStart, selector.leftEnd)
      : null
  const rightDays =
    selector.rightStart && selector.rightEnd && selector.rightStart <= selector.rightEnd
      ? periodDurationDays(selector.rightStart, selector.rightEnd)
      : null

  return (
    <div className="comparisons-selector-grid">
      <div className="comparisons-selector-side">
        <label className="field-label">Period A</label>
        <div className="input-stack">
          <div>
            <label className="field-label-sm" htmlFor="cp-left-start">Start</label>
            <input
              id="cp-left-start"
              type="date"
              className="input"
              value={selector.leftStart}
              onChange={(e) =>
                onChange({ ...selector, leftStart: e.target.value as ClimateDateString })
              }
            />
          </div>
          <div>
            <label className="field-label-sm" htmlFor="cp-left-end">End</label>
            <input
              id="cp-left-end"
              type="date"
              className="input"
              value={selector.leftEnd}
              onChange={(e) =>
                onChange({ ...selector, leftEnd: e.target.value as ClimateDateString })
              }
            />
          </div>
          {leftDays != null && (
            <p className="comparisons-date-hint">
              {leftDays} day{leftDays === 1 ? '' : 's'}
            </p>
          )}
        </div>
      </div>
      <div className="comparisons-vs-label" aria-hidden="true">vs</div>
      <div className="comparisons-selector-side">
        <label className="field-label">Period B</label>
        <div className="input-stack">
          <div>
            <label className="field-label-sm" htmlFor="cp-right-start">Start</label>
            <input
              id="cp-right-start"
              type="date"
              className="input"
              value={selector.rightStart}
              onChange={(e) =>
                onChange({ ...selector, rightStart: e.target.value as ClimateDateString })
              }
            />
          </div>
          <div>
            <label className="field-label-sm" htmlFor="cp-right-end">End</label>
            <input
              id="cp-right-end"
              type="date"
              className="input"
              value={selector.rightEnd}
              onChange={(e) =>
                onChange({ ...selector, rightEnd: e.target.value as ClimateDateString })
              }
            />
          </div>
          {rightDays != null && (
            <p className="comparisons-date-hint">
              {rightDays} day{rightDays === 1 ? '' : 's'}
              {leftDays != null && leftDays !== rightDays && (
                <span className="comparisons-mismatch" role="alert">
                  {' '}⚠ Periods must be equal length
                </span>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── SVG charts ────────────────────────────────────────────────────────────────

interface ChartPoint {
  x: number
  y: number | null
}

function buildPathD(
  points: readonly ChartPoint[],
  width: number,
  height: number,
): string {
  const valid = points.filter((p) => p.y != null)
  if (valid.length === 0) return ''

  const xs = points.map((p) => p.x)
  const ys = valid.map((p) => p.y as number)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const pad = 4
  const iW = width - 2 * pad
  const iH = height - 2 * pad

  let d = ''
  let penDown = false
  for (const pt of points) {
    const px = pad + ((pt.x - minX) / rangeX) * iW
    if (pt.y == null) { penDown = false; continue }
    const py = pad + (1 - (pt.y - minY) / rangeY) * iH
    d += penDown
      ? `L ${px.toFixed(1)} ${py.toFixed(1)} `
      : `M ${px.toFixed(1)} ${py.toFixed(1)} `
    penDown = true
  }
  return d.trim()
}

function toNormalisedX(pts: ChartPoint[]): ChartPoint[] {
  if (pts.length <= 1) return pts
  return pts.map((p, i) => ({ ...p, x: (i / (pts.length - 1)) * 100 }))
}

function toPoints(
  records: readonly ClimateDay[],
  sel: (r: ClimateDay) => number | null,
): ChartPoint[] {
  return toNormalisedX(records.map((r, i) => ({ x: i, y: sel(r) })))
}

function cumulativeRainPoints(records: readonly ClimateDay[]): ChartPoint[] {
  let cum = 0
  return toNormalisedX(
    records.map((r, i) => {
      if (r.rainfallMm != null) cum += r.rainfallMm
      return { x: i, y: r.rainfallMm != null ? cum : null }
    }),
  )
}

function OverlayLineChart({
  leftMax,
  leftMin,
  rightMax,
  rightMin,
}: {
  leftMax: ChartPoint[]
  leftMin: ChartPoint[]
  rightMax: ChartPoint[]
  rightMin: ChartPoint[]
}) {
  const W = 500
  const H = 120
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Temperature overlay: daily maximum and minimum for each period"
      className="comparison-chart-svg"
    >
      {([
        [leftMax, 'var(--chart-series-observed)', ''],
        [leftMin, 'var(--chart-series-observed)', '4 2'],
        [rightMax, 'var(--chart-series-reference)', ''],
        [rightMin, 'var(--chart-series-reference)', '4 2'],
      ] as const).map(([pts, stroke, dashArray], idx) => {
        const d = buildPathD(pts, W, H)
        return d ? (
          <path
            key={idx}
            d={d}
            fill="none"
            stroke={stroke}
            strokeWidth={1.8}
            strokeDasharray={dashArray || undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null
      })}
    </svg>
  )
}

function RangeChart({
  maxPts,
  minPts,
  fillColor,
  strokeColor,
}: {
  maxPts: ChartPoint[]
  minPts: ChartPoint[]
  fillColor: string
  strokeColor: string
}) {
  const W = 500
  const H = 100
  const maxD = buildPathD(maxPts, W, H)
  const minD = buildPathD(minPts, W, H)
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Temperature range chart showing daily max and min band"
      className="comparison-chart-svg"
    >
      {maxD && <path d={maxD} fill="none" stroke={fillColor} strokeWidth={1.5} />}
      {minD && (
        <path d={minD} fill="none" stroke={strokeColor} strokeWidth={1.5} strokeDasharray="4 2" />
      )}
    </svg>
  )
}

function RainfallChart({
  leftPts,
  rightPts,
}: {
  leftPts: ChartPoint[]
  rightPts: ChartPoint[]
}) {
  const W = 500
  const H = 90
  const lD = buildPathD(leftPts, W, H)
  const rD = buildPathD(rightPts, W, H)
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Cumulative rainfall chart for each period"
      className="comparison-chart-svg"
    >
      {lD && (
        <path d={lD} fill="none" stroke="var(--chart-series-observed)" strokeWidth={2} />
      )}
      {rD && (
        <path
          d={rD}
          fill="none"
          stroke="var(--chart-series-reference)"
          strokeWidth={2}
          strokeDasharray="6 3"
        />
      )}
    </svg>
  )
}

// ── Period summary card ───────────────────────────────────────────────────────

function PeriodCard({
  result,
  side,
}: {
  result: ComparisonPeriodResult
  side: 'A' | 'B'
}) {
  const { coverage } = result
  const rainfallComplete = coverage.rainfall.complete

  return (
    <article
      className={`comparison-card comparison-card--${side === 'A' ? 'left' : 'right'}`}
      aria-label={`Period ${side}: ${result.selection.label}`}
    >
      <header className="comparison-card__header">
        <span className="comparison-card__side">{side}</span>
        <h2 className="comparison-card__title">{result.selection.label}</h2>
        <ProvisionalBadge provisional={coverage.provisional} />
      </header>

      <dl className="comparison-card__stats">
        <div className="stat-row">
          <dt>Mean max</dt>
          <dd>{fmt(result.meanMaxTempC, '°C')}</dd>
        </div>
        <div className="stat-row">
          <dt>Mean min</dt>
          <dd>{fmt(result.meanMinTempC, '°C')}</dd>
        </div>
        <div className="stat-row">
          <dt>Mean temp</dt>
          <dd>{fmt(result.meanTempC, '°C')}</dd>
        </div>
        <div className="stat-row">
          <dt>Temp anomaly</dt>
          <dd>{result.temperatureAnomalyC != null ? fmtDiff(result.temperatureAnomalyC, '°C') : '—'}</dd>
        </div>
        <div className="stat-row">
          <dt>Highest max</dt>
          <dd>
            {fmt(result.highestMax.value, '°C')}
            {result.highestMax.dates.length > 0 && (
              <span className="stat-dates"> ({result.highestMax.dates.join(', ')})</span>
            )}
          </dd>
        </div>
        <div className="stat-row">
          <dt>Lowest min</dt>
          <dd>
            {fmt(result.lowestMin.value, '°C')}
            {result.lowestMin.dates.length > 0 && (
              <span className="stat-dates"> ({result.lowestMin.dates.join(', ')})</span>
            )}
          </dd>
        </div>
        <div className="stat-row">
          <dt>Rainfall total</dt>
          <dd>
            {fmt(result.rainfallTotalMm, 'mm')}
            {!rainfallComplete && result.rainfallTotalMm != null && (
              <span className="stat-note"> (incomplete)</span>
            )}
          </dd>
        </div>
        <div className="stat-row">
          <dt>% of normal</dt>
          <dd>{fmtPct(result.rainfallPercentageOfNormal)}</dd>
        </div>
        <div className="stat-row">
          <dt>Rain days</dt>
          <dd>{fmtInt(result.rainDays)}</dd>
        </div>
        <div className="stat-row">
          <dt>Wettest day</dt>
          <dd>
            {fmt(result.wettestDay.value, 'mm')}
            {result.wettestDay.dates.length > 0 && (
              <span className="stat-dates"> ({result.wettestDay.dates.join(', ')})</span>
            )}
          </dd>
        </div>
        <div className="stat-row">
          <dt>Days ≥20°C</dt>
          <dd>{fmtInt(result.thresholds.atOrAbove20C)}</dd>
        </div>
        <div className="stat-row">
          <dt>Days ≥25°C</dt>
          <dd>{fmtInt(result.thresholds.atOrAbove25C)}</dd>
        </div>
        <div className="stat-row">
          <dt>Frost days</dt>
          <dd>{fmtInt(result.thresholds.frostDays)}</dd>
        </div>
        <div className="stat-row">
          <dt>Heavy rain days (&gt;{HEAVY_RAIN_THRESHOLD_MM} mm)</dt>
          <dd>{fmtInt(result.thresholds.heavyRainDays)}</dd>
        </div>
      </dl>

      <div className="comparison-card__coverage">
        <p className="coverage-label">Coverage</p>
        <p>
          Temperature: {coverage.maxTemperature.valid}/{coverage.expectedDays} days valid
          {coverage.maxTemperature.missing > 0 && `, ${coverage.maxTemperature.missing} missing`}
        </p>
        <p>
          Rainfall:{' '}
          {coverage.rainfall.unavailable > 0
            ? `${coverage.rainfall.unavailable} days before records began`
            : `${coverage.rainfall.valid}/${coverage.expectedDays} days valid`}
        </p>
        {coverage.maxTemperature.valid !== coverage.minTemperature.valid && (
          <p className="coverage-note">
            ⚠ Valid day counts differ between temperature metrics.
          </p>
        )}
      </div>
    </article>
  )
}

// ── Differences table ─────────────────────────────────────────────────────────

function DifferencesTable({ result }: { result: ComparisonResult }) {
  const outcomes = deriveOutcomeLabel(result.left, result.right)

  const meanMaxDiff =
    result.left.meanMaxTempC != null && result.right.meanMaxTempC != null
      ? result.left.meanMaxTempC - result.right.meanMaxTempC
      : null
  const meanMinDiff =
    result.left.meanMinTempC != null && result.right.meanMinTempC != null
      ? result.left.meanMinTempC - result.right.meanMinTempC
      : null
  const rainDaysDiff = result.left.rainDays - result.right.rainDays

  return (
    <section className="comparison-diff" aria-label="Differences">
      <h3 className="comparison-diff__title">
        A vs B
        {outcomes.temperature != null && <> <OutcomeBadge outcome={outcomes.temperature} /></>}
        {outcomes.rainfall != null && <> <OutcomeBadge outcome={outcomes.rainfall} /></>}
      </h3>
      <div className="table-scroll">
        <table className="comparison-diff-table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              <th scope="col">A</th>
              <th scope="col">B</th>
              <th scope="col">Difference (A − B)</th>
              <th scope="col">% Difference</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Mean max temp</th>
              <td>{fmt(result.left.meanMaxTempC, '°C')}</td>
              <td>{fmt(result.right.meanMaxTempC, '°C')}</td>
              <td>{fmtDiff(meanMaxDiff, '°C')}</td>
              <td>—</td>
            </tr>
            <tr>
              <th scope="row">Mean min temp</th>
              <td>{fmt(result.left.meanMinTempC, '°C')}</td>
              <td>{fmt(result.right.meanMinTempC, '°C')}</td>
              <td>{fmtDiff(meanMinDiff, '°C')}</td>
              <td>—</td>
            </tr>
            <tr>
              <th scope="row">Mean temperature</th>
              <td>{fmt(result.left.meanTempC, '°C')}</td>
              <td>{fmt(result.right.meanTempC, '°C')}</td>
              <td>{fmtDiff(result.meanTempDifferenceC, '°C')}</td>
              <td>—</td>
            </tr>
            <tr>
              <th scope="row">Rainfall total</th>
              <td>{fmt(result.left.rainfallTotalMm, 'mm')}</td>
              <td>{fmt(result.right.rainfallTotalMm, 'mm')}</td>
              <td>{fmtDiff(result.rainfallDifferenceMm, 'mm')}</td>
              <td>{fmtPctDiff(result.rainfallPercentageDifference)}</td>
            </tr>
            <tr>
              <th scope="row">Rain days</th>
              <td>{fmtInt(result.left.rainDays)}</td>
              <td>{fmtInt(result.right.rainDays)}</td>
              <td>{rainDaysDiff > 0 ? '+' : ''}{rainDaysDiff}</td>
              <td>—</td>
            </tr>
            <tr>
              <th scope="row">Days ≥20°C</th>
              <td>{fmtInt(result.left.thresholds.atOrAbove20C)}</td>
              <td>{fmtInt(result.right.thresholds.atOrAbove20C)}</td>
              <td>
                {(() => {
                  const d = result.left.thresholds.atOrAbove20C - result.right.thresholds.atOrAbove20C
                  return (d > 0 ? '+' : '') + d
                })()}
              </td>
              <td>—</td>
            </tr>
            <tr>
              <th scope="row">Frost days</th>
              <td>{fmtInt(result.left.thresholds.frostDays)}</td>
              <td>{fmtInt(result.right.thresholds.frostDays)}</td>
              <td>
                {(() => {
                  const d = result.left.thresholds.frostDays - result.right.thresholds.frostDays
                  return (d > 0 ? '+' : '') + d
                })()}
              </td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </div>

      {result.left.coverage.maxTemperature.valid !==
        result.right.coverage.maxTemperature.valid && (
        <p className="comparison-coverage-warning" role="status">
          ⚠ Periods have different valid-day counts (A:{' '}
          {result.left.coverage.maxTemperature.valid}, B:{' '}
          {result.right.coverage.maxTemperature.valid}). Direct comparisons may
          be affected by unequal coverage.
        </p>
      )}
      {(!result.left.coverage.rainfall.complete ||
        !result.right.coverage.rainfall.complete) &&
        (result.left.rainfallTotalMm != null ||
          result.right.rainfallTotalMm != null) && (
          <p className="comparison-coverage-warning" role="status">
            ⚠ Rainfall coverage is incomplete for one or both periods. Totals
            and differences may not be directly comparable.
          </p>
        )}
    </section>
  )
}

// ── Chart section ─────────────────────────────────────────────────────────────

function TwoPeriodCharts({
  leftRecords,
  rightRecords,
}: {
  leftRecords: readonly ClimateDay[]
  rightRecords: readonly ClimateDay[]
}) {
  const firstChartRef = useRef<SVGSVGElement>(null)

  const leftMax = toPoints(leftRecords, (r) => r.maxTempC)
  const leftMin = toPoints(leftRecords, (r) => r.minTempC)
  const rightMax = toPoints(rightRecords, (r) => r.maxTempC)
  const rightMin = toPoints(rightRecords, (r) => r.minTempC)
  const leftRain = cumulativeRainPoints(leftRecords)
  const rightRain = cumulativeRainPoints(rightRecords)

  const handleDownloadPng = useCallback(() => {
    if (!firstChartRef.current) return
    downloadSvgAsPng(firstChartRef.current, 'comparison-temperature-overlay.png')
  }, [])

  return (
    <section className="comparison-charts" aria-label="Charts">
      <div className="comparison-chart-block">
        <h3 className="chart-title">
          Temperature overlay
          <span className="chart-legend">
            <span
              className="legend-swatch"
              style={{ background: 'var(--chart-series-observed)' }}
            />{' '}
            A
            <span
              className="legend-swatch"
              style={{ background: 'var(--chart-series-reference)' }}
            />{' '}
            B &nbsp; (solid = max, dashed = min)
          </span>
        </h3>
        <div className="responsive-chart-container">
          <OverlayLineChart
            leftMax={leftMax}
            leftMin={leftMin}
            rightMax={rightMax}
            rightMin={rightMin}
          />
        </div>
      </div>

      <div className="comparison-chart-block">
        <h3 className="chart-title">Temperature range — Period A</h3>
        <div className="responsive-chart-container">
          <RangeChart
            maxPts={leftMax}
            minPts={leftMin}
            fillColor="var(--chart-series-observed)"
            strokeColor="var(--chart-series-observed)"
          />
        </div>
      </div>

      {(leftRain.some((p) => p.y != null) || rightRain.some((p) => p.y != null)) && (
        <div className="comparison-chart-block">
          <h3 className="chart-title">
            Cumulative rainfall
            <span className="chart-legend">
              <span
                className="legend-swatch"
                style={{ background: 'var(--chart-series-observed)' }}
              />{' '}
              A
              <span
                className="legend-swatch legend-swatch--dashed"
                style={{ borderColor: 'var(--chart-series-reference)' }}
              />{' '}
              B
            </span>
          </h3>
          <div className="responsive-chart-container">
            <RainfallChart leftPts={leftRain} rightPts={rightRain} />
          </div>
        </div>
      )}

      <button
        type="button"
        className="btn btn--secondary btn--sm"
        onClick={handleDownloadPng}
      >
        Download chart as PNG
      </button>
    </section>
  )
}

// ── Same-period results table ─────────────────────────────────────────────────

function SamePeriodTable({ results }: { results: readonly SamePeriodYearResult[] }) {
  return (
    <section className="comparison-same-period-results" aria-label="Same-period results by year">
      <div className="table-scroll">
        <table className="comparison-table">
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Mean Max (°C)</th>
              <th scope="col">Mean Min (°C)</th>
              <th scope="col">Mean Temp (°C)</th>
              <th scope="col">Anomaly (°C)</th>
              <th scope="col">Highest Max</th>
              <th scope="col">Lowest Min</th>
              <th scope="col">Rainfall (mm)</th>
              <th scope="col">% Normal</th>
              <th scope="col">Rain Days</th>
              <th scope="col">Wettest Day (mm)</th>
              <th scope="col">≥20°C</th>
              <th scope="col">Frost Days</th>
              <th scope="col">Valid Days</th>
            </tr>
          </thead>
          <tbody>
            {results.map(({ year, result }) => (
              <tr key={year}>
                <td>
                  {year}
                  {result.coverage.provisional && (
                    <span
                      className="badge badge--provisional"
                      aria-label="provisional"
                    >{' '}P</span>
                  )}
                </td>
                <td>{fmt(result.meanMaxTempC)}</td>
                <td>{fmt(result.meanMinTempC)}</td>
                <td>{fmt(result.meanTempC)}</td>
                <td>
                  {result.temperatureAnomalyC != null
                    ? fmtDiff(result.temperatureAnomalyC)
                    : '—'}
                </td>
                <td>{fmt(result.highestMax.value)}</td>
                <td>{fmt(result.lowestMin.value)}</td>
                <td>
                  {fmt(result.rainfallTotalMm)}
                  {!result.coverage.rainfall.complete && result.rainfallTotalMm != null
                    ? '*'
                    : ''}
                </td>
                <td>{fmtPct(result.rainfallPercentageOfNormal)}</td>
                <td>{fmtInt(result.rainDays)}</td>
                <td>{fmt(result.wettestDay.value)}</td>
                <td>{fmtInt(result.thresholds.atOrAbove20C)}</td>
                <td>{fmtInt(result.thresholds.frostDays)}</td>
                <td>
                  {result.coverage.maxTemperature.valid}/
                  {result.coverage.expectedDays}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="comparison-footnote">
        * Rainfall total is incomplete (period extends before records or contains missing days).
        P = Provisional.
      </p>
    </section>
  )
}

// ── PNG export ────────────────────────────────────────────────────────────────

function downloadSvgAsPng(svg: SVGSVGElement, filename: string): void {
  const data = new XMLSerializer().serializeToString(svg)
  const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.onload = () => {
    const w = svg.clientWidth || 500
    const h = svg.clientHeight || 120
    const canvas = document.createElement('canvas')
    canvas.width = w * 2
    canvas.height = h * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) { URL.revokeObjectURL(url); return }
    ctx.scale(2, 2)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)
    URL.revokeObjectURL(url)
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = filename
    a.click()
  }
  img.src = url
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ComparisonsPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const [selector, setSelector] = useState<ComparisonSelector>(() => {
    const fromUrl = urlParamsToSelector(searchParams)
    return fromUrl ?? defaultSelector('date-vs-date')
  })

  useEffect(() => {
    const params = selectorToUrlParams(selector)
    setSearchParams(params, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector])

  const validation: ValidationResult = useMemo(
    () => validateSelector(selector),
    [selector],
  )

  const yearsToFetch = useMemo<readonly number[]>(() => {
    if (!validation.valid) return []
    const sel = validation.selection
    if (sel.mode === 'same-period') {
      const sp = sel as SamePeriodSelection
      const yearSet = new Set<number>(sp.years.map((e) => e.year))
      return [...yearSet].sort((a, b) => a - b)
    }
    return yearsRequiredForTwoPeriod(sel.left, sel.right)
  }, [validation])

  const annualQueries = useAnnualClimateQueries(yearsToFetch)
  const normalsQuery = useMonthlyNormalsQuery()

  const isLoading = annualQueries.some((q) => q.isLoading) || normalsQuery.isLoading
  const hasError = annualQueries.some((q) => q.isError) || normalsQuery.isError

  const recordsByYear = useMemo<ReadonlyMap<number, readonly ClimateDay[]>>(() => {
    const map = new Map<number, readonly ClimateDay[]>()
    yearsToFetch.forEach((year, i) => {
      const data = annualQueries[i]?.data
      if (data) map.set(year, data.records)
    })
    return map
  }, [annualQueries, yearsToFetch])

  const monthlyNormals = useMemo<readonly MonthlyNormal[]>(
    () => normalsQuery.data?.months ?? [],
    [normalsQuery.data],
  )

  const dataReady = !isLoading && yearsToFetch.every((y) => recordsByYear.has(y))

  const twoResult = useMemo<ComparisonResult | null>(() => {
    if (!validation.valid || validation.selection.mode === 'same-period') return null
    if (!dataReady) return null
    const sel = validation.selection as TwoPeriodSelection
    const left = buildComparisonPeriodResult(sel.left, recordsByYear, monthlyNormals)
    const right = buildComparisonPeriodResult(sel.right, recordsByYear, monthlyNormals)
    return buildComparisonResult(left, right)
  }, [validation, dataReady, recordsByYear, monthlyNormals])

  const samePeriodResults = useMemo<SamePeriodYearResult[] | null>(() => {
    if (!validation.valid || validation.selection.mode !== 'same-period') return null
    if (!dataReady) return null
    const sel = validation.selection as SamePeriodSelection
    return buildSamePeriodResults(sel.years, recordsByYear, monthlyNormals)
  }, [validation, dataReady, recordsByYear, monthlyNormals])

  const leftRecords = useMemo<readonly ClimateDay[]>(() => {
    if (!twoResult) return []
    const { startDate, endDate } = twoResult.left.selection
    return Array.from(recordsByYear.values())
      .flat()
      .filter((r) => r.date >= startDate && r.date <= endDate)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
  }, [twoResult, recordsByYear])

  const rightRecords = useMemo<readonly ClimateDay[]>(() => {
    if (!twoResult) return []
    const { startDate, endDate } = twoResult.right.selection
    return Array.from(recordsByYear.values())
      .flat()
      .filter((r) => r.date >= startDate && r.date <= endDate)
      .sort((a, b) => (a.date < b.date ? -1 : 1))
  }, [twoResult, recordsByYear])

  const handleModeChange = useCallback((mode: ComparisonSelector['mode']) => {
    setSelector(defaultSelector(mode))
  }, [])

  const shareableUrl = useMemo(() => {
    const url = new URL(window.location.href)
    const params = selectorToUrlParams(selector)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    return url.toString()
  }, [selector])

  const [copied, setCopied] = useState(false)
  const handleCopyUrl = useCallback(() => {
    void navigator.clipboard.writeText(shareableUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [shareableUrl])

  const handleCsvExport = useCallback(() => {
    if (twoResult) {
      const csv = buildComparisonCsv(twoResult)
      const filename = `comparison.csv`
      downloadCsvBlob(csv, filename)
    } else if (samePeriodResults) {
      const csv = buildSamePeriodCsv(samePeriodResults)
      downloadCsvBlob(csv, 'comparison-same-period.csv')
    }
  }, [twoResult, samePeriodResults])

  const hasResults = twoResult != null || samePeriodResults != null

  return (
    <main className="page comparisons-page">
      <h1 className="page-title">Comparisons</h1>

      {/* Mode tabs */}
      <div className="comparisons-mode-tabs" role="tablist" aria-label="Comparison mode">
        {MODES.map(({ id, label }) => (
          <button
            key={id}
            role="tab"
            type="button"
            className={`mode-tab${selector.mode === id ? ' mode-tab--active' : ''}`}
            aria-selected={selector.mode === id}
            onClick={() => handleModeChange(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Selector panel */}
      <section className="comparisons-selector-panel" aria-label="Period selection">
        {selector.mode === 'date-vs-date' && (
          <DateVsDatePanel selector={selector} onChange={setSelector} />
        )}
        {selector.mode === 'month-vs-month' && (
          <MonthVsMonthPanel selector={selector} onChange={setSelector} />
        )}
        {selector.mode === 'year-vs-year' && (
          <YearVsYearPanel selector={selector} onChange={setSelector} />
        )}
        {selector.mode === 'season-vs-season' && (
          <SeasonVsSeasonPanel selector={selector} onChange={setSelector} />
        )}
        {selector.mode === 'same-period' && (
          <SamePeriodPanel selector={selector} onChange={setSelector} />
        )}
        {selector.mode === 'custom' && (
          <CustomPeriodPanel selector={selector} onChange={setSelector} />
        )}

        {!validation.valid && (
          <p className="comparisons-validation-error" role="alert">
            {validation.message}
          </p>
        )}
      </section>

      {/* Loading */}
      {validation.valid && isLoading && (
        <div className="comparisons-loading" role="status" aria-live="polite">
          Loading climate data…
        </div>
      )}

      {/* Error */}
      {hasError && (
        <div className="comparisons-error" role="alert">
          Failed to load some climate data. Check your connection and try again.
        </div>
      )}

      {/* Results */}
      {hasResults && (
        <section className="comparisons-results" aria-label="Comparison results">
          {twoResult && (
            <>
              <div className="comparison-cards-row">
                <PeriodCard result={twoResult.left} side="A" />
                <PeriodCard result={twoResult.right} side="B" />
              </div>
              <DifferencesTable result={twoResult} />
              {(leftRecords.length > 0 || rightRecords.length > 0) && (
                <TwoPeriodCharts
                  leftRecords={leftRecords}
                  rightRecords={rightRecords}
                />
              )}
            </>
          )}

          {samePeriodResults && <SamePeriodTable results={samePeriodResults} />}

          <div className="comparisons-export-toolbar">
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleCsvExport}
              disabled={!hasResults}
            >
              Export CSV
            </button>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={handleCopyUrl}
            >
              {copied ? 'Copied!' : 'Copy shareable URL'}
            </button>
          </div>
        </section>
      )}

      {/* Empty state */}
      {validation.valid && !isLoading && !hasResults && !hasError && (
        <p className="comparisons-empty" role="status">
          Select periods above to see the comparison.
        </p>
      )}
    </main>
  )
}
