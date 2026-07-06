import { db } from '../db/connection';
import { config } from '../config';
import { LIGHTNING_COUNT_SQL, THUNDER_DAY_SQL } from './lightningClimatologyService';

const CALC_VERSION = 'v2';

type RecordRow = {
  period_type: string;
  variable: string;
  record_type: string;
  record_value: number;
  record_date: string | null;
};

const isNewRecord = (
  recordType: string,
  newValue: number,
  previousValue: number
): boolean => {
  if (recordType === 'lowest') return newValue < previousValue;
  return newValue > previousValue;
};

export const rebuildRecords = (): void => {
  // Snapshot existing records before clearing so we can detect newly broken ones.
  const previousRecords = db
    .prepare('SELECT period_type, variable, record_type, record_value, record_date FROM records WHERE station_id = ?')
    .all(config.stationId) as RecordRow[];

  const previousMap = new Map<string, RecordRow>();
  for (const row of previousRecords) {
    previousMap.set(`${row.period_type}|${row.variable}|${row.record_type}`, row);
  }

  db.prepare('DELETE FROM records WHERE station_id = ?').run(config.stationId);

  // ── Temperature ──────────────────────────────────────────────────────────────

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
     SELECT station_id, 'daily', 'temperature', 'highest_minimum', max(min_temp),
       (SELECT summary_date FROM daily_summary WHERE station_id = ? ORDER BY min_temp DESC, summary_date ASC LIMIT 1),
       'daily_summary', ?
     FROM daily_summary WHERE station_id = ?`
  ).run(config.stationId, CALC_VERSION, config.stationId);

  db.prepare(
    `INSERT INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'daily', 'temperature', 'lowest_maximum', min(max_temp),
       (SELECT summary_date FROM daily_summary WHERE station_id = ? ORDER BY max_temp ASC, summary_date ASC LIMIT 1),
       'daily_summary', ?
     FROM daily_summary WHERE station_id = ?`
  ).run(config.stationId, CALC_VERSION, config.stationId);

  db.prepare(
    `INSERT INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'daily', 'temperature', 'largest_range', max(temp_range),
       (SELECT summary_date FROM daily_summary WHERE station_id = ? ORDER BY temp_range DESC, summary_date ASC LIMIT 1),
       'daily_summary', ?
     FROM daily_summary WHERE station_id = ? AND temp_range IS NOT NULL`
  ).run(config.stationId, CALC_VERSION, config.stationId);

  // ── Rainfall ─────────────────────────────────────────────────────────────────

  db.prepare(
    `INSERT INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'daily', 'rainfall', 'highest', max(rainfall_total),
       (SELECT summary_date FROM daily_summary WHERE station_id = ? ORDER BY rainfall_total DESC LIMIT 1),
       'daily_summary', ?
     FROM daily_summary WHERE station_id = ?`
  ).run(config.stationId, CALC_VERSION, config.stationId);

  // Prefer earliest month when values tie so record dates stay deterministic across rebuilds.
  db.prepare(
    `INSERT INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'monthly', 'rainfall', 'highest', max(total_rainfall),
       (SELECT printf('%04d-%02d-01', summary_year, summary_month) FROM monthly_summary WHERE station_id = ? ORDER BY total_rainfall DESC, summary_year ASC, summary_month ASC LIMIT 1),
       'monthly_summary', ?
     FROM monthly_summary WHERE station_id = ?`
  ).run(config.stationId, CALC_VERSION, config.stationId);

  db.prepare(
    `INSERT OR REPLACE INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'annual', 'rainfall', 'highest', max(total_rainfall),
       (SELECT printf('%04d-01-01', summary_year) FROM annual_summary WHERE station_id = ? ORDER BY total_rainfall DESC, summary_year ASC LIMIT 1),
       'annual_summary', ?
     FROM annual_summary WHERE station_id = ?`
  ).run(config.stationId, CALC_VERSION, config.stationId);

  // ── Wind ─────────────────────────────────────────────────────────────────────

  db.prepare(
    `INSERT INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'daily', 'wind_gust', 'highest', max(max_raw_gust),
       (SELECT summary_date FROM daily_summary WHERE station_id = ? ORDER BY max_raw_gust DESC, summary_date ASC LIMIT 1),
       'daily_summary', ?
     FROM daily_summary WHERE station_id = ? AND max_raw_gust IS NOT NULL`
  ).run(config.stationId, CALC_VERSION, config.stationId);

  db.prepare(
    `INSERT INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'daily', 'wind_adjusted_gust', 'highest', max(max_adjusted_gust),
       (SELECT summary_date FROM daily_summary WHERE station_id = ? ORDER BY max_adjusted_gust DESC, summary_date ASC LIMIT 1),
       'daily_summary', ?
     FROM daily_summary WHERE station_id = ? AND max_adjusted_gust IS NOT NULL`
  ).run(config.stationId, CALC_VERSION, config.stationId);

  // ── Pressure ─────────────────────────────────────────────────────────────────

  db.prepare(
    `INSERT INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'daily', 'pressure', 'highest', max(max_pressure),
       (SELECT summary_date FROM daily_summary WHERE station_id = ? ORDER BY max_pressure DESC, summary_date ASC LIMIT 1),
       'daily_summary', ?
     FROM daily_summary WHERE station_id = ? AND max_pressure IS NOT NULL`
  ).run(config.stationId, CALC_VERSION, config.stationId);

  db.prepare(
    `INSERT INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'daily', 'pressure', 'lowest', min(min_pressure),
       (SELECT summary_date FROM daily_summary WHERE station_id = ? ORDER BY min_pressure ASC, summary_date ASC LIMIT 1),
       'daily_summary', ?
     FROM daily_summary WHERE station_id = ? AND min_pressure IS NOT NULL`
  ).run(config.stationId, CALC_VERSION, config.stationId);

  // ── Lightning ─────────────────────────────────────────────────────────────────

  // Prefer the earliest occurrence when values tie so record dates stay deterministic across rebuilds.
  db.prepare(
    `INSERT INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'daily', 'lightning_count', 'highest', max(${LIGHTNING_COUNT_SQL}),
       (SELECT summary_date FROM daily_summary WHERE station_id = ? ORDER BY ${LIGHTNING_COUNT_SQL} DESC, summary_date ASC LIMIT 1),
       'daily_summary', ?
     FROM daily_summary WHERE station_id = ?`
  ).run(config.stationId, CALC_VERSION, config.stationId);

  db.prepare(
    `INSERT OR REPLACE INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'monthly', 'lightning_count', 'highest', max(total_lightning_count),
       (SELECT printf('%04d-%02d-01', summary_year, summary_month) FROM monthly_summary WHERE station_id = ? ORDER BY total_lightning_count DESC, summary_year ASC, summary_month ASC LIMIT 1),
       'monthly_summary', ?
     FROM monthly_summary WHERE station_id = ?`
  ).run(config.stationId, CALC_VERSION, config.stationId);

  db.prepare(
    `INSERT OR REPLACE INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     SELECT station_id, 'annual', 'lightning_count', 'highest', max(total_lightning_count),
       (SELECT printf('%04d-01-01', summary_year) FROM annual_summary WHERE station_id = ? ORDER BY total_lightning_count DESC, summary_year ASC LIMIT 1),
       'annual_summary', ?
     FROM annual_summary WHERE station_id = ?`
  ).run(config.stationId, CALC_VERSION, config.stationId);

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

  // ── Record-breaking detection ─────────────────────────────────────────────────

  const newRecords = db
    .prepare('SELECT period_type, variable, record_type, record_value, record_date FROM records WHERE station_id = ?')
    .all(config.stationId) as RecordRow[];

  for (const newRow of newRecords) {
    const key = `${newRow.period_type}|${newRow.variable}|${newRow.record_type}`;
    const prev = previousMap.get(key);
    if (prev && isNewRecord(newRow.record_type, newRow.record_value, prev.record_value)) {
      db.prepare(
        `INSERT OR IGNORE INTO record_history(
          station_id, period_type, variable, record_type,
          previous_value, new_value, record_date
        ) VALUES(?,?,?,?,?,?,?)`
      ).run(
        config.stationId,
        newRow.period_type,
        newRow.variable,
        newRow.record_type,
        prev.record_value,
        newRow.record_value,
        newRow.record_date
      );
    }
  }
};

export const rebuildAnomalies = (): void => {
  db.prepare('DELETE FROM anomalies WHERE station_id = ?').run(config.stationId);

  // Temperature anomaly — absolute difference
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

  // Rainfall anomaly — percentage difference from baseline average
  db.prepare(
    `INSERT INTO anomalies(
      station_id, period_type, period_key, variable, observed_value,
      baseline_value, anomaly_value, anomaly_percent, calc_version
    )
    SELECT
      d.station_id,
      'daily',
      d.summary_date,
      'rainfall',
      COALESCE(d.rainfall_total, 0),
      n.value,
      COALESCE(d.rainfall_total, 0) - COALESCE(n.value, 0),
      CASE WHEN COALESCE(n.value, 0) = 0 THEN NULL
           ELSE ((COALESCE(d.rainfall_total, 0) - n.value) / n.value) * 100
      END,
      ?
    FROM daily_summary d
    LEFT JOIN climate_normals n
      ON n.station_id = d.station_id
      AND n.normal_type = 'daily'
      AND n.variable = 'avg_rainfall'
      AND n.month = CAST(strftime('%m', d.summary_date) AS INTEGER)
      AND n.day_of_month = CAST(strftime('%d', d.summary_date) AS INTEGER)
      AND n.baseline_start_year = ?
      AND n.baseline_end_year = ?
    WHERE d.station_id = ?`
  ).run(CALC_VERSION, config.climateBaselineStart, config.climateBaselineEnd, config.stationId);

  // Lightning count anomaly — absolute difference from baseline average
  db.prepare(
    `INSERT INTO anomalies(
      station_id, period_type, period_key, variable, observed_value,
      baseline_value, anomaly_value, anomaly_percent, calc_version
    )
    SELECT
      d.station_id,
      'daily',
      d.summary_date,
      'lightning_count',
      COALESCE(${LIGHTNING_COUNT_SQL}, 0),
      n.value,
      COALESCE(${LIGHTNING_COUNT_SQL}, 0) - COALESCE(n.value, 0),
      NULL,
      ?
    FROM daily_summary d
    LEFT JOIN climate_normals n
      ON n.station_id = d.station_id
      AND n.normal_type = 'daily'
      AND n.variable = 'avg_lightning_count'
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

export const getRecordHistory = () =>
  db
    .prepare(
      `SELECT period_type, variable, record_type, previous_value, new_value, record_date, detected_at
       FROM record_history
       WHERE station_id = ?
       ORDER BY detected_at DESC, variable, record_type`
    )
    .all(config.stationId);

export const getDailyNormals = (month: number, day: number) =>
  db
    .prepare(
      `SELECT variable, value
       FROM climate_normals
       WHERE station_id = ?
         AND normal_type = 'daily'
         AND month = ?
         AND day_of_month = ?
         AND baseline_start_year = ?
         AND baseline_end_year = ?
       ORDER BY variable`
    )
    .all(config.stationId, month, day, config.climateBaselineStart, config.climateBaselineEnd);
