import { DateTime } from 'luxon';
import { db } from '../db/connection';
import { config } from '../config';
import {
  HistoricalPrecipitationInput,
  HistoricalTemperatureInput,
  ImportReport,
  RawObservationInput,
  SpreadsheetCell,
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
  missingData: number;
  issues: ValidationIssue[];
  report: ImportReport;
}

interface TemperatureSpreadsheetPayload {
  rows: SpreadsheetCell[][];
  source?: string;
}

interface PrecipitationSpreadsheetPayload {
  rows: SpreadsheetCell[][];
  year: number;
  source?: string;
}

interface ParsedTemperatureSpreadsheet {
  rows: HistoricalTemperatureInput[];
  issues: ValidationIssue[];
  missingData: number;
}

interface ParsedPrecipSpreadsheet {
  rows: HistoricalPrecipitationInput[];
  issues: ValidationIssue[];
  missingData: number;
}

const monthLookup: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};

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

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const asString = (value: SpreadsheetCell): string => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
};

const isCellEmpty = (value: SpreadsheetCell): boolean =>
  value === '' || value === null || value === undefined;

const formatIsoDate = (year: number, month: number, day: number): string | null => {
  const dt = DateTime.fromObject({ year, month, day }, { zone: config.timezone });
  if (!dt.isValid) {
    return null;
  }
  return dt.toISODate();
};

const formatDateForMessage = (year: number, month: number, day: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const createReport = (
  imported: number,
  duplicates: number,
  rejected: number,
  missingData: number,
  issues: ValidationIssue[],
  dates: string[]
): ImportReport => {
  const sortedDates = [...dates].sort((a, b) => a.localeCompare(b));
  return {
    recordsImported: imported,
    errors: rejected,
    missingData,
    duplicateDates: duplicates,
    dateRange: {
      start: sortedDates[0] ?? null,
      end: sortedDates[sortedDates.length - 1] ?? null
    }
  };
};

const parseDateCell = (value: SpreadsheetCell): { day: number; month: number } | null => {
  const text = asString(value);
  if (!text) {
    return null;
  }

  const parts = text.replace(/\s+/g, ' ').split(' ');
  if (parts.length < 2) {
    return null;
  }

  const day = Number(parts[0]);
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }

  const month = monthLookup[parts[1].toLowerCase()];
  if (!month) {
    return null;
  }

  return { day, month };
};

const parseTemperatureSpreadsheet = (
  payload: TemperatureSpreadsheetPayload
): ParsedTemperatureSpreadsheet => {
  const issues: ValidationIssue[] = [];
  const rows: HistoricalTemperatureInput[] = [];
  let missingData = 0;

  const sheetRows = payload.rows;
  if (!Array.isArray(sheetRows) || sheetRows.length < 2) {
    issues.push({ row: 1, field: 'rows', message: 'Spreadsheet has no usable rows' });
    return { rows, issues, missingData };
  }

  const header = sheetRows[0] ?? [];
  const yearColumns: Array<{ colIndex: number; year: number }> = [];
  for (let col = 1; col < header.length; col += 1) {
    const yearValue = Number(asString(header[col]));
    if (Number.isInteger(yearValue) && yearValue >= config.temperatureHistoryStartYear) {
      yearColumns.push({ colIndex: col, year: yearValue });
      continue;
    }
    if (asString(header[col])) {
      issues.push({
        row: 1,
        field: `column_${col + 1}`,
        message: `Invalid year header "${asString(header[col])}"`
      });
    }
  }

  if (!yearColumns.length) {
    issues.push({
      row: 1,
      field: 'year',
      message: `No valid year columns found (${config.temperatureHistoryStartYear} onwards)`
    });
    return { rows, issues, missingData };
  }

  const seenDates = new Set<string>();

  for (let rowIndex = 1; rowIndex < sheetRows.length; rowIndex += 1) {
    const rawRow = sheetRows[rowIndex];
    if (!Array.isArray(rawRow) || rawRow.length < 2) {
      issues.push({ row: rowIndex + 1, field: 'row', message: 'Broken row' });
      continue;
    }

    const dayMonth = parseDateCell(rawRow[0]);
    if (!dayMonth) {
      issues.push({
        row: rowIndex + 1,
        field: 'date',
        message: `Invalid date label "${asString(rawRow[0])}"`
      });
      continue;
    }

    yearColumns.forEach(({ colIndex, year }) => {
      const isoDate = formatIsoDate(year, dayMonth.month, dayMonth.day);
      if (!isoDate) {
        issues.push({
          row: rowIndex + 1,
          field: `year_${year}`,
          message: `Invalid date ${formatDateForMessage(year, dayMonth.month, dayMonth.day)}`
        });
        return;
      }

      const cell = rawRow[colIndex];
      if (isCellEmpty(cell)) {
        missingData += 1;
        issues.push({
          row: rowIndex + 1,
          field: `year_${year}`,
          message: `Missing value for ${isoDate}`
        });
        return;
      }

      const temperature = toNumberOrNull(cell);
      if (temperature === null) {
        issues.push({
          row: rowIndex + 1,
          field: `year_${year}`,
          message: `Invalid value "${asString(cell)}" for ${isoDate}`
        });
        return;
      }

      if (seenDates.has(isoDate)) {
        issues.push({
          row: rowIndex + 1,
          field: 'observed_date',
          message: `Duplicate date in import payload: ${isoDate}`
        });
        return;
      }

      seenDates.add(isoDate);
      rows.push({
        observed_date: isoDate,
        tmean: temperature,
        source: payload.source ?? 'historical_temperature_spreadsheet'
      });
    });
  }

  return { rows, issues, missingData };
};

const parsePrecipitationSpreadsheet = (
  payload: PrecipitationSpreadsheetPayload
): ParsedPrecipSpreadsheet => {
  const issues: ValidationIssue[] = [];
  const rows: HistoricalPrecipitationInput[] = [];
  let missingData = 0;

  if (!Number.isInteger(payload.year) || payload.year < config.rainfallHistoryStartYear) {
    issues.push({
      row: 1,
      field: 'year',
      message: `Rainfall year must be ${config.rainfallHistoryStartYear} or later`
    });
    return { rows, issues, missingData };
  }

  const sheetRows = payload.rows;
  if (!Array.isArray(sheetRows) || sheetRows.length < 2) {
    issues.push({ row: 1, field: 'rows', message: 'Spreadsheet has no usable rows' });
    return { rows, issues, missingData };
  }

  const header = sheetRows[0] ?? [];
  const monthColumns: Array<{ colIndex: number; month: number }> = [];
  for (let col = 1; col < header.length; col += 1) {
    const monthName = asString(header[col]).toLowerCase();
    const month = monthLookup[monthName];
    if (month) {
      monthColumns.push({ colIndex: col, month });
      continue;
    }
    if (monthName) {
      issues.push({
        row: 1,
        field: `column_${col + 1}`,
        message: `Invalid month header "${asString(header[col])}"`
      });
    }
  }

  if (!monthColumns.length) {
    issues.push({ row: 1, field: 'month', message: 'No valid month columns found' });
    return { rows, issues, missingData };
  }

  const seenDates = new Set<string>();

  for (let rowIndex = 1; rowIndex < sheetRows.length; rowIndex += 1) {
    const rawRow = sheetRows[rowIndex];
    if (!Array.isArray(rawRow) || rawRow.length < 2) {
      issues.push({ row: rowIndex + 1, field: 'row', message: 'Broken row' });
      continue;
    }

    const day = Number(asString(rawRow[0]));
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      issues.push({
        row: rowIndex + 1,
        field: 'day',
        message: `Invalid day "${asString(rawRow[0])}"`
      });
      continue;
    }

    monthColumns.forEach(({ colIndex, month }) => {
      const isoDate = formatIsoDate(payload.year, month, day);
      if (!isoDate) {
        issues.push({
          row: rowIndex + 1,
          field: `month_${month}`,
          message: `Invalid date ${formatDateForMessage(payload.year, month, day)}`
        });
        return;
      }

      const cell = rawRow[colIndex];
      if (isCellEmpty(cell)) {
        missingData += 1;
        issues.push({
          row: rowIndex + 1,
          field: `month_${month}`,
          message: `Missing value for ${isoDate}`
        });
        return;
      }

      const rainfall = toNumberOrNull(cell);
      if (rainfall === null) {
        issues.push({
          row: rowIndex + 1,
          field: `month_${month}`,
          message: `Invalid value "${asString(cell)}" for ${isoDate}`
        });
        return;
      }

      if (seenDates.has(isoDate)) {
        issues.push({
          row: rowIndex + 1,
          field: 'observed_date',
          message: `Duplicate date in import payload: ${isoDate}`
        });
        return;
      }

      seenDates.add(isoDate);
      rows.push({
        observed_date: isoDate,
        rainfall_total: rainfall,
        source: payload.source ?? 'historical_rainfall_spreadsheet'
      });
    });
  }

  return { rows, issues, missingData };
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
  const dates: string[] = [];

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

        const observationDate = DateTime.fromISO(normalized.timestamp_utc, { zone: 'utc' }).toISODate();
        if (observationDate) {
          dates.push(observationDate);
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

  const report = createReport(imported, duplicates, rejected, 0, issues, dates);
  const result = { imported, duplicates, rejected, missingData: 0, issues, report };
  writeAudit('raw_observations', result, JSON.stringify({ issues, report }).slice(0, 2000));
  return result;
};

export const ingestTemperatureHistory = (
  rows: HistoricalTemperatureInput[],
  options?: { missingData?: number; additionalIssues?: ValidationIssue[] }
): IngestionResult => {
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
  const issues: ValidationIssue[] = [...(options?.additionalIssues ?? [])];
  const missingData = options?.missingData ?? 0;
  const dates: string[] = [];

  const txn = db.transaction((inputRows: HistoricalTemperatureInput[]) => {
    inputRows.forEach((row, idx) => {
      const rowIssues = validateTemperatureHistory(row, idx + 1);
      if (rowIssues.length) {
        rejected += 1;
        issues.push(...rowIssues);
        return;
      }

      dates.push(row.observed_date);

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

  const report = createReport(imported, duplicates, rejected, missingData, issues, dates);
  const result = { imported, duplicates, rejected, missingData, issues, report };
  writeAudit('temperature_history', result, JSON.stringify({ issues, report }).slice(0, 2000));
  return result;
};

export const ingestPrecipitationHistory = (
  rows: HistoricalPrecipitationInput[],
  options?: { missingData?: number; additionalIssues?: ValidationIssue[] }
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
  const issues: ValidationIssue[] = [...(options?.additionalIssues ?? [])];
  const missingData = options?.missingData ?? 0;
  const dates: string[] = [];

  const txn = db.transaction((inputRows: HistoricalPrecipitationInput[]) => {
    inputRows.forEach((row, idx) => {
      const rowIssues = validatePrecipHistory(row, idx + 1);
      if (rowIssues.length) {
        rejected += 1;
        issues.push(...rowIssues);
        return;
      }

      dates.push(row.observed_date);

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

  const report = createReport(imported, duplicates, rejected, missingData, issues, dates);
  const result = { imported, duplicates, rejected, missingData, issues, report };
  writeAudit('precipitation_history', result, JSON.stringify({ issues, report }).slice(0, 2000));
  return result;
};

export const ingestTemperatureSpreadsheet = (payload: TemperatureSpreadsheetPayload): IngestionResult => {
  const parsed = parseTemperatureSpreadsheet(payload);
  return ingestTemperatureHistory(parsed.rows, {
    missingData: parsed.missingData,
    additionalIssues: parsed.issues
  });
};

export const ingestPrecipitationSpreadsheet = (
  payload: PrecipitationSpreadsheetPayload
): IngestionResult => {
  const parsed = parsePrecipitationSpreadsheet(payload);
  return ingestPrecipitationHistory(parsed.rows, {
    missingData: parsed.missingData,
    additionalIssues: parsed.issues
  });
};
