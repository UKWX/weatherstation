import { describe, expect, it } from 'vitest';
import { db } from '../src/db/connection';
import '../src/db/migrate';
import {
  ingestPrecipitationSpreadsheet,
  ingestRawObservations,
  ingestTemperatureSpreadsheet
} from '../src/services/ingestionService';
import { computeDailySummary } from '../src/services/processingService';

describe('ingestion and reproducibility', () => {
  it('prevents duplicate raw observations', () => {
    const now = Date.now();
    const minute = String(Math.floor((now / 60000) % 60)).padStart(2, '0');
    const second = String(Math.floor((now / 1000) % 60)).padStart(2, '0');
    const timestamp = `2037-05-17T12:${minute}:${second}Z`;
    const rows = [
      {
        timestamp_utc: timestamp,
        temperature: 14,
        humidity: 78,
        pressure: 1016
      },
      {
        timestamp_utc: timestamp,
        temperature: 14,
        humidity: 78,
        pressure: 1016
      }
    ];

    const result = ingestRawObservations(rows, 'test-batch');

    expect(result.imported).toBe(1);
    expect(result.duplicates).toBe(1);
  });

  it('rebuilds daily summary deterministically from raw data', () => {
    const day = `2025-06-${String(Math.floor(Math.random() * 20) + 10).padStart(2, '0')}`;
    db.prepare('DELETE FROM daily_summary WHERE summary_date = ?').run(day);

    ingestRawObservations(
      [
        { timestamp_utc: `${day}T00:00:00Z`, temperature: 8, rainfall: 0 },
        { timestamp_utc: `${day}T12:00:00Z`, temperature: 16, rainfall: 0.5 },
        { timestamp_utc: `${day}T18:00:00Z`, temperature: 12, rainfall: 1.2 }
      ],
      'deterministic-batch'
    );

    computeDailySummary(day);
    const first = db
      .prepare('SELECT max_temp, min_temp, mean_temp, rainfall_total FROM daily_summary WHERE summary_date = ?')
      .get(day);

    computeDailySummary(day);
    const second = db
      .prepare('SELECT max_temp, min_temp, mean_temp, rainfall_total FROM daily_summary WHERE summary_date = ?')
      .get(day);

    expect(second).toEqual(first);
  });

  it('imports historical temperatures from spreadsheet matrix format', () => {
    const baseYear = 2032;
    db.prepare('DELETE FROM temperature_history WHERE observed_date BETWEEN ? AND ?').run(
      `${baseYear}-01-01`,
      `${baseYear + 1}-12-31`
    );

    const result = ingestTemperatureSpreadsheet({
      rows: [
        ['', baseYear, baseYear + 1],
        ['01 Jan', 5.1, 4.3],
        ['31 Feb', 7.2, 8.1],
        ['02 Jan', '', 3.8]
      ],
      source: 'unit-test'
    });

    expect(result.imported).toBe(3);
    expect(result.report.missingData).toBe(1);
    expect(
      result.issues.some(
        (issue) => issue.message.includes('Invalid date') && issue.message.includes('-02-31')
      )
    ).toBe(true);
    const impossibleDateRows = db
      .prepare('SELECT count(*) as count FROM temperature_history WHERE observed_date IN (?, ?)')
      .get(`${baseYear}-02-31`, `${baseYear + 1}-02-31`) as { count: number };
    expect(impossibleDateRows.count).toBe(0);
  });

  it('imports rainfall spreadsheets and rejects impossible dates', () => {
    const uniqueYear = 2024;
    db.prepare('DELETE FROM precipitation_history WHERE observed_date BETWEEN ? AND ?').run(
      `${uniqueYear}-01-01`,
      `${uniqueYear}-12-31`
    );

    const result = ingestPrecipitationSpreadsheet({
      rows: [
        ['', 'Jan', 'Feb'],
        [30, 1.1, 0.2],
        [31, 2.4, 0.5]
      ],
      year: uniqueYear,
      source: 'unit-test'
    });

    expect(result.imported).toBe(2);
    expect(result.issues.some((issue) => issue.message.includes('Invalid date'))).toBe(true);
    expect(result.report.dateRange.start).toContain(`${uniqueYear}-01`);
  });
});
