import { DateTime } from 'luxon';
import { db } from '../db/connection';
import { config } from '../config';
import { getLightningClimatologySummary, THUNDER_DAY_SQL } from './lightningClimatologyService';

const CALC_VERSION = 'v3';
const ADJUSTED_GUST_FACTOR = 1.4;

interface WindowBounds {
  startUtc: string;
  endUtc: string;
}

const toUtcIso = (value: DateTime): string =>
  value.toUTC().toISO({ suppressMilliseconds: true }) ?? value.toUTC().toISO() ?? '';

const buildUtcWindow = (summaryDate: string, startHour: number): WindowBounds => {
  const startLocal = DateTime.fromISO(summaryDate, { zone: config.timezone })
    .startOf('day')
    .set({ hour: startHour, minute: 0, second: 0, millisecond: 0 });
  if (!startLocal.isValid) {
    throw new Error(`Invalid summary date ${summaryDate}`);
  }

  const endLocal = startLocal.plus({ days: 1 });
  return {
    startUtc: toUtcIso(startLocal),
    endUtc: toUtcIso(endLocal)
  };
};

const startRun = (jobName: string, triggerType: string): number => {
  const run = db
    .prepare(
      `INSERT INTO processing_runs(job_name, trigger_type, status, started_at, calc_version)
       VALUES(?,?,?,?,?)`
    )
    .run(jobName, triggerType, 'running', DateTime.utc().toISO(), CALC_VERSION);
  return Number(run.lastInsertRowid);
};

const finishRun = (id: number, status: 'success' | 'failed', message: string): void => {
  db.prepare(
    `UPDATE processing_runs SET status = ?, completed_at = ?, message = ? WHERE id = ?`
  ).run(status, DateTime.utc().toISO(), message, id);
};

export const computeDailySummary = (summaryDate: string): void => {
  const runId = startRun('daily_summary', 'manual');
  try {
    const dailyWindow = buildUtcWindow(summaryDate, 0);
    const maxTempWindow = buildUtcWindow(summaryDate, 6);
    const minTempWindow = buildUtcWindow(summaryDate, 18);

    const dailyStats = db
      .prepare(
        `SELECT
          count(*) as observation_count,
          avg(temperature) as mean_temp,
          max(rainfall) as rainfall_total,
          max(rain_rate) as max_rain_rate,
          max(wind_speed) as max_wind_speed,
          max(wind_gust) as max_raw_gust,
          avg(wind_speed) as avg_wind_speed,
          max(pressure) as max_pressure,
          min(pressure) as min_pressure,
          avg(pressure) as mean_pressure,
          max(humidity) as max_humidity,
          min(humidity) as min_humidity,
          avg(humidity) as mean_humidity
         FROM raw_observations
         WHERE station_id = ?
           AND timestamp_utc >= ?
           AND timestamp_utc < ?`
      )
      .get(config.stationId, dailyWindow.startUtc, dailyWindow.endUtc) as {
      observation_count: number;
      mean_temp: number | null;
      rainfall_total: number | null;
      max_rain_rate: number | null;
      max_wind_speed: number | null;
      max_raw_gust: number | null;
      avg_wind_speed: number | null;
      max_pressure: number | null;
      min_pressure: number | null;
      mean_pressure: number | null;
      max_humidity: number | null;
      min_humidity: number | null;
      mean_humidity: number | null;
    };

    if (!dailyStats.observation_count) {
      finishRun(runId, 'success', `No observations found for ${summaryDate}`);
      return;
    }

    const maxTempObservation = db
      .prepare(
        `SELECT temperature as value, timestamp_local
         FROM raw_observations
         WHERE station_id = ?
           AND timestamp_utc >= ?
           AND timestamp_utc < ?
           AND temperature IS NOT NULL
         ORDER BY temperature DESC, timestamp_utc ASC
         LIMIT 1`
      )
      .get(config.stationId, maxTempWindow.startUtc, maxTempWindow.endUtc) as
      | { value: number; timestamp_local: string }
      | undefined;

    const minTempObservation = db
      .prepare(
        `SELECT temperature as value, timestamp_local
         FROM raw_observations
         WHERE station_id = ?
           AND timestamp_utc >= ?
           AND timestamp_utc < ?
           AND temperature IS NOT NULL
         ORDER BY temperature ASC, timestamp_utc ASC
         LIMIT 1`
      )
      .get(config.stationId, minTempWindow.startUtc, minTempWindow.endUtc) as
      | { value: number; timestamp_local: string }
      | undefined;

    const lightning = getLightningClimatologySummary(dailyWindow.startUtc, dailyWindow.endUtc);

    const maxTemp = maxTempObservation?.value ?? null;
    const minTemp = minTempObservation?.value ?? null;
    const tempRange = maxTemp !== null && minTemp !== null ? maxTemp - minTemp : null;
    const rainfallTotal = dailyStats.rainfall_total ?? null;
    const rainDay = rainfallTotal !== null && rainfallTotal > 0 ? 1 : 0;
    const maxRawGust = dailyStats.max_raw_gust ?? null;
    const maxAdjustedGust = maxRawGust !== null ? maxRawGust * ADJUSTED_GUST_FACTOR : null;
    // Keep legacy max_gust aligned with adjusted gust for existing monthly/annual/archive queries.
    const legacyMaxGust = maxAdjustedGust;
    const legacyLightningStrikes = lightning.lightning_count;

    db.prepare(
      `INSERT INTO daily_summary(
        station_id, summary_date,
        max_temp, max_temp_time_local,
        min_temp, min_temp_time_local,
        mean_temp, temp_range,
        rainfall_total, rain_day,
        max_rain_rate, max_wind_speed,
        max_raw_gust, max_adjusted_gust, max_gust,
        avg_wind_speed,
        max_pressure, min_pressure, mean_pressure,
        max_humidity, min_humidity, mean_humidity,
        lightning_strikes, lightning_count, thunder_day, observation_count,
        calc_version, generated_at
      ) VALUES(
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?,
        ?, ?, ?,
        ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, datetime('now')
      )
      ON CONFLICT(station_id, summary_date) DO UPDATE SET
        max_temp=excluded.max_temp,
        max_temp_time_local=excluded.max_temp_time_local,
        min_temp=excluded.min_temp,
        min_temp_time_local=excluded.min_temp_time_local,
        mean_temp=excluded.mean_temp,
        temp_range=excluded.temp_range,
        rainfall_total=excluded.rainfall_total,
        rain_day=excluded.rain_day,
        max_rain_rate=excluded.max_rain_rate,
        max_wind_speed=excluded.max_wind_speed,
        max_raw_gust=excluded.max_raw_gust,
        max_adjusted_gust=excluded.max_adjusted_gust,
        max_gust=excluded.max_gust,
        avg_wind_speed=excluded.avg_wind_speed,
        max_pressure=excluded.max_pressure,
        min_pressure=excluded.min_pressure,
        mean_pressure=excluded.mean_pressure,
        max_humidity=excluded.max_humidity,
        min_humidity=excluded.min_humidity,
        mean_humidity=excluded.mean_humidity,
        lightning_strikes=excluded.lightning_strikes,
        lightning_count=excluded.lightning_count,
        thunder_day=excluded.thunder_day,
        observation_count=excluded.observation_count,
        calc_version=excluded.calc_version,
        generated_at=excluded.generated_at`
    ).run(
      config.stationId,
      summaryDate,
      maxTemp,
      maxTempObservation?.timestamp_local ?? null,
      minTemp,
      minTempObservation?.timestamp_local ?? null,
      dailyStats.mean_temp ?? null,
      tempRange,
      rainfallTotal,
      rainDay,
      dailyStats.max_rain_rate ?? null,
      dailyStats.max_wind_speed ?? null,
      maxRawGust,
      maxAdjustedGust,
      legacyMaxGust,
      dailyStats.avg_wind_speed ?? null,
      dailyStats.max_pressure ?? null,
      dailyStats.min_pressure ?? null,
      dailyStats.mean_pressure ?? null,
      dailyStats.max_humidity ?? null,
      dailyStats.min_humidity ?? null,
      dailyStats.mean_humidity ?? null,
      legacyLightningStrikes,
      lightning.lightning_count,
      lightning.thunder_day,
      dailyStats.observation_count,
      CALC_VERSION
    );

    finishRun(runId, 'success', `Daily summary generated for ${summaryDate}`);
  } catch (error) {
    finishRun(
      runId,
      'failed',
      error instanceof Error ? error.message : 'Daily summary failed unexpectedly'
    );
    throw error;
  }
};

export const computeMonthlySummary = (year: number, month: number): void => {
  db.prepare(
    `INSERT INTO monthly_summary(
      station_id, summary_year, summary_month, mean_temp, total_rainfall, max_temp,
      min_temp, max_gust, total_lightning_days, observation_days, calc_version, generated_at
    )
    SELECT
      station_id,
      CAST(strftime('%Y', summary_date) AS INTEGER),
      CAST(strftime('%m', summary_date) AS INTEGER),
      avg(mean_temp),
      sum(COALESCE(rainfall_total,0)),
      max(max_temp),
      min(min_temp),
      max(max_gust),
      sum(CASE WHEN ${THUNDER_DAY_SQL} > 0 THEN 1 ELSE 0 END),
      count(*),
      ?,
      datetime('now')
    FROM daily_summary
    WHERE station_id = ?
      AND CAST(strftime('%Y', summary_date) AS INTEGER) = ?
      AND CAST(strftime('%m', summary_date) AS INTEGER) = ?
    GROUP BY station_id, strftime('%Y', summary_date), strftime('%m', summary_date)
    ON CONFLICT(station_id, summary_year, summary_month) DO UPDATE SET
      mean_temp=excluded.mean_temp,
      total_rainfall=excluded.total_rainfall,
      max_temp=excluded.max_temp,
      min_temp=excluded.min_temp,
      max_gust=excluded.max_gust,
      total_lightning_days=excluded.total_lightning_days,
      observation_days=excluded.observation_days,
      calc_version=excluded.calc_version,
      generated_at=excluded.generated_at`
  ).run(CALC_VERSION, config.stationId, year, month);
};

export const computeAnnualSummary = (year: number): void => {
  db.prepare(
    `INSERT INTO annual_summary(
      station_id, summary_year, mean_temp, total_rainfall, highest_temp,
      lowest_temp, max_gust, thunder_days, valid_days, calc_version, generated_at
    )
    SELECT
      station_id,
      CAST(strftime('%Y', summary_date) AS INTEGER),
      avg(mean_temp),
      sum(COALESCE(rainfall_total,0)),
      max(max_temp),
      min(min_temp),
      max(max_gust),
      sum(CASE WHEN ${THUNDER_DAY_SQL} > 0 THEN 1 ELSE 0 END),
      count(*),
      ?,
      datetime('now')
    FROM daily_summary
    WHERE station_id = ?
      AND CAST(strftime('%Y', summary_date) AS INTEGER) = ?
    GROUP BY station_id, strftime('%Y', summary_date)
    ON CONFLICT(station_id, summary_year) DO UPDATE SET
      mean_temp=excluded.mean_temp,
      total_rainfall=excluded.total_rainfall,
      highest_temp=excluded.highest_temp,
      lowest_temp=excluded.lowest_temp,
      max_gust=excluded.max_gust,
      thunder_days=excluded.thunder_days,
      valid_days=excluded.valid_days,
      calc_version=excluded.calc_version,
      generated_at=excluded.generated_at`
  ).run(CALC_VERSION, config.stationId, year);
};

export const computeClimateNormals = (): void => {
  db.prepare('DELETE FROM climate_normals WHERE station_id = ?').run(config.stationId);

  db.prepare(
    `INSERT INTO climate_normals(
      station_id, normal_type, month, day_of_month, variable, value,
      baseline_start_year, baseline_end_year, calc_version, generated_at
    )
    SELECT
      station_id,
      'monthly',
      summary_month,
      NULL,
      'mean_temp',
      avg(mean_temp),
      ?,
      ?,
      ?,
      datetime('now')
    FROM monthly_summary
    WHERE station_id = ?
      AND summary_year BETWEEN ? AND ?
    GROUP BY station_id, summary_month`
  ).run(
    config.climateBaselineStart,
    config.climateBaselineEnd,
    CALC_VERSION,
    config.stationId,
    config.climateBaselineStart,
    config.climateBaselineEnd
  );

  db.prepare(
    `INSERT INTO climate_normals(
      station_id, normal_type, month, day_of_month, variable, value,
      baseline_start_year, baseline_end_year, calc_version, generated_at
    )
    SELECT
      station_id,
      'daily',
      CAST(strftime('%m', summary_date) AS INTEGER),
      CAST(strftime('%d', summary_date) AS INTEGER),
      'mean_temp',
      avg(mean_temp),
      ?,
      ?,
      ?,
      datetime('now')
    FROM daily_summary
    WHERE station_id = ?
      AND CAST(strftime('%Y', summary_date) AS INTEGER) BETWEEN ? AND ?
    GROUP BY station_id, strftime('%m', summary_date), strftime('%d', summary_date)`
  ).run(
    config.climateBaselineStart,
    config.climateBaselineEnd,
    CALC_VERSION,
    config.stationId,
    config.climateBaselineStart,
    config.climateBaselineEnd
  );
};

export const rebuildDerivedFromRaw = (startDate: string, endDate: string): void => {
  const start = DateTime.fromISO(startDate, { zone: config.timezone });
  const end = DateTime.fromISO(endDate, { zone: config.timezone });
  if (!start.isValid || !end.isValid || start > end) {
    throw new Error('Invalid rebuild period');
  }

  let cursor = start;
  while (cursor <= end) {
    const day = cursor.toISODate();
    if (day) {
      computeDailySummary(day);
    }
    cursor = cursor.plus({ days: 1 });
  }

  const months = new Set<string>();
  const years = new Set<number>();
  cursor = start;
  while (cursor <= end) {
    months.add(cursor.toFormat('yyyy-MM'));
    years.add(cursor.year);
    cursor = cursor.plus({ days: 1 });
  }

  months.forEach((token) => {
    const [y, m] = token.split('-').map(Number);
    computeMonthlySummary(y, m);
  });

  years.forEach((year) => {
    computeAnnualSummary(year);
  });

  computeClimateNormals();
};
