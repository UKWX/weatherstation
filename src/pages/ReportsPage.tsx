import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ErrorState,
  IncompleteDataWarning,
  ProvisionalBadge,
  Skeleton,
  TableWrapper,
} from '@/components/ui'
import { WEATHER_UNITS } from '@/config/weather'
import {
  buildAnnualReportCsv,
  buildAnnualReportModel,
  buildMonthlyReportCsv,
  buildMonthlyReportModel,
  type AnnualReportModel,
  type MonthlyReportModel,
} from '@/features/reports/generator'
import {
  useAnnualClimateQueries,
  useAnnualClimateQuery,
  useClimateArchiveIndexQuery,
  useMonthlyNormalsQuery,
} from '@/hooks/usePublicWeatherQueries'
import { formatEuropeLondonDisplay } from '@/lib/climate'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

function fmt(value: number | null, unit?: string): string {
  if (value == null) return '—'
  const text = value.toFixed(1)
  return unit == null ? text : `${text} ${unit}`
}

function fmtPct(value: number | null): string {
  if (value == null) return '—'
  return `${value.toFixed(1)}%`
}

function fmtAnomaly(value: number | null): string {
  if (value == null) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)} ${WEATHER_UNITS.temperature}`
}

function formatDateList(dates: readonly string[]): string {
  if (dates.length === 0) return '—'
  return dates
    .map((date) => formatEuropeLondonDisplay(date, { day: 'numeric', month: 'short' }))
    .join(', ')
}

function downloadBlob(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function downloadSocialPng(title: string, compactText: string): Promise<void> {
  const width = 1200
  const height = 630
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context == null) return

  context.fillStyle = '#0f1f3c'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#1f6ce0'
  context.fillRect(0, 0, width, 96)
  context.fillStyle = '#ffffff'
  context.font = 'bold 44px Inter, Segoe UI, sans-serif'
  context.fillText(title, 46, 62)

  context.fillStyle = '#d8e7ff'
  context.font = '30px Inter, Segoe UI, sans-serif'
  let cursorY = 138
  for (const line of compactText.split('\n')) {
    context.fillText(line, 46, cursorY)
    cursorY += 44
    if (cursorY > height - 36) {
      break
    }
  }

  const dataUrl = canvas.toDataURL('image/png')
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `${title.toLowerCase().replace(/\s+/g, '-')}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function ReportExportButtons({
  title,
  compactText,
  csvContent,
  model,
}: {
  readonly title: string
  readonly compactText: string
  readonly csvContent: string
  readonly model: MonthlyReportModel | AnnualReportModel
}) {
  const copyText = useCallback(async () => {
    if (navigator.clipboard?.writeText != null) {
      await navigator.clipboard.writeText(compactText)
      return
    }
    downloadBlob(compactText, `${title}-report.txt`, 'text/plain;charset=utf-8')
  }, [compactText, title])

  return (
    <div className="reports-export-row">
      <button type="button" className="button button-ghost" onClick={() => window.print()}>
        Print
      </button>
      <button type="button" className="button button-ghost" onClick={() => { void downloadSocialPng(title, compactText) }}>
        Social PNG
      </button>
      <button
        type="button"
        className="button button-ghost"
        onClick={() => downloadBlob(csvContent, `${title}.csv`, 'text/csv;charset=utf-8')}
      >
        CSV
      </button>
      <button type="button" className="button button-ghost" onClick={() => { void copyText() }}>
        Copy text
      </button>
      <button
        type="button"
        className="button button-ghost"
        onClick={() =>
          downloadBlob(
            JSON.stringify(model, null, 2),
            `${title}.json`,
            'application/json;charset=utf-8',
          )}
      >
        JSON
      </button>
    </div>
  )
}

function MonthlyReportView({ report }: { readonly report: MonthlyReportModel }) {
  return (
    <section className="card reports-card" aria-labelledby="monthly-report-title">
      <h2 id="monthly-report-title">
        {report.monthName} {report.year} monthly report{' '}
        {report.provisional ? <ProvisionalBadge /> : null}
      </h2>
      {!report.complete && (
        <IncompleteDataWarning message="This monthly report is provisional or has missing observations." />
      )}
      <ReportExportButtons
        title={`${report.year}-${String(report.month).padStart(2, '0')}-monthly-report`}
        compactText={report.compactText}
        csvContent={buildMonthlyReportCsv(report)}
        model={report}
      />
      <dl className="reports-stat-grid">
        <div><dt>TMax</dt><dd>{fmt(report.tMax.value, WEATHER_UNITS.temperature)} ({formatDateList(report.tMax.dates)})</dd></div>
        <div><dt>TMin</dt><dd>{fmt(report.tMin.value, WEATHER_UNITS.temperature)} ({formatDateList(report.tMin.dates)})</dd></div>
        <div><dt>TMean</dt><dd>{fmt(report.tMean.value, WEATHER_UNITS.temperature)} ({fmtAnomaly(report.tMean.anomaly)} avg)</dd></div>
        <div><dt>Mean max</dt><dd>{fmt(report.meanMax.value, WEATHER_UNITS.temperature)} ({fmtAnomaly(report.meanMax.anomaly)} avg)</dd></div>
        <div><dt>Mean min</dt><dd>{fmt(report.meanMin.value, WEATHER_UNITS.temperature)} ({fmtAnomaly(report.meanMin.anomaly)} avg)</dd></div>
        <div><dt>Rainfall total</dt><dd>{fmt(report.rainfallTotalMm, WEATHER_UNITS.rainfall)}</dd></div>
        <div><dt>Rainfall normal ({report.baselineLabel})</dt><dd>{fmt(report.rainfallNormalMm, WEATHER_UNITS.rainfall)}</dd></div>
        <div><dt>Rainfall percentage</dt><dd>{fmtPct(report.rainfallPercentage)}</dd></div>
        <div><dt>Rain days (&gt;0.1 mm)</dt><dd>{report.rainDays}</dd></div>
        <div><dt>Wettest day</dt><dd>{fmt(report.wettestDay.value, WEATHER_UNITS.rainfall)} ({formatDateList(report.wettestDay.dates)})</dd></div>
        <div><dt>Year-to-date rainfall</dt><dd>{fmt(report.yearToDateRainfallMm, WEATHER_UNITS.rainfall)}</dd></div>
        <div><dt>Expected YTD rainfall</dt><dd>{fmt(report.expectedYearToDateRainfallMm, WEATHER_UNITS.rainfall)}</dd></div>
        <div><dt>Monthly temperature ranking</dt><dd>{report.temperatureRanking.label}</dd></div>
        <div><dt>Monthly rainfall ranking</dt><dd>{report.rainfallRanking?.label ?? 'Not ranked (coverage unavailable)'}</dd></div>
        <div><dt>Coverage</dt><dd>Temp {report.counts.temperatureValidDays}/{report.counts.expectedDays} valid, {report.counts.temperatureMissingDays} missing; Rain {report.counts.rainfallValidDays} valid, {report.counts.rainfallMissingDays} missing</dd></div>
        <div><dt>State</dt><dd>{report.provisional ? 'Provisional' : report.complete ? 'Complete' : 'Incomplete'}</dd></div>
      </dl>
      <section className="reports-subsection">
        <h3>Records set or tied</h3>
        <ul>{report.recordsSetOrTied.map((line) => <li key={line}>{line}</li>)}</ul>
      </section>
      <section className="reports-subsection">
        <h3>Deterministic written summary</h3>
        <p>{report.summaryText}</p>
      </section>
      <section className="reports-subsection">
        <h3>Compact copyable text</h3>
        <pre className="reports-compact-block">{report.compactText}</pre>
      </section>
    </section>
  )
}

function AnnualReportView({ report }: { readonly report: AnnualReportModel }) {
  return (
    <section className="card reports-card" aria-labelledby="annual-report-title">
      <h2 id="annual-report-title">
        {report.year} annual report {report.provisional ? <ProvisionalBadge /> : null}
      </h2>
      {!report.complete && (
        <IncompleteDataWarning message="This annual report is provisional or has missing observations." />
      )}
      <ReportExportButtons
        title={`${report.year}-annual-report`}
        compactText={report.compactText}
        csvContent={buildAnnualReportCsv(report)}
        model={report}
      />
      <dl className="reports-stat-grid">
        <div><dt>Annual mean max</dt><dd>{fmt(report.meanMax.value, WEATHER_UNITS.temperature)} ({fmtAnomaly(report.meanMax.anomaly)} avg)</dd></div>
        <div><dt>Annual mean min</dt><dd>{fmt(report.meanMin.value, WEATHER_UNITS.temperature)} ({fmtAnomaly(report.meanMin.anomaly)} avg)</dd></div>
        <div><dt>Annual mean temperature</dt><dd>{fmt(report.meanTemp.value, WEATHER_UNITS.temperature)} ({fmtAnomaly(report.meanTemp.anomaly)} avg)</dd></div>
        <div><dt>Highest max</dt><dd>{fmt(report.highestMax.value, WEATHER_UNITS.temperature)} ({formatDateList(report.highestMax.dates)})</dd></div>
        <div><dt>Lowest min</dt><dd>{fmt(report.lowestMin.value, WEATHER_UNITS.temperature)} ({formatDateList(report.lowestMin.dates)})</dd></div>
        <div><dt>Annual rainfall</dt><dd>{fmt(report.rainfallTotalMm, WEATHER_UNITS.rainfall)} ({fmtPct(report.rainfallPercentage)} avg)</dd></div>
        <div><dt>Rain days (&gt;0.1 mm)</dt><dd>{report.rainDays}</dd></div>
        <div><dt>Wettest day</dt><dd>{fmt(report.wettestDay.value, WEATHER_UNITS.rainfall)} ({formatDateList(report.wettestDay.dates)})</dd></div>
        <div><dt>Annual temperature ranking</dt><dd>{report.annualTemperatureRanking.label}</dd></div>
        <div><dt>Annual rainfall ranking</dt><dd>{report.annualRainfallRanking?.label ?? 'Not ranked (coverage unavailable)'}</dd></div>
      </dl>
      <section className="reports-subsection">
        <h3>Threshold counts</h3>
        <p>≥20°C: {report.thresholds.atOrAbove20C}, ≥25°C: {report.thresholds.atOrAbove25C}, ≥30°C: {report.thresholds.atOrAbove30C}, Frost days: {report.thresholds.frostDays}, Heavy rain days (≥10 mm): {report.thresholds.heavyRainDays}</p>
      </section>
      <section className="reports-subsection">
        <h3>Longest spells</h3>
        <ul>
          {report.longestSpells.map((spell) => (
            <li key={spell.label}>
              {spell.label}: {spell.length} day(s)
              {spell.startDate != null && spell.endDate != null
                ? ` (${formatEuropeLondonDisplay(spell.startDate, { day: 'numeric', month: 'short' })} to ${formatEuropeLondonDisplay(spell.endDate, { day: 'numeric', month: 'short' })})`
                : ''}
            </li>
          ))}
        </ul>
      </section>
      <section className="reports-subsection">
        <h3>Records set or tied</h3>
        <ul>{report.recordsSetOrTied.map((line) => <li key={line}>{line}</li>)}</ul>
      </section>
      <section className="reports-subsection">
        <h3>Monthly breakdown</h3>
        <TableWrapper>
          <table aria-label="Annual report monthly breakdown">
            <thead>
              <tr>
                <th>Month</th>
                <th>Mean max</th>
                <th>Mean min</th>
                <th>Mean temp</th>
                <th>Rainfall</th>
              </tr>
            </thead>
            <tbody>
              {report.monthlyBreakdown.map((month) => (
                <tr key={month.month}>
                  <td>{MONTH_NAMES[month.month - 1]}</td>
                  <td>{fmt(month.meanMaxTempC, WEATHER_UNITS.temperature)}</td>
                  <td>{fmt(month.meanMinTempC, WEATHER_UNITS.temperature)}</td>
                  <td>{fmt(month.meanTempC, WEATHER_UNITS.temperature)}</td>
                  <td>{fmt(month.rainfallTotalMm, WEATHER_UNITS.rainfall)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>
      </section>
      <section className="reports-subsection">
        <h3>Completeness statement</h3>
        <p>{report.completenessStatement}</p>
      </section>
      <section className="reports-subsection">
        <h3>Deterministic written summary</h3>
        <p>{report.summaryText}</p>
      </section>
      <section className="reports-subsection">
        <h3>Compact copyable text</h3>
        <pre className="reports-compact-block">{report.compactText}</pre>
      </section>
    </section>
  )
}

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const indexQuery = useClimateArchiveIndexQuery()
  const monthlyNormalsQuery = useMonthlyNormalsQuery()
  const availableYears = useMemo(
    () => (indexQuery.data?.years ?? []).map((entry) => entry.year).sort((a, b) => a - b),
    [indexQuery.data],
  )
  const latestYear = availableYears.at(-1) ?? new Date().getFullYear()
  const selectedYearParam = Number(searchParams.get('year'))
  const year = Number.isFinite(selectedYearParam) && availableYears.includes(selectedYearParam)
    ? selectedYearParam
    : latestYear
  const monthParam = Number(searchParams.get('month'))
  const month = Number.isInteger(monthParam) && monthParam >= 1 && monthParam <= 12
    ? monthParam
    : null
  const mode = searchParams.get('mode') === 'monthly' || month != null ? 'monthly' : 'annual'

  const selectedYearQuery = useAnnualClimateQuery(year)
  const comparisonQueries = useAnnualClimateQueries(availableYears)
  const allPayloads = useMemo(
    () =>
      comparisonQueries
        .map((query) => query.data)
        .filter((payload): payload is NonNullable<typeof payload> => payload != null),
    [comparisonQueries],
  )

  const setYear = useCallback((nextYear: number) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('year', String(nextYear))
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setMode = useCallback((nextMode: 'annual' | 'monthly') => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('mode', nextMode)
      if (nextMode === 'annual') {
        next.delete('month')
      } else if (!next.has('month')) {
        next.set('month', String(new Date().getMonth() + 1))
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setMonth = useCallback((nextMonth: number) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.set('month', String(nextMonth))
      next.set('mode', 'monthly')
      return next
    }, { replace: true })
  }, [setSearchParams])

  if (indexQuery.isLoading || monthlyNormalsQuery.isLoading) {
    return (
      <section className="card" aria-live="polite">
        <Skeleton lines={6} />
      </section>
    )
  }

  if (indexQuery.error != null || monthlyNormalsQuery.error != null) {
    return (
      <ErrorState
        title="Reports unavailable"
        message="Could not load archive index or normals for report generation."
        onRetry={() => {
          void indexQuery.refetch()
          void monthlyNormalsQuery.refetch()
        }}
      />
    )
  }

  if (selectedYearQuery.isLoading || selectedYearQuery.data == null) {
    return (
      <section className="card" aria-live="polite">
        <Skeleton lines={6} />
      </section>
    )
  }

  if (selectedYearQuery.error != null) {
    return (
      <ErrorState
        title="Year data unavailable"
        message={`Could not load climate data for ${year}.`}
        onRetry={() => { void selectedYearQuery.refetch() }}
      />
    )
  }

  const monthlyNormals = monthlyNormalsQuery.data?.months ?? []
  const comparablePayloads = allPayloads.length > 0 ? allPayloads : [selectedYearQuery.data]
  const monthlyReport = mode === 'monthly'
    ? buildMonthlyReportModel({
        year,
        month: month ?? 1,
        selectedYearPayload: selectedYearQuery.data,
        comparablePayloads,
        monthlyNormals,
      })
    : null
  const annualReport = mode === 'annual'
    ? buildAnnualReportModel({
        year,
        selectedYearPayload: selectedYearQuery.data,
        comparablePayloads,
        monthlyNormals,
      })
    : null

  return (
    <div className="reports-layout">
      <section className="card reports-controls reports-no-print">
        <div className="reports-controls-row">
          <label htmlFor="reports-year">Year</label>
          <select id="reports-year" value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {availableYears.slice().reverse().map((optionYear) => (
              <option key={optionYear} value={optionYear}>{optionYear}</option>
            ))}
          </select>
          <div className="reports-toggle-group">
            <button type="button" className={`button button-ghost${mode === 'annual' ? ' reports-toggle-active' : ''}`} onClick={() => setMode('annual')}>Annual</button>
            <button type="button" className={`button button-ghost${mode === 'monthly' ? ' reports-toggle-active' : ''}`} onClick={() => setMode('monthly')}>Monthly</button>
          </div>
          {mode === 'monthly' && (
            <>
              <label htmlFor="reports-month">Month</label>
              <select id="reports-month" value={month ?? 1} onChange={(event) => setMonth(Number(event.target.value))}>
                {MONTH_NAMES.map((name, index) => (
                  <option key={name} value={index + 1}>{name}</option>
                ))}
              </select>
            </>
          )}
        </div>
      </section>
      {mode === 'monthly' && monthlyReport != null ? <MonthlyReportView report={monthlyReport} /> : null}
      {mode === 'annual' && annualReport != null ? <AnnualReportView report={annualReport} /> : null}
    </div>
  )
}
