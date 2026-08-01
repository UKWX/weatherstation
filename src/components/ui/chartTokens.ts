export const chartTokens = {
  axisText: 'var(--chart-axis-text)',
  gridLines: 'var(--chart-grid-lines)',
  tooltips: {
    background: 'var(--chart-tooltip-background)',
    text: 'var(--chart-tooltip-text)',
    border: 'var(--chart-tooltip-border)',
  },
  series: {
    observed: 'var(--chart-series-observed)',
    reference: 'var(--chart-series-reference)',
    comparison: 'var(--chart-series-comparison)',
    provisional: 'var(--chart-series-provisional)',
    missing: 'var(--chart-series-missing)',
  },
} as const
