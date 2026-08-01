import type { CustomGraphSeries } from '@/features/customGraphs/types'

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatValue(value: number | null): string {
  return value == null ? '' : value.toFixed(2)
}

export function buildCustomGraphCsv(series: readonly CustomGraphSeries[]): string {
  const visibleSeries = series.filter((entry) => !entry.hidden)
  if (visibleSeries.length === 0) {
    return 'Label\r\n'
  }

  const rowCount = Math.max(...visibleSeries.map((entry) => entry.points.length))
  const header = ['Label', ...visibleSeries.map((entry) => `${entry.label} (${entry.unit})`)]
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const label = visibleSeries[0]?.points[index]?.label ?? ''
    return [
      csvEscape(label),
      ...visibleSeries.map((entry) => formatValue(entry.points[index]?.value ?? null)),
    ].join(',')
  })

  return [header.map(csvEscape).join(','), ...rows].join('\r\n')
}
