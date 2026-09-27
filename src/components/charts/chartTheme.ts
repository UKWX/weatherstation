export const chartTheme = {
  logicalWidth: 1400,
  exportWidth: 1480,
  logicalHeight: 560,
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  margins: {
    top: 112,
    right: 34,
    bottom: 82,
    left: 72,
  },
  colors: {
    ink: '#1c2530',
    sub: '#5b6773',
    grid: '#e4e8ec',
    monthLine: '#aeb8c2',
    bandEdge: '#7a8794',
    actualMax: '#c22b2b',
    actualMin: '#2453c9',
    rollingMean: '#555b61',
    recordHighMax: '#e07a4d',
    recordLowMin: '#6fa3d6',
    tagHighMax: '#a3241d',
    tagLowMax: '#0d7d7d',
    tagHighMin: '#b8860b',
    tagLowMin: '#1d3f8a',
    crosshair: '#8a94a0',
    tooltipBackground: '#1c2530',
    tooltipText: '#ffffff',
    tooltipBorder: '#1c2530',
    wetter: 'rgba(47,95,168,0.28)',
    drier: 'rgba(201,138,58,0.35)',
    rainfallBar: '#7f96ad',
    rainfallCurrent: '#2f5fa8',
    rainfallNormal: '#555b61',
    rainfallWetText: '#8cc4ff',
    rainfallDryText: '#f0b36b',
  },
  strokeWidths: {
    gridMajor: 1.4,
    gridMinor: 1,
    standard: 2.4,
    emphasis: 3.4,
    thin: 1.4,
    bars: 1.6,
  },
  fontSizes: {
    tick: 11,
    axisTitle: 12,
    monthHeader: 12.5,
    tooltip: 12.5,
    legend: 12.5,
    title: 24,
    subtitle: 14,
    footnote: 11.5,
  },
} as const

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

export function plotWidth(width = chartTheme.logicalWidth): number {
  return width - chartTheme.margins.left - chartTheme.margins.right
}

export function plotHeight(height = chartTheme.logicalHeight): number {
  return height - chartTheme.margins.top - chartTheme.margins.bottom
}
