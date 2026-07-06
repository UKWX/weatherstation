import { DateTime } from 'luxon';
import { db } from '../db/connection';
import { config } from '../config';

const CALC_VERSION = 'v1';

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
    db.prepare(
      `INSERT INTO daily_summary(
        station_id, summary_date, max_temp, min_temp, mean_temp, rainfall_total, max_rain_rate,
        max_gust, avg_wind_speed, mean_pressure, mean_humidity, lightning_strikes, observation_count, calc_version, generated_at
      )
      SELECT
        station_id,
        date(timestamp_local),
        max(temperature),
        min(temperature),
        avg(temperature),
        sum(COALESCE(rainfall,0)),
        max(rain_rate),
        max(wind_gust),
        avg(wind_speed),
        avg(pressure),
        avg(humidity),
        0,
        count(*),
        ?,
        datetime('now')
      FROM raw_observations
      WHERE station_id = ?
        AND date(timestamp_local) = ?
      GROUP BY station_id, date(timestamp_local)
      ON CONFLICT(station_id, summary_date) DO UPDATE SET
        max_temp=excluded.max_temp,
        min_temp=excluded.min_temp,
        mean_temp=excluded.mean_temp,
        rainfall_total=excluded.rainfall_total,
        max_rain_rate=excluded.max_rain_rate,
        max_gust=excluded.max_gust,
        avg_wind_speed=excluded.avg_wind_speed,
        mean_pressure=excluded.mean_pressure,
        mean_humidity=excluded.mean_humidity,
        observation_count=excluded.observation_count,
        calc_version=excluded.calc_version,
        generated_at=excluded.generated_at`
    ).run(CALC_VERSION, config.stationId, summaryDate);

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
      sum(CASE WHEN lightning_strikes > 0 THEN 1 ELSE 0 END),
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
      sum(CASE WHEN lightning_strikes > 0 THEN 1 ELSE 0 END),
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
