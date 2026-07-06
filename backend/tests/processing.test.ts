import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { db } from '../src/db/connection';
import '../src/db/migrate';
import { config } from '../src/config';
import { ingestRawObservations } from '../src/services/ingestionService';
import { computeDailySummary } from '../src/services/processingService';

describe('timezone handling', () => {
  it('represents DST boundaries without invalid local date', () => {
    const before = DateTime.fromISO('2025-03-30T00:30:00Z').setZone('Europe/London');
    const after = DateTime.fromISO('2025-03-30T01:30:00Z').setZone('Europe/London');

    expect(before.isValid).toBe(true);
    expect(after.isValid).toBe(true);
    expect(before.toISODate()).toEqual(after.toISODate());
  });

  it('computes daily climate metrics with UK local windows', () => {
    const day = '2026-03-29';
    const observationRows = [
      {
        timestamp_utc: '2026-03-29T00:10:00Z',
        temperature: 10,
        rainfall: 0,
        wind_speed: 5,
        wind_gust: 8,
        pressure: 1000,
        humidity: 80
      },
      {
        timestamp_utc: '2026-03-29T11:00:00Z',
        temperature: 15,
        rainfall: 1.2,
        wind_speed: 9,
        wind_gust: 11,
        pressure: 1005,
        humidity: 70
      },
      {
        timestamp_utc: '2026-03-29T22:50:00Z',
        temperature: 12,
        rainfall: 1.8,
        wind_speed: 7,
        wind_gust: 10,
        pressure: 998,
        humidity: 60
      },
      { timestamp_utc: '2026-03-30T04:50:00Z', temperature: 21 },
      { timestamp_utc: '2026-03-30T16:30:00Z', temperature: 3 },
      { timestamp_utc: '2026-03-30T05:10:00Z', temperature: 25 },
      { timestamp_utc: '2026-03-30T17:10:00Z', temperature: 1 }
    ];

    db.prepare('DELETE FROM daily_summary WHERE station_id = ? AND summary_date = ?').run(config.stationId, day);
    db.prepare('DELETE FROM raw_observations WHERE station_id = ? AND timestamp_utc BETWEEN ? AND ?').run(
      config.stationId,
      '2026-03-29T00:00:00Z',
      '2026-03-30T23:59:59Z'
    );
    db.prepare('DELETE FROM lightning_events WHERE station_id = ? AND event_time_utc BETWEEN ? AND ?').run(
      config.stationId,
      '2026-03-29T00:00:00Z',
      '2026-03-30T23:59:59Z'
    );

    ingestRawObservations(observationRows, 'daily-window-test');

    db.prepare(
      `INSERT OR IGNORE INTO lightning_events(station_id, event_time_utc, event_time_local, distance_km, bearing_deg, intensity)
       VALUES(?,?,?,?,?,?)`
    ).run(
      config.stationId,
      '2026-03-29T10:00:00Z',
      DateTime.fromISO('2026-03-29T10:00:00Z', { zone: 'utc' }).setZone(config.timezone).toISO(),
      2.5,
      180,
      5
    );
    db.prepare(
      `INSERT OR IGNORE INTO lightning_events(station_id, event_time_utc, event_time_local, distance_km, bearing_deg, intensity)
       VALUES(?,?,?,?,?,?)`
    ).run(
      config.stationId,
      '2026-03-30T10:00:00Z',
      DateTime.fromISO('2026-03-30T10:00:00Z', { zone: 'utc' }).setZone(config.timezone).toISO(),
      3.1,
      190,
      6
    );

    computeDailySummary(day);

    const summary = db
      .prepare(
        `SELECT
          max_temp,
          max_temp_time_local,
          min_temp,
          min_temp_time_local,
          mean_temp,
          temp_range,
          rainfall_total,
          rain_day,
          max_wind_speed,
          max_raw_gust,
          max_adjusted_gust,
          max_pressure,
          min_pressure,
          mean_pressure,
          max_humidity,
          min_humidity,
          mean_humidity,
          lightning_strikes,
          observation_count
         FROM daily_summary
         WHERE station_id = ? AND summary_date = ?`
      )
      .get(config.stationId, day) as {
      max_temp: number;
      max_temp_time_local: string;
      min_temp: number;
      min_temp_time_local: string;
      mean_temp: number;
      temp_range: number;
      rainfall_total: number;
      rain_day: number;
      max_wind_speed: number;
      max_raw_gust: number;
      max_adjusted_gust: number;
      max_pressure: number;
      min_pressure: number;
      mean_pressure: number;
      max_humidity: number;
      min_humidity: number;
      mean_humidity: number;
      lightning_strikes: number;
      observation_count: number;
    };

    expect(summary.max_temp).toBe(21);
    expect(summary.max_temp_time_local).toContain('2026-03-30T05:50:00+01:00');
    expect(summary.min_temp).toBe(3);
    expect(summary.min_temp_time_local).toContain('2026-03-30T17:30:00+01:00');
    expect(summary.mean_temp).toBeCloseTo((10 + 15 + 12) / 3, 6);
    expect(summary.temp_range).toBe(18);
    expect(summary.rainfall_total).toBe(1.8);
    expect(summary.rain_day).toBe(1);
    expect(summary.max_wind_speed).toBe(9);
    expect(summary.max_raw_gust).toBe(11);
    expect(summary.max_adjusted_gust).toBeCloseTo(15.4, 6);
    expect(summary.max_pressure).toBe(1005);
    expect(summary.min_pressure).toBe(998);
    expect(summary.mean_pressure).toBeCloseTo((1000 + 1005 + 998) / 3, 6);
    expect(summary.max_humidity).toBe(80);
    expect(summary.min_humidity).toBe(60);
    expect(summary.mean_humidity).toBeCloseTo((80 + 70 + 60) / 3, 6);
    expect(summary.lightning_strikes).toBe(1);
    expect(summary.observation_count).toBe(3);
  });
});
