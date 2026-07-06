import { db } from '../db/connection';
import { config } from '../config';
import {
  HistoricalPrecipitationInput,
  HistoricalTemperatureInput,
  RawObservationInput,
  ValidationIssue
} from '../types';
import {
  normalizeObservation,
  validatePrecipHistory,
  validateRanges,
  validateTemperatureHistory
} from './validation';

interface IngestionResult {
  imported: number;
  duplicates: number;
  rejected: number;
  issues: ValidationIssue[];
}

const writeAudit = (
  sourceType: string,
  result: IngestionResult,
  details: string,
  fileName?: string
): void => {
  db.prepare(
    `INSERT INTO import_audit(source_type, file_name, imported_rows, duplicate_rows, rejected_rows, details)
     VALUES(?, ?, ?, ?, ?, ?)`
  ).run(sourceType, fileName ?? null, result.imported, result.duplicates, result.rejected, details);
};

export const ingestRawObservations = (
  rows: RawObservationInput[],
  sourceBatchId = 'api'
): IngestionResult => {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO raw_observations(
      station_id,timestamp_utc,timestamp_local,temperature,humidity,dew_point,pressure,
      wind_speed,wind_direction,wind_gust,rainfall,rain_rate,solar_radiation,uv_index,quality_flag,source_batch_id
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );

  let imported = 0;
  let duplicates = 0;
  let rejected = 0;
  const issues: ValidationIssue[] = [];

  const txn = db.transaction((inputRows: RawObservationInput[]) => {
    inputRows.forEach((entry, idx) => {
      try {
        const normalized = normalizeObservation(entry);
        const rowIssues = validateRanges(normalized, idx + 1);
        if (rowIssues.length) {
          issues.push(...rowIssues);
          rejected += 1;
          return;
        }

        const info = insert.run(
          config.stationId,
          normalized.timestamp_utc,
          normalized.timestamp_local,
          normalized.temperature ?? null,
          normalized.humidity ?? null,
          normalized.dew_point ?? null,
          normalized.pressure ?? null,
          normalized.wind_speed ?? null,
          normalized.wind_direction ?? null,
          normalized.wind_gust ?? null,
          normalized.rainfall ?? null,
          normalized.rain_rate ?? null,
          normalized.solar_radiation ?? null,
          normalized.uv_index ?? null,
          normalized.quality_flag ?? null,
          sourceBatchId
        );

        if (info.changes === 1) {
          imported += 1;
        } else {
          duplicates += 1;
        }
      } catch (error) {
        rejected += 1;
        issues.push({
          row: idx + 1,
          field: 'row',
          message: error instanceof Error ? error.message : 'Unknown validation error'
        });
      }
    });
  });

  txn(rows);

  const result = { imported, duplicates, rejected, issues };
  writeAudit('raw_observations', result, JSON.stringify(issues).slice(0, 2000));
  return result;
};

export const ingestTemperatureHistory = (rows: HistoricalTemperatureInput[]): IngestionResult => {
  const insert = db.prepare(
    `INSERT INTO temperature_history(station_id, observed_date, tmin, tmax, tmean, source)
     VALUES(?,?,?,?,?,?)
     ON CONFLICT(station_id, observed_date) DO UPDATE SET
       tmin=excluded.tmin,
       tmax=excluded.tmax,
       tmean=excluded.tmean,
       source=excluded.source`
  );

  let imported = 0;
  let duplicates = 0;
  let rejected = 0;
  const issues: ValidationIssue[] = [];

  const txn = db.transaction((inputRows: HistoricalTemperatureInput[]) => {
    inputRows.forEach((row, idx) => {
      const rowIssues = validateTemperatureHistory(row, idx + 1);
      if (rowIssues.length) {
        rejected += 1;
        issues.push(...rowIssues);
        return;
      }

      const exists = db
        .prepare('SELECT 1 FROM temperature_history WHERE station_id = ? AND observed_date = ?')
        .get(config.stationId, row.observed_date);

      insert.run(
        config.stationId,
        row.observed_date,
        row.tmin ?? null,
        row.tmax ?? null,
        row.tmean ?? null,
        row.source ?? 'historical_import'
      );

      if (exists) {
        duplicates += 1;
      } else {
        imported += 1;
      }
    });
  });

  txn(rows);

  const result = { imported, duplicates, rejected, issues };
  writeAudit('temperature_history', result, JSON.stringify(issues).slice(0, 2000));
  return result;
};

export const ingestPrecipitationHistory = (
  rows: HistoricalPrecipitationInput[]
): IngestionResult => {
  const insert = db.prepare(
    `INSERT INTO precipitation_history(station_id, observed_date, rainfall_total, rain_days, source)
     VALUES(?,?,?,?,?)
     ON CONFLICT(station_id, observed_date) DO UPDATE SET
       rainfall_total=excluded.rainfall_total,
       rain_days=excluded.rain_days,
       source=excluded.source`
  );

  let imported = 0;
  let duplicates = 0;
  let rejected = 0;
  const issues: ValidationIssue[] = [];

  const txn = db.transaction((inputRows: HistoricalPrecipitationInput[]) => {
    inputRows.forEach((row, idx) => {
      const rowIssues = validatePrecipHistory(row, idx + 1);
      if (rowIssues.length) {
        rejected += 1;
        issues.push(...rowIssues);
        return;
      }

      const exists = db
        .prepare('SELECT 1 FROM precipitation_history WHERE station_id = ? AND observed_date = ?')
        .get(config.stationId, row.observed_date);

      insert.run(
        config.stationId,
        row.observed_date,
        row.rainfall_total ?? null,
        row.rain_days ?? null,
        row.source ?? 'historical_import'
      );

      if (exists) {
        duplicates += 1;
      } else {
        imported += 1;
      }
    });
  });

  txn(rows);

  const result = { imported, duplicates, rejected, issues };
  writeAudit('precipitation_history', result, JSON.stringify(issues).slice(0, 2000));
  return result;
};
