import { RAINFALL_START_DATE } from '@/config/weather'
import type { ClimateDateString, ClimateDay, MonthlySummary } from '@/types/weather'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatTemp(value: number | null): string {
  if (value == null) return ''
  return value.toFixed(1)
}

/**
 * Decide how to represent rainfall in CSV output.
 * - Pre-availability date: "Unavailable"
 * - Null within available period: "" (missing)
 * - Actual value: "0.0" or positive number
 */
function csvRainfall(date: ClimateDateString, rainfallMm: number | null): string {
  if (date < RAINFALL_START_DATE) {
    return 'Unavailable'
  }
  if (rainfallMm == null) {
    return ''
  }
  return rainfallMm.toFixed(1)
}

/**
 * Build a CSV string from a set of daily climate records.
 * If month is provided, filters to that month.
 */
export function buildDailyCsv(
  records: readonly ClimateDay[],
  year: number,
  month?: number,
): string {
  const filtered =
    month != null
      ? records.filter((r) => {
          const parts = r.date.split('-')
          return Number(parts[0]) === year && Number(parts[1]) === month
        })
      : records.filter((r) => r.date.startsWith(`${String(year).padStart(4, '0')}-`))

  const sorted = [...filtered].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

  const header = 'Date,Max (°C),Min (°C),Mean (°C),Rainfall (mm),Status'

  const rows = sorted.map((r) =>
    [
      r.date,
      formatTemp(r.maxTempC),
      formatTemp(r.minTempC),
      formatTemp(r.meanTempC),
      csvRainfall(r.date, r.rainfallMm),
      csvEscape(r.status),
    ].join(','),
  )

  return [header, ...rows].join('\r\n')
}

/**
 * Build a CSV summary from monthly summaries within an annual summary.
 */
export function buildAnnualMonthlyCsv(
  year: number,
  monthlySummaries: readonly MonthlySummary[],
): string {
  const header =
    'Month,Mean Max (°C),Mean Min (°C),Mean (°C),Rainfall (mm),Rain Days,Wettest Day (mm),Valid Days (max),Missing Days (max)'

  const rows = monthlySummaries.map((m) => {
    const rainfallAvailable =
      m.year > 2020 || (m.year === 2020 && m.month >= 5)
    const rainfallValue =
      m.rainfallTotalMm != null
        ? m.rainfallTotalMm.toFixed(1)
        : rainfallAvailable
          ? ''
          : 'Unavailable'

    return [
      csvEscape(MONTH_NAMES[m.month - 1] ?? String(m.month)),
      formatTemp(m.meanMaxTempC),
      formatTemp(m.meanMinTempC),
      formatTemp(m.meanTempC),
      rainfallValue,
      String(m.rainDays),
      formatTemp(m.wettestDay.value),
      String(m.coverage.maxTemperature.valid),
      String(m.coverage.maxTemperature.missing),
    ].join(',')
  })

  return [`Year: ${year}`, header, ...rows].join('\r\n')
}

/**
 * Trigger a browser download of CSV content.
 */
export function downloadCsvBlob(content: string, filename: string): void {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
