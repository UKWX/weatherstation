import { useEffect, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Badge, ErrorState, ResponsiveChartContainer, Skeleton, TableWrapper, VisuallyHidden } from '@/components/ui'
import { WEATHER_UNITS } from '@/config/weather'
import {
  buildOnThisDayData,
  CALENDAR_MONTH_NAMES,
  describeStatus,
  isRainfallUnavailableForDate,
} from '@/features/climateCalendar/model'
import {
  useAnnualClimateQueries,
  useClimateArchiveIndexQuery,
  useDailyNormalsQuery,
} from '@/hooks/usePublicWeatherQueries'
import {
  daysInMonth,
  formatNullableMeasurement,
  getEuropeLondonClimateDate,
  parseIsoClimateDate,
} from '@/lib/climate'

const CHART_WIDTH = 780
const CHART_HEIGHT = 220
const CHART_PADDING = { top: 14, right: 18, bottom: 34, left: 40 }

function formatTemperatureAnomaly(value: number | null): string {
  if (value == null) return '—'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)} ${WEATHER_UNITS.temperature}`
}

function useOnThisDaySelection() {
  const [searchParams, setSearchParams] = useSearchParams()
  const today = getEuropeLondonClimateDate()
  const todayParts = parseIsoClimateDate(today)
  const monthParam = searchParams.get('month')
  const dayParam = searchParams.get('day')
  const month = monthParam != null && /^(?:[1-9]|1[0-2])$/.test(monthParam)
    ? Number(monthParam)
    : todayParts.month
  const maxDay = month === 2 ? 29 : daysInMonth(2025, month)
  const day = dayParam != null && /^\d{1,2}$/.test(dayParam) && Number(dayParam) >= 1 && Number(dayParam) <= maxDay
    ? Number(dayParam)
    : Math.min(todayParts.day, maxDay)

  useEffect(() => {
    if (monthParam == null || dayParam == null) {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous)
        next.set('month', String(month))
        next.set('day', String(day))
        return next
      }, { replace: true })
    }
  }, [day, dayParam, month, monthParam, setSearchParams])

  const update = (nextMonth: number, nextDay: number) => {
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous)
      params.set('month', String(nextMonth))
      params.set('day', String(nextDay))
      return params
    }, { replace: true })
  }

  return { month, day, update }
}

function TemperatureHistoryChart({
  rows,
}: {
  readonly rows: ReturnType<typeof buildOnThisDayData>['chartRows']
}) {
  if (rows.length === 0) {
    return <p className="archive-obs-note">No historical chart data available.</p>
  }

  const values = rows.flatMap((row) => [row.maxTempC, row.minTempC]).filter((value): value is number => value != null)
  const minValue = Math.floor(Math.min(...values)) - 1
  const maxValue = Math.ceil(Math.max(...values)) + 1
  const innerWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right
  const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
  const scaleX = (index: number) => CHART_PADDING.left + (rows.length <= 1 ? innerWidth / 2 : (index / (rows.length - 1)) * innerWidth)
  const scaleY = (value: number) => CHART_PADDING.top + innerHeight - ((value - minValue) / (maxValue - minValue || 1)) * innerHeight
  const buildPath = (selector: (row: (typeof rows)[number]) => number | null) => rows.reduce<string>((path, row, index) => {
    const value = selector(row)
    if (value == null) return path
    const command = path === '' ? 'M' : 'L'
    return `${path}${command} ${scaleX(index).toFixed(1)} ${scaleY(value).toFixed(1)} `
  }, '')

  return (
    <ResponsiveChartContainer>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="Historical temperature chart">
        <line x1={CHART_PADDING.left} x2={CHART_WIDTH - CHART_PADDING.right} y1={CHART_HEIGHT - CHART_PADDING.bottom} y2={CHART_HEIGHT - CHART_PADDING.bottom} stroke="var(--chart-grid-lines)" />
        <line x1={CHART_PADDING.left} x2={CHART_PADDING.left} y1={CHART_PADDING.top} y2={CHART_HEIGHT - CHART_PADDING.bottom} stroke="var(--chart-grid-lines)" />
        <path d={buildPath((row) => row.maxTempC)} fill="none" stroke="var(--chart-series-observed)" strokeWidth="2.5" />
        <path d={buildPath((row) => row.minTempC)} fill="none" stroke="var(--chart-series-reference)" strokeWidth="2.5" />
        {rows.map((row, index) => (
          <text key={row.year} x={scaleX(index)} y={CHART_HEIGHT - 8} textAnchor="middle" fontSize="9" fill="var(--chart-axis-text)">{row.year}</text>
        ))}
      </svg>
      <p className="archive-legend">
        <span className="legend-swatch climate-calendar-cell--temp-4" aria-hidden="true" /> Highest max
        <span className="legend-swatch climate-calendar-cell--temp-1" aria-hidden="true" /> Lowest min
      </p>
    </ResponsiveChartContainer>
  )
}

function MeanAnomalyChart({
  rows,
}: {
  readonly rows: ReturnType<typeof buildOnThisDayData>['chartRows']
}) {
  const validRows = rows.filter((row) => row.meanAnomalyC != null)
  if (validRows.length === 0) {
    return <p className="archive-obs-note">No anomaly chart data available.</p>
  }

  const maxMagnitude = Math.max(...validRows.map((row) => Math.abs(row.meanAnomalyC ?? 0)), 1)
  const innerWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right
  const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
  const zeroY = CHART_PADDING.top + innerHeight / 2
  const barWidth = innerWidth / validRows.length - 4

  return (
    <ResponsiveChartContainer>
      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="Mean anomaly by year chart">
        <line x1={CHART_PADDING.left} x2={CHART_WIDTH - CHART_PADDING.right} y1={zeroY} y2={zeroY} stroke="var(--chart-grid-lines)" />
        {validRows.map((row, index) => {
          const height = ((Math.abs(row.meanAnomalyC ?? 0) / maxMagnitude) * innerHeight) / 2
          const x = CHART_PADDING.left + index * (barWidth + 4)
          const y = (row.meanAnomalyC ?? 0) >= 0 ? zeroY - height : zeroY
          return (
            <g key={row.year}>
              <rect x={x} y={y} width={Math.max(8, barWidth)} height={height} fill={(row.meanAnomalyC ?? 0) >= 0 ? 'var(--chart-series-provisional)' : 'var(--chart-series-comparison)'} />
              <text x={x + Math.max(8, barWidth) / 2} y={CHART_HEIGHT - 8} textAnchor="middle" fontSize="9" fill="var(--chart-axis-text)">{row.year}</text>
            </g>
          )
        })}
      </svg>
    </ResponsiveChartContainer>
  )
}

export default function OnThisDayPage() {
  const archiveIndexQuery = useClimateArchiveIndexQuery()
  const dailyNormalsQuery = useDailyNormalsQuery()
  const { month, day, update } = useOnThisDaySelection()
  const availableYears = useMemo(
    () => (archiveIndexQuery.data?.years ?? []).map((entry) => entry.year).sort((left, right) => left - right),
    [archiveIndexQuery.data],
  )
  const annualQueries = useAnnualClimateQueries(availableYears)
  const annualPayloads = annualQueries.map((query) => query.data)
  const anyAnnualLoading = annualQueries.some((query) => query.isLoading && query.data == null)
  const annualError = annualQueries.find((query) => query.error != null && query.data == null)
  const data = useMemo(
    () => buildOnThisDayData(month, day, annualPayloads, dailyNormalsQuery.data?.records ?? []),
    [annualPayloads, dailyNormalsQuery.data?.records, day, month],
  )

  if (archiveIndexQuery.isLoading && archiveIndexQuery.data == null) {
    return <section className="card" aria-live="polite"><Skeleton lines={4} /><VisuallyHidden>Loading On This Day coverage</VisuallyHidden></section>
  }

  if (archiveIndexQuery.error != null && archiveIndexQuery.data == null) {
    return <ErrorState title="On This Day unavailable" message="Unable to load the archive year list right now." onRetry={() => { void archiveIndexQuery.refetch() }} />
  }

  if (anyAnnualLoading || dailyNormalsQuery.isLoading) {
    return <section className="card" aria-live="polite"><Skeleton lines={8} /><VisuallyHidden>Loading On This Day history</VisuallyHidden></section>
  }

  if (annualError != null) {
    return <ErrorState title="On This Day history unavailable" message="Unable to load one or more yearly climate files right now." onRetry={() => { void annualError.refetch?.() }} />
  }

  const selectedDateLabel = `${CALENDAR_MONTH_NAMES[month - 1]} ${day}`
  const dayOptions = Array.from({ length: month === 2 ? 29 : daysInMonth(2025, month) }, (_, index) => index + 1)
  const hasTemperatureNormal =
    data.normal?.normalMaxTempC != null ||
    data.normal?.normalMinTempC != null ||
    data.normal?.normalMeanTempC != null

  return (
    <div className="archive-layout on-this-day-layout">
      <section className="card">
        <div className="archive-card-heading">
          <h2>On This Day</h2>
          <Badge variant="default">Europe/London default</Badge>
        </div>
        <p>
          Historic daily context for <strong>{selectedDateLabel}</strong> across {data.sampleSize} available year{data.sampleSize === 1 ? '' : 's'}.
        </p>
        {data.leapDay ? (
          <p className="archive-obs-note">29 February includes leap years only, so the sample is smaller than other dates.</p>
        ) : null}
      </section>

      <section className="card archive-controls">
        <div className="archive-controls-row">
          <label className="archive-label" htmlFor="on-this-day-month">Month</label>
          <select id="on-this-day-month" className="archive-select" value={month} onChange={(event) => {
            const nextMonth = Number(event.target.value)
            update(nextMonth, Math.min(day, nextMonth === 2 ? 29 : daysInMonth(2025, nextMonth)))
          }}>
            {CALENDAR_MONTH_NAMES.map((name, index) => (
              <option key={name} value={index + 1}>{name}</option>
            ))}
          </select>
          <label className="archive-label" htmlFor="on-this-day-day">Day</label>
          <select id="on-this-day-day" className="archive-select" value={day} onChange={(event) => update(month, Number(event.target.value))}>
            {dayOptions.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="card">
        <div className="archive-card-heading">
          <h2>Normals and sample</h2>
          <Badge variant="default">Daily baseline</Badge>
        </div>
        <dl className="archive-stats-grid">
          <div>
            <dt>Normal max</dt>
            <dd>{formatNullableMeasurement(data.normal?.normalMaxTempC ?? null, { unit: WEATHER_UNITS.temperature })}</dd>
          </div>
          <div>
            <dt>Normal min</dt>
            <dd>{formatNullableMeasurement(data.normal?.normalMinTempC ?? null, { unit: WEATHER_UNITS.temperature })}</dd>
          </div>
          <div>
            <dt>Mean temperature</dt>
            <dd>{formatNullableMeasurement(data.meanTempC, { unit: WEATHER_UNITS.temperature })}</dd>
          </div>
          <div>
            <dt>Median temperature</dt>
            <dd>{formatNullableMeasurement(data.medianMeanTempC, { unit: WEATHER_UNITS.temperature })}</dd>
          </div>
          <div>
            <dt>Sample size</dt>
            <dd>{data.sampleSize}</dd>
          </div>
          <div>
            <dt>Rainfall sample</dt>
            <dd>{data.rainfallSampleSize}</dd>
          </div>
        </dl>
        {!hasTemperatureNormal ? (
          <p className="archive-obs-note">The normals endpoint does not provide a daily normal for this date.</p>
        ) : null}
      </section>

      <section className="card">
        <div className="archive-card-heading">
          <h2>Daily records</h2>
          <Badge variant="default">Ties included</Badge>
        </div>
        <dl className="archive-stats-grid">
          <div>
            <dt>Highest max</dt>
            <dd>{data.highestMax == null ? '—' : `${formatNullableMeasurement(data.highestMax.value, { unit: WEATHER_UNITS.temperature })} (${data.highestMax.years.join(', ')})`}</dd>
          </div>
          <div>
            <dt>Lowest max</dt>
            <dd>{data.lowestMax == null ? '—' : `${formatNullableMeasurement(data.lowestMax.value, { unit: WEATHER_UNITS.temperature })} (${data.lowestMax.years.join(', ')})`}</dd>
          </div>
          <div>
            <dt>Highest min</dt>
            <dd>{data.highestMin == null ? '—' : `${formatNullableMeasurement(data.highestMin.value, { unit: WEATHER_UNITS.temperature })} (${data.highestMin.years.join(', ')})`}</dd>
          </div>
          <div>
            <dt>Lowest min</dt>
            <dd>{data.lowestMin == null ? '—' : `${formatNullableMeasurement(data.lowestMin.value, { unit: WEATHER_UNITS.temperature })} (${data.lowestMin.years.join(', ')})`}</dd>
          </div>
          <div>
            <dt>Wettest available year</dt>
            <dd>{data.wettest == null ? 'Unavailable' : `${formatNullableMeasurement(data.wettest.value, { unit: WEATHER_UNITS.rainfall })} (${data.wettest.years.join(', ')})`}</dd>
          </div>
        </dl>
      </section>

      <section className="card">
        <div className="archive-card-heading">
          <h2>Historical temperature chart</h2>
          <Badge variant="default">Max and min</Badge>
        </div>
        <TemperatureHistoryChart rows={data.chartRows} />
      </section>

      <section className="card">
        <div className="archive-card-heading">
          <h2>Mean anomaly by year</h2>
          <Badge variant="default">Against daily normal</Badge>
        </div>
        <MeanAnomalyChart rows={data.chartRows} />
      </section>

      <section className="card">
        <div className="archive-card-heading">
          <h2>Year-by-year table</h2>
          <Badge variant="default">Archive links</Badge>
        </div>
        <TableWrapper>
          <table aria-label={`On This Day history for ${selectedDateLabel}`}>
            <thead>
              <tr>
                <th scope="col">Year</th>
                <th scope="col">Max</th>
                <th scope="col">Min</th>
                <th scope="col">Mean</th>
                <th scope="col">Rainfall</th>
                <th scope="col">Mean anomaly</th>
                <th scope="col">Status</th>
                <th scope="col">Archive</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.date}>
                  <td>{row.year}</td>
                  <td>{formatNullableMeasurement(row.maxTempC, { unit: WEATHER_UNITS.temperature })}</td>
                  <td>{formatNullableMeasurement(row.minTempC, { unit: WEATHER_UNITS.temperature })}</td>
                  <td>{formatNullableMeasurement(row.meanTempC, { unit: WEATHER_UNITS.temperature })}</td>
                  <td>{isRainfallUnavailableForDate(row.date) ? 'Unavailable' : formatNullableMeasurement(row.rainfallMm, { unit: WEATHER_UNITS.rainfall })}</td>
                  <td>{formatTemperatureAnomaly(row.meanAnomalyC)}</td>
                  <td>{describeStatus(row.status)}</td>
                  <td>
                    <Link to={`/climate-archive?date=${row.date}`} className="link-focus">Archive</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrapper>
      </section>
    </div>
  )
}
