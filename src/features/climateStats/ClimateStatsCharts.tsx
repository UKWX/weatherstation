import { DateSeriesChart } from '@/components/charts'
import { chartTokens } from '@/components/ui/chartTokens'
import { DAILY_NORMAL_BASELINE, MONTHLY_NORMAL_BASELINE, WEATHER_UNITS } from '@/config/weather'
import {
  buildDailyRainfallStats,
  buildDailyTemperatureStats,
  buildMonthlyRainfallStats,
  buildMonthlyTemperatureStats,
  buildMonthlyThresholdStats,
  buildTemperatureRangeStats,
  type ClimateStatsRow,
} from './calculations'
import type { ClimateDay, DailyNormal, MonthlyNormal, MonthlySummary } from '@/types/weather'

interface ClimateStatsChartsProps {
  readonly year: number
  readonly records: readonly ClimateDay[]
  readonly summaries: readonly MonthlySummary[]
  readonly dailyNormals: readonly DailyNormal[]
  readonly monthlyNormals: readonly (Pick<MonthlyNormal, 'month' | 'meanMaxTempC' | 'meanMinTempC' | 'meanTempC'> & Partial<Pick<MonthlyNormal, 'rainfallMm'>>)[]
}

function monthlyRows(
  rows: readonly {
    readonly month: number
    readonly label: string
    readonly values: Record<string, number | null>
  }[],
): readonly ClimateStatsRow[] {
  return rows.map((row) => ({
    timestamp: Date.UTC(2000, row.month - 1, 15, 12),
    label: row.label,
    provisional: false,
    values: row.values,
  }))
}

export function ClimateStatsCharts({
  year,
  records,
  summaries,
  dailyNormals,
  monthlyNormals,
}: ClimateStatsChartsProps) {
  const monthlyTemperature = buildMonthlyTemperatureStats(summaries, monthlyNormals)
  const dailyTemperature = buildDailyTemperatureStats(records, dailyNormals)
  const monthlyRainfall = buildMonthlyRainfallStats(year, summaries, monthlyNormals)
  const dailyRainfall = buildDailyRainfallStats(records)
  const ranges = buildTemperatureRangeStats(records)
  const thresholds = buildMonthlyThresholdStats(records)

  const monthlyTemperatureRows = monthlyRows(monthlyTemperature.map((row) => ({
    month: row.month,
    label: row.label,
    values: {
      observedMax: row.observedMaxC,
      observedMin: row.observedMinC,
      normalMax: row.normalMaxC,
      normalMin: row.normalMinC,
    },
  })))
  const monthlyAnomalyRows = monthlyRows(monthlyTemperature.map((row) => ({
    month: row.month,
    label: row.label,
    values: {
      maxAnomaly: row.maxAnomalyC,
      minAnomaly: row.minAnomalyC,
      meanAnomaly: row.meanAnomalyC,
    },
  })))
  const dailyTemperatureRows: readonly ClimateStatsRow[] = dailyTemperature.map((row) => ({
    timestamp: row.timestamp,
    label: row.label,
    provisional: row.provisional,
    values: {
      observedMax: row.maxC,
      observedMin: row.minC,
      normalMax: row.normalMaxC,
      normalMin: row.normalMinC,
    },
  }))
  const dailyAnomalyRows: readonly ClimateStatsRow[] = dailyTemperature.map((row) => ({
    timestamp: row.timestamp,
    label: row.label,
    provisional: row.provisional,
    values: {
      maxAnomaly: row.maxAnomalyC,
      minAnomaly: row.minAnomalyC,
      meanAnomaly: row.meanAnomalyC,
    },
  }))
  const rainfallRows: readonly ClimateStatsRow[] = monthlyRainfall.map((row) => ({
    timestamp: Date.UTC(2000, row.month - 1, 15, 12),
    label: row.label,
    provisional: !row.complete,
    values: { observed: row.observedMm, normal: row.normalMm },
  }))
  const rainfallDailyRows: readonly ClimateStatsRow[] = dailyRainfall.map((row) => ({
    timestamp: row.timestamp,
    label: row.label,
    provisional: row.provisional,
    values: { daily: row.rainfallMm, cumulative: row.cumulativeMm, rolling: row.rollingMm },
  }))
  const rangeRows: readonly ClimateStatsRow[] = ranges.map((row) => ({
    timestamp: row.timestamp,
    label: row.label,
    provisional: row.provisional,
    values: { max: row.maxC, min: row.minC, range: row.rangeC },
  }))
  const thresholdRows = monthlyRows(thresholds.map((row) => ({
    month: row.month,
    label: row.label,
    values: {
      warm20: row.warm20Days,
      warm25: row.warm25Days,
      warm30: row.warm30Days,
      frost: row.frostDays,
      rain: row.rainDays,
      heavyRain: row.heavyRainDays,
    },
  })))

  return (
    <section className="climate-stats-charts" aria-labelledby="climate-stats-charts-title">
      <h2 id="climate-stats-charts-title">Climate statistics charts</h2>
      <div className="card-grid">
        <DateSeriesChart
          title="Monthly temperature and normals"
          subtitle={`${year} monthly means against the ${MONTHLY_NORMAL_BASELINE} baseline.`}
          rows={monthlyTemperatureRows}
          unit={WEATHER_UNITS.temperature}
          ariaLabel="Monthly temperature and normals"
          series={[
            { key: 'observedMax', label: 'Observed mean max', color: chartTokens.series.observed },
            { key: 'observedMin', label: 'Observed mean min', color: chartTokens.series.comparison },
            { key: 'normalMax', label: `Normal max (${MONTHLY_NORMAL_BASELINE})`, color: chartTokens.series.reference, dashed: true },
            { key: 'normalMin', label: `Normal min (${MONTHLY_NORMAL_BASELINE})`, color: chartTokens.series.reference, dashed: true },
          ]}
          svgFilename={`climate-${year}-monthly-temperature.svg`}
          pngFilename={`climate-${year}-monthly-temperature.png`}
        />
        <DateSeriesChart
          title="Monthly temperature anomalies"
          subtitle="Observed monthly means minus their monthly normal."
          rows={monthlyAnomalyRows}
          unit={WEATHER_UNITS.temperature}
          ariaLabel="Monthly temperature anomalies"
          series={[
            { key: 'maxAnomaly', label: 'Max anomaly', color: chartTokens.series.observed },
            { key: 'minAnomaly', label: 'Min anomaly', color: chartTokens.series.comparison },
            { key: 'meanAnomaly', label: 'Mean anomaly', color: chartTokens.series.reference },
          ]}
          svgFilename={`climate-${year}-temperature-anomalies.svg`}
          pngFilename={`climate-${year}-temperature-anomalies.png`}
        />
        <DateSeriesChart
          title="Daily temperature and normals"
          subtitle={`Daily maxima and minima against the ${DAILY_NORMAL_BASELINE} baseline.`}
          rows={dailyTemperatureRows}
          unit={WEATHER_UNITS.temperature}
          ariaLabel="Daily temperature and normals"
          gapThresholdMs={36 * 60 * 60 * 1000}
          series={[
            { key: 'observedMax', label: 'Observed max', color: chartTokens.series.observed },
            { key: 'observedMin', label: 'Observed min', color: chartTokens.series.comparison },
            { key: 'normalMax', label: 'Normal max', color: chartTokens.series.reference, dashed: true },
            { key: 'normalMin', label: 'Normal min', color: chartTokens.series.reference, dashed: true },
          ]}
          svgFilename={`climate-${year}-daily-temperature.svg`}
          pngFilename={`climate-${year}-daily-temperature.png`}
        />
        <DateSeriesChart
          title="Daily temperature anomalies"
          subtitle="Daily observed values minus the daily temperature normal."
          rows={dailyAnomalyRows}
          unit={WEATHER_UNITS.temperature}
          ariaLabel="Daily temperature anomalies"
          gapThresholdMs={36 * 60 * 60 * 1000}
          series={[
            { key: 'maxAnomaly', label: 'Max anomaly', color: chartTokens.series.observed },
            { key: 'minAnomaly', label: 'Min anomaly', color: chartTokens.series.comparison },
            { key: 'meanAnomaly', label: 'Mean anomaly', color: chartTokens.series.reference },
          ]}
          svgFilename={`climate-${year}-daily-anomalies.svg`}
          pngFilename={`climate-${year}-daily-anomalies.png`}
        />
        <DateSeriesChart
          title="Monthly rainfall versus normal"
          subtitle={`${year} rainfall against the ${MONTHLY_NORMAL_BASELINE} normal.`}
          rows={rainfallRows}
          unit={WEATHER_UNITS.rainfall}
          ariaLabel="Monthly rainfall versus normal"
          series={[
            { key: 'observed', label: 'Observed rainfall', color: chartTokens.series.observed },
            { key: 'normal', label: `Normal (${MONTHLY_NORMAL_BASELINE})`, color: chartTokens.series.reference, dashed: true },
          ]}
          svgFilename={`climate-${year}-monthly-rainfall.svg`}
          pngFilename={`climate-${year}-monthly-rainfall.png`}
        />
        <DateSeriesChart
          title="Daily rainfall and accumulation"
          subtitle="Daily rainfall, seven-day rolling rainfall, and cumulative rainfall."
          rows={rainfallDailyRows}
          unit={WEATHER_UNITS.rainfall}
          ariaLabel="Daily rainfall and cumulative rainfall"
          gapThresholdMs={36 * 60 * 60 * 1000}
          series={[
            { key: 'daily', label: 'Daily rainfall', color: chartTokens.series.observed },
            { key: 'rolling', label: 'Seven-day rainfall', color: chartTokens.series.comparison },
            { key: 'cumulative', label: 'Cumulative rainfall', color: chartTokens.series.reference },
          ]}
          svgFilename={`climate-${year}-daily-rainfall.svg`}
          pngFilename={`climate-${year}-daily-rainfall.png`}
        />
        <DateSeriesChart
          title="Temperature range"
          subtitle="Daily maximum, minimum, and diurnal temperature range."
          rows={rangeRows}
          unit={WEATHER_UNITS.temperature}
          ariaLabel="Daily temperature range"
          gapThresholdMs={36 * 60 * 60 * 1000}
          series={[
            { key: 'max', label: 'Maximum', color: chartTokens.series.observed },
            { key: 'min', label: 'Minimum', color: chartTokens.series.comparison },
            { key: 'range', label: 'Daily range', color: chartTokens.series.reference },
          ]}
          svgFilename={`climate-${year}-temperature-range.svg`}
          pngFilename={`climate-${year}-temperature-range.png`}
        />
        <DateSeriesChart
          title="Warm, frost, and wet days"
          subtitle="Monthly threshold counts; rain days use the strict >0.1 mm rule."
          rows={thresholdRows}
          unit="days"
          ariaLabel="Monthly warm frost and wet day counts"
          series={[
            { key: 'warm20', label: '≥20 °C', color: '#ef9b20' },
            { key: 'warm25', label: '≥25 °C', color: '#d85b2a' },
            { key: 'warm30', label: '≥30 °C', color: '#a82424' },
            { key: 'frost', label: '<0 °C', color: '#3478b9' },
            { key: 'rain', label: 'Rain days', color: '#2b8cbe' },
            { key: 'heavyRain', label: 'Heavy rain', color: '#16537e' },
          ]}
          svgFilename={`climate-${year}-threshold-days.svg`}
          pngFilename={`climate-${year}-threshold-days.png`}
        />
      </div>
    </section>
  )
}
