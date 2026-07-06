import cron from 'node-cron';
import { DateTime } from 'luxon';
import { config } from '../config';
import {
  computeAnnualSummary,
  computeClimateNormals,
  computeDailySummary,
  computeMonthlySummary
} from '../services/processingService';
import { rebuildAnomalies, rebuildRankings, rebuildRecords } from '../services/analyticsService';
import { fetchLatestWeatherObservation } from '../services/weatherDataFetcher';

export const startScheduler = (): void => {
  if (config.weatherApiKey && config.weatherStationId) {
    cron.schedule(
      config.weatherFetchCron,
      () => {
        fetchLatestWeatherObservation().catch((error) => {
          console.error(
            `Weather fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        });
      },
      {
        timezone: config.timezone
      }
    );
  } else {
    console.warn('Weather fetch scheduler disabled: WEATHER_API_KEY and WEATHER_STATION_ID must be configured.');
  }

  cron.schedule(
    '5 18 * * *',
    () => {
      const now = DateTime.now().setZone(config.timezone).minus({ days: 1 });
      const day = now.toISODate();
      if (!day) {
        return;
      }

      computeDailySummary(day);
      computeMonthlySummary(now.year, now.month);
      computeAnnualSummary(now.year);
      computeClimateNormals();
      rebuildRecords();
      rebuildAnomalies();
      rebuildRankings();
    },
    {
      timezone: config.timezone
    }
  );
};
