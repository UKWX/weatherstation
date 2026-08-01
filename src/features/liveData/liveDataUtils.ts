import { EUROPE_LONDON_TIMEZONE } from '@/config/weather'
import type { RecentObservation } from '@/types/weather'

export type RangeHours = 1 | 3 | 6 | 12 | 24
export type SortOrder = 'newest-first' | 'oldest-first'

export const RANGE_OPTIONS: { label: string; value: RangeHours }[] = [
  { label: '1 hour', value: 1 },
  { label: '3 hours', value: 3 },
  { label: '6 hours', value: 6 },
  { label: '12 hours', value: 12 },
  { label: '24 hours', value: 24 },
]

export type MeasurementKey =
  | 'temperatureC'
  | 'humidityPercent'
  | 'pressureHpa'
  | 'windSpeedMph'
  | 'rainRateMmPerHour'

export const MEASUREMENT_OPTIONS: {
  key: MeasurementKey
  label: string
  tableLabel: string
}[] = [
  { key: 'temperatureC', label: 'Temperature', tableLabel: 'Temp (°C)' },
  { key: 'humidityPercent', label: 'Humidity', tableLabel: 'Humidity (%)' },
  { key: 'pressureHpa', label: 'Pressure', tableLabel: 'Pressure (hPa)' },
  { key: 'windSpeedMph', label: 'Wind', tableLabel: 'Wind (mph)' },
  { key: 'rainRateMmPerHour', label: 'Rainfall', tableLabel: 'Rain rate (mm/h)' },
]

export function filterObservationsByRange(
  observations: readonly RecentObservation[],
  rangeHours: RangeHours,
  now: Date = new Date(),
): RecentObservation[] {
  const cutoff = now.valueOf() - rangeHours * 60 * 60 * 1000
  return observations.filter((obs) => {
    const t = new Date(obs.observationTimeUtc).valueOf()
    return !Number.isNaN(t) && t >= cutoff
  })
}

export function isFieldSupportedInWindow(
  observations: readonly RecentObservation[],
  field: keyof RecentObservation,
): boolean {
  return observations.some((obs) => obs[field] != null)
}

export function sortObservations(
  observations: readonly RecentObservation[],
  order: SortOrder,
): RecentObservation[] {
  return [...observations].sort((a, b) => {
    const ta = new Date(a.observationTimeUtc).valueOf()
    const tb = new Date(b.observationTimeUtc).valueOf()
    return order === 'newest-first' ? tb - ta : ta - tb
  })
}

export function deriveFeelsLikeFromObservation(obs: RecentObservation): number | null {
  return obs.heatIndexC ?? obs.windChillC ?? null
}

export function exportObservationsCsv(observations: readonly RecentObservation[]): string {
  const headers = [
    'timestamp_utc',
    'timestamp_local',
    'temperature_c',
    'feels_like_c',
    'dew_point_c',
    'humidity_percent',
    'pressure_hpa',
    'wind_speed_mph',
    'wind_gust_mph',
    'wind_direction_degrees',
    'rain_rate_mm_per_hour',
    'rain_today_mm',
  ]

  const sorted = [...observations].sort(
    (a, b) =>
      new Date(a.observationTimeUtc).valueOf() - new Date(b.observationTimeUtc).valueOf(),
  )

  const rows = sorted.map((obs) => [
    csvCell(obs.observationTimeUtc),
    csvCell(obs.observationTimeLocal),
    csvNum(obs.temperatureC),
    csvNum(deriveFeelsLikeFromObservation(obs)),
    csvNum(obs.dewpointC),
    csvNum(obs.humidityPercent),
    csvNum(obs.pressureHpa),
    csvNum(obs.windSpeedMph),
    csvNum(obs.windGustMph),
    csvNum(obs.windDirectionDegrees),
    csvNum(obs.rainRateMmPerHour),
    csvNum(obs.rainTodayMm),
  ])

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
}

function csvCell(value: string | null | undefined): string {
  if (value == null) return ''
  return value.includes(',') ? `"${value}"` : value
}

function csvNum(value: number | null | undefined): string {
  return value == null ? '' : String(value)
}

export function formatLondonTime(utc: string | null): string {
  if (utc == null) return '—'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: EUROPE_LONDON_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(utc))
  } catch {
    return '—'
  }
}

export function formatLondonDateTime(utc: string | null): string {
  if (utc == null) return '—'
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: EUROPE_LONDON_TIMEZONE,
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(utc))
  } catch {
    return '—'
  }
}

export function formatObservationAge(seconds: number | null): string {
  if (seconds == null) return '—'
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remainingMins = minutes % 60
  return remainingMins === 0 ? `${hours}h` : `${hours}h ${remainingMins}m`
}

export function computeObservationAgeSeconds(
  observationTimeUtc: string | null,
  now: Date,
): number | null {
  if (observationTimeUtc == null) return null
  const t = new Date(observationTimeUtc).valueOf()
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now.valueOf() - t) / 1000))
}

export function isStaleObservation(
  ageSeconds: number | null,
  staleThresholdSeconds = 900,
): boolean {
  return ageSeconds != null && ageSeconds > staleThresholdSeconds
}
