export type NavigationItem = {
  readonly to: string
  readonly label: string
  readonly description: string
  readonly end?: boolean
  readonly available: boolean
}

export const NAVIGATION_ITEMS: readonly NavigationItem[] = [
  {
    to: '/',
    label: 'Overview',
    description: 'Live station snapshot and climate context.',
    end: true,
    available: true,
  },
  {
    to: '/live-data',
    label: 'Live Data',
    description: 'Live conditions and recent observations.',
    available: true,
  },
  {
    to: '/custom-graphs',
    label: 'Custom Graphs',
    description: 'Interactive graphing for selected periods and metrics.',
    available: true,
  },
  {
    to: '/climate-archive',
    label: 'Climate Archive',
    description: 'Historical daily records and monthly summaries.',
    available: true,
  },
  {
    to: '/normals-anomalies',
    label: 'Normals & Anomalies',
    description: 'Baseline comparisons and departures from normal.',
    available: true,
  },
  {
    to: '/records',
    label: 'Records',
    description: 'Station extremes, ties, and all-time values.',
    available: true,
  },
  {
    to: '/comparisons',
    label: 'Comparisons',
    description: 'Side-by-side period and seasonal comparisons.',
    available: true,
  },
  {
    to: '/reports',
    label: 'Reports',
    description: 'Narrative monthly and annual climate reports.',
    available: true,
  },
  {
    to: '/climate-calendar',
    label: 'Climate Calendar',
    description: 'Daily climate history for each day of year.',
    available: true,
  },
  {
    to: '/on-this-day',
    label: 'On This Day',
    description: 'Historic highlights for the current date.',
    available: true,
  },
  {
    to: '/station-information',
    label: 'Station Information',
    description: 'Metadata, methods, coverage and data policies.',
    available: true,
  },
  {
    to: '/data-corrections',
    label: 'Data Corrections',
    description: 'Edit and audit daily climate records. Requires administrator login.',
    available: true,
  },
]

export const DEFAULT_PAGE_META = {
  title: 'Wakefield Station',
  description: 'Professional meteorological dashboard for Wakefield, United Kingdom.',
} as const

export function findNavigationItem(pathname: string): NavigationItem | undefined {
  if (pathname === '/') {
    return NAVIGATION_ITEMS[0]
  }

  return NAVIGATION_ITEMS.find((item) => item.to !== '/' && pathname.startsWith(item.to))
}
