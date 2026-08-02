import type { ReactNode } from 'react'

const ICON_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const ICONS: Record<string, ReactNode> = {
  temperature: (
    <svg {...ICON_PROPS}>
      <path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0Z" />
    </svg>
  ),
  'feels-like': (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="7" r="3" />
      <path d="M6 21v-2a6 6 0 0 1 12 0v2" />
    </svg>
  ),
  'dew-point': (
    <svg {...ICON_PROPS}>
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
    </svg>
  ),
  humidity: (
    <svg {...ICON_PROPS}>
      <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z" />
      <path d="M9 15l6-6" />
    </svg>
  ),
  pressure: (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 12l4-3" />
      <path d="M12 12v-4" />
    </svg>
  ),
  'wind-speed': (
    <svg {...ICON_PROPS}>
      <path d="M3 8h11a2.5 2.5 0 1 0-2.5-2.5" />
      <path d="M3 12h15a2.5 2.5 0 1 1-2.5 2.5" />
      <path d="M3 16h9" />
    </svg>
  ),
  'wind-gust': (
    <svg {...ICON_PROPS}>
      <path d="M3 9h12a2 2 0 1 0-2-2" />
      <path d="M3 14h16a2 2 0 1 1-2 2" />
    </svg>
  ),
  'rain-rate': (
    <svg {...ICON_PROPS}>
      <path d="M7 15a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 16 15" />
      <path d="M8 18l-1 2" />
      <path d="M12 18l-1 2" />
      <path d="M16 18l-1 2" />
    </svg>
  ),
  'rain-today': (
    <svg {...ICON_PROPS}>
      <path d="M7 13a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 16 13" />
      <path d="M9 17l-1 3" />
      <path d="M13 17l-1 3" />
    </svg>
  ),
}

export function MetricIcon({ name }: { readonly name: string }) {
  return ICONS[name] ?? ICONS.temperature
}
