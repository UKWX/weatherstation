import { config } from '../config';
import { db } from '../db/connection';

export const LIGHTNING_CLIMATOLOGY_RADIUS_KM = 20;
// Fall back to the legacy lightning_strikes column until all historical rows are rebuilt.
export const LIGHTNING_COUNT_SQL = 'COALESCE(lightning_count, lightning_strikes, 0)';
// Fall back to deriving thunder_day from the legacy strike count when the explicit field is absent.
export const THUNDER_DAY_SQL = `COALESCE(thunder_day, CASE WHEN ${LIGHTNING_COUNT_SQL} > 0 THEN 1 ELSE 0 END)`;

export interface LightningClimatologySummary {
  lightning_count: number;
  thunder_day: number;
  peak_intensity: number | null;
}

export const getLightningClimatologySummary = (
  startUtc: string,
  endUtc: string
): LightningClimatologySummary => {
  const row = db
    .prepare(
      `SELECT count(*) as lightning_count,
              max(intensity) as peak_intensity
       FROM lightning_events
       WHERE station_id = ?
         AND event_time_utc >= ?
         AND event_time_utc < ?
         AND distance_km <= ?`
    )
    .get(config.stationId, startUtc, endUtc, LIGHTNING_CLIMATOLOGY_RADIUS_KM) as {
    lightning_count: number;
    peak_intensity: number | null;
  };

  return {
    lightning_count: row.lightning_count,
    thunder_day: row.lightning_count > 0 ? 1 : 0,
    peak_intensity: row.peak_intensity
  };
};

export const getLightningClimatologyOverview = () => {
  const summary = db
    .prepare(
      `SELECT count(*) as lightning_count,
              max(intensity) as peak_intensity,
              max(distance_km) as furthest_distance
       FROM lightning_events
       WHERE station_id = ?
         AND distance_km <= ?`
    )
    .get(config.stationId, LIGHTNING_CLIMATOLOGY_RADIUS_KM) as {
    lightning_count: number;
    peak_intensity: number | null;
    furthest_distance: number | null;
  };

  const thunderDays = db
    .prepare(
      `SELECT COALESCE(
                sum(
                  CASE
                    WHEN ${THUNDER_DAY_SQL} > 0
                    THEN 1
                    ELSE 0
                  END
                ),
                0
              ) as thunder_days
       FROM daily_summary
       WHERE station_id = ?`
    )
    .get(config.stationId) as { thunder_days: number };

  return {
    ...summary,
    thunder_days: thunderDays.thunder_days,
    radius_km: LIGHTNING_CLIMATOLOGY_RADIUS_KM
  };
};
