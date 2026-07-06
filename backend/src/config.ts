import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: Number(process.env.PORT ?? 4000),
  stationId: process.env.WEATHER_STATION_ID ?? process.env.STATION_ID ?? 'UKWX',
  weatherStationId: process.env.WEATHER_STATION_ID ?? process.env.STATION_ID ?? 'UKWX',
  weatherApiKey: process.env.WEATHER_API_KEY ?? '',
  weatherApiEndpoint:
    process.env.WEATHER_API_ENDPOINT ?? 'https://api.weather.com/v2/pws/observations/current',
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
