import type { ClimateDateString, MeasurementUnits } from '@/types/weather'

export const PUBLIC_STATION_DATA_BASE_URL =
  'https://ukwx.duckdns.org/station-data'

export const STATION_ADMIN_BASE_URL =
  'https://ukwx.duckdns.org/station-admin'

export const EUROPE_LONDON_TIMEZONE = 'Europe/London'

export const WEATHER_UNITS = {
  temperature: '°C',
  rainfall: 'mm',
  pressure: 'hPa',
  wind: 'mph',
} as const satisfies MeasurementUnits

export const TEMPERATURE_START_DATE =
  '1995-01-01' as const satisfies ClimateDateString

export const RAINFALL_START_DATE =
  '2020-05-01' as const satisfies ClimateDateString

export const DAILY_NORMAL_BASELINE = '1995–2024' as const

export const MONTHLY_NORMAL_BASELINE = '1991–2020' as const

export const RAIN_DAY_THRESHOLD_MM = 0.1

export const WEATHER_DASHBOARD_CONFIG = {
  publicStationDataBaseUrl: PUBLIC_STATION_DATA_BASE_URL,
  stationAdminBaseUrl: STATION_ADMIN_BASE_URL,
  timezone: EUROPE_LONDON_TIMEZONE,
  units: WEATHER_UNITS,
  temperatureStartDate: TEMPERATURE_START_DATE,
  rainfallStartDate: RAINFALL_START_DATE,
  dailyNormalBaseline: DAILY_NORMAL_BASELINE,
  monthlyNormalBaseline: MONTHLY_NORMAL_BASELINE,
  rainDayThresholdMm: RAIN_DAY_THRESHOLD_MM,
} as const
