import { db } from '../db/connection';
import { config } from '../config';
import { LIGHTNING_COUNT_SQL, THUNDER_DAY_SQL } from './lightningClimatologyService';

const CALC_VERSION = 'v2';

export const rebuildRecords = (): void => {
  db.prepare('DELETE FROM records WHERE station_id = ?').run(config.stationId);

  db.prepare(
    `INSERT INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'daily', 'temperature', 'highest', max(max_temp),
       (SELECT summary_date FROM daily_summary WHERE station_id = ? ORDER BY max_temp DESC LIMIT 1),
       'daily_summary', ?
     FROM daily_summary WHERE station_id = ?`
  ).run(config.stationId, CALC_VERSION, config.stationId);

  db.prepare(
    `INSERT INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'daily', 'temperature', 'lowest', min(min_temp),
       (SELECT summary_date FROM daily_summary WHERE station_id = ? ORDER BY min_temp ASC LIMIT 1),
       'daily_summary', ?
     FROM daily_summary WHERE station_id = ?`
  ).run(config.stationId, CALC_VERSION, config.stationId);

  db.prepare(
    `INSERT INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'daily', 'rainfall', 'highest', max(rainfall_total),
       (SELECT summary_date FROM daily_summary WHERE station_id = ? ORDER BY rainfall_total DESC LIMIT 1),
       'daily_summary', ?
     FROM daily_summary WHERE station_id = ?`
  ).run(config.stationId, CALC_VERSION, config.stationId);

  db.prepare(
    `INSERT INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'daily', 'lightning_count', 'highest', max(${LIGHTNING_COUNT_SQL}),
       (SELECT summary_date FROM daily_summary WHERE station_id = ? ORDER BY ${LIGHTNING_COUNT_SQL} DESC, summary_date ASC LIMIT 1),
       'daily_summary', ?
     FROM daily_summary WHERE station_id = ?`
  ).run(config.stationId, CALC_VERSION, config.stationId);

  // Prefer the earliest occurrence when values tie so record dates stay deterministic across rebuilds.
  db.prepare(
    `INSERT INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'monthly', 'thunder_days', 'highest', max(total_lightning_days),
       (SELECT printf('%04d-%02d-01', summary_year, summary_month) FROM monthly_summary WHERE station_id = ? ORDER BY total_lightning_days DESC, summary_year ASC, summary_month ASC LIMIT 1),
       'monthly_summary', ?
     FROM monthly_summary WHERE station_id = ?`
  ).run(config.stationId, CALC_VERSION, config.stationId);

  db.prepare(
    `INSERT INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'annual', 'thunder_days', 'highest', max(thunder_days),
       (SELECT printf('%04d-01-01', summary_year) FROM annual_summary WHERE station_id = ? ORDER BY thunder_days DESC, summary_year ASC LIMIT 1),
       'annual_summary', ?
     FROM annual_summary WHERE station_id = ?`
  ).run(config.stationId, CALC_VERSION, config.stationId);
};

export const rebuildAnomalies = (): void => {
  db.prepare('DELETE FROM anomalies WHERE station_id = ?').run(config.stationId);

  db.prepare(
    `INSERT INTO anomalies(
      station_id, period_type, period_key, variable, observed_value,
      baseline_value, anomaly_value, anomaly_percent, calc_version
    )
    SELECT
      d.station_id,
      'daily',
      d.summary_date,
      'mean_temp',
      d.mean_temp,
      n.value,
      d.mean_temp - n.value,
      CASE WHEN n.value = 0 OR n.value IS NULL THEN NULL ELSE ((d.mean_temp - n.value) / n.value) * 100 END,
      ?
    FROM daily_summary d
    LEFT JOIN climate_normals n
      ON n.station_id = d.station_id
      AND n.normal_type = 'daily'
      AND n.variable = 'mean_temp'
      AND n.month = CAST(strftime('%m', d.summary_date) AS INTEGER)
      AND n.day_of_month = CAST(strftime('%d', d.summary_date) AS INTEGER)
      AND n.baseline_start_year = ?
      AND n.baseline_end_year = ?
    WHERE d.station_id = ?`
  ).run(CALC_VERSION, config.climateBaselineStart, config.climateBaselineEnd, config.stationId);
};

export const rebuildRankings = (): void => {
  db.prepare('DELETE FROM rankings WHERE station_id = ?').run(config.stationId);

  const annualTempRows = db
    .prepare(
      `SELECT summary_year as year, mean_temp as value
       FROM annual_summary
       WHERE station_id = ? AND mean_temp IS NOT NULL
       ORDER BY mean_temp DESC`
    )
    .all(config.stationId) as Array<{ year: number; value: number }>;

  annualTempRows.forEach((row, index) => {
    const percentile = annualTempRows.length
      ? ((annualTempRows.length - index) / annualTempRows.length) * 100
      : null;

    db.prepare(
      `INSERT INTO rankings(
        station_id, ranking_scope, variable, period_key, value, rank_position, percentile, calc_version
      ) VALUES(?,?,?,?,?,?,?,?)`
    ).run(
      config.stationId,
      'annual',
      'mean_temp',
      String(row.year),
      row.value,
      index + 1,
      percentile,
      CALC_VERSION
    );
  });
};

export const getTrend = (): { slope: number; intercept: number } => {
  const rows = db
    .prepare(
      `SELECT summary_year as year, mean_temp as value
       FROM annual_summary
       WHERE station_id = ? AND mean_temp IS NOT NULL
       ORDER BY summary_year ASC`
    )
    .all(config.stationId) as Array<{ year: number; value: number }>;

  if (rows.length < 2) {
    return { slope: 0, intercept: rows[0]?.value ?? 0 };
  }

  const n = rows.length;
  const sumX = rows.reduce((a, b) => a + b.year, 0);
  const sumY = rows.reduce((a, b) => a + b.value, 0);
  const sumXY = rows.reduce((a, b) => a + b.year * b.value, 0);
  const sumXX = rows.reduce((a, b) => a + b.year * b.year, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
};

export const getThisDayInHistory = (month: number, day: number) =>
  db
    .prepare(
      `SELECT summary_date, max_temp, min_temp, mean_temp, rainfall_total, max_gust,
             ${LIGHTNING_COUNT_SQL} as lightning_count,
             ${THUNDER_DAY_SQL} as thunder_day
       FROM daily_summary
       WHERE station_id = ?
         AND CAST(strftime('%m', summary_date) AS INTEGER) = ?
         AND CAST(strftime('%d', summary_date) AS INTEGER) = ?
       ORDER BY summary_date DESC`
    )
    .all(config.stationId, month, day);

export const getClimateCalendar = (year: number, month: number) =>
  db
    .prepare(
      `SELECT summary_date, max_temp, min_temp, rainfall_total, max_gust,
             ${LIGHTNING_COUNT_SQL} as lightning_count,
             ${THUNDER_DAY_SQL} as thunder_day
       FROM daily_summary
       WHERE station_id = ?
         AND CAST(strftime('%Y', summary_date) AS INTEGER) = ?
         AND CAST(strftime('%m', summary_date) AS INTEGER) = ?
       ORDER BY summary_date`
    )
    .all(config.stationId, year, month);
