import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const weatherStationId = process.env.WEATHER_STATION_ID ?? '';
const stationId = process.env.STATION_ID ?? (weatherStationId || 'UKWX');

export const config = {
  port: Number(process.env.PORT ?? 4000),
  stationId,
  weatherStationId,
  weatherApiKey: process.env.WEATHER_API_KEY ?? '',
  weatherApiEndpoint:
    process.env.WEATHER_API_ENDPOINT ?? 'https://api.weather.com/v2/pws/observations/current',
  weatherFetchCron: process.env.WEATHER_FETCH_CRON ?? '* * * * *',
  temperatureHistoryStartYear: Number(process.env.TEMPERATURE_HISTORY_START_YEAR ?? 1995),
  rainfallHistoryStartYear: Number(process.env.RAINFALL_HISTORY_START_YEAR ?? 2020),
  timezone: process.env.TIMEZONE ?? 'Europe/London',
  dbPath:
    process.env.DB_PATH ??
    path.join(
      '/home/runner/work/WakefieldStation/WakefieldStation/backend/data',
      'weather.db'
    ),
  retentionDays: Number(process.env.RETENTION_DAYS ?? 36500),
  climateBaselineStart: Number(process.env.CLIMATE_BASELINE_START ?? 1991),
  climateBaselineEnd: Number(process.env.CLIMATE_BASELINE_END ?? 2020),
  importPath:
    process.env.IMPORT_PATH ??
    '/home/runner/work/WakefieldStation/WakefieldStation/backend/imports'
} as const;
