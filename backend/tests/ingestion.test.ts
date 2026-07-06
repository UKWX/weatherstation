import { describe, expect, it } from 'vitest';
import { db } from '../src/db/connection';
import '../src/db/migrate';
import { ingestRawObservations } from '../src/services/ingestionService';
import { computeDailySummary } from '../src/services/processingService';

describe('ingestion and reproducibility', () => {
  it('prevents duplicate raw observations', () => {
    const timestamp = `2025-05-17T12:00:${String(Math.floor(Math.random() * 50) + 10).padStart(2, '0')}Z`;
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
});
