import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { db } from '../src/db/connection';
import '../src/db/migrate';
import { config } from '../src/config';
import { ingestRawObservations } from '../src/services/ingestionService';
import { rebuildRecords } from '../src/services/analyticsService';
import {
  computeAnnualSummary,
  computeDailySummary,
  computeMonthlySummary
} from '../src/services/processingService';

describe('timezone handling', () => {
  it('represents DST boundaries without invalid local date', () => {
    const before = DateTime.fromISO('2025-03-30T00:30:00Z').setZone('Europe/London');
    const after = DateTime.fromISO('2025-03-30T01:30:00Z').setZone('Europe/London');

    expect(before.isValid).toBe(true);
    expect(after.isValid).toBe(true);
    expect(before.toISODate()).toEqual(after.toISODate());
  });

  it('computes daily climate metrics with UK local windows', () => {
    const day =
      Array.from({ length: 31 }, (_, index) => index + 1)
        .map((dayOfMonth) =>
          DateTime.fromObject({ year: 2038, month: 3, day: dayOfMonth, hour: 0 }, { zone: config.timezone })
        )
        .find((candidate) => candidate.isValid && candidate.offset !== candidate.plus({ days: 1 }).offset)
        ?.toISODate() ?? '2038-03-28';

    const localDay = DateTime.fromISO(day, { zone: config.timezone }).startOf('day');
    const utcIso = (dayOffset: number, hour: number, minute: number): string =>
      localDay
        .plus({ days: dayOffset })
        .set({ hour, minute, second: 0, millisecond: 0 })
        .toUTC()
        .toISO({ suppressMilliseconds: true }) ?? '';

    const observationRows = [
      {
        timestamp_utc: utcIso(0, 0, 10),
        temperature: 10,
        rainfall: 0,
        wind_speed: 5,
        wind_gust: 8,
        pressure: 1000,
        humidity: 80
      },
      {
        timestamp_utc: utcIso(0, 12, 0),
        temperature: 15,
        rainfall: 1.2,
        wind_speed: 9,
        wind_gust: 11,
        pressure: 1005,
        humidity: 70
      },
      {
        timestamp_utc: utcIso(0, 23, 50),
        temperature: 12,
        rainfall: 1.8,
        wind_speed: 7,
        wind_gust: 10,
        pressure: 998,
        humidity: 60
      },
      {
        timestamp_utc: utcIso(1, 5, 50),
        temperature: 21,
        rainfall: null,
        wind_speed: null,
        wind_gust: null,
        pressure: null,
        humidity: null
      },
      {
        timestamp_utc: utcIso(1, 17, 30),
        temperature: 3,
        rainfall: null,
        wind_speed: null,
        wind_gust: null,
        pressure: null,
        humidity: null
      },
      {
        timestamp_utc: utcIso(1, 6, 10),
        temperature: 25,
        rainfall: null,
        wind_speed: null,
        wind_gust: null,
        pressure: null,
        humidity: null
      },
      {
        timestamp_utc: utcIso(1, 18, 10),
        temperature: 1,
        rainfall: null,
        wind_speed: null,
        wind_gust: null,
        pressure: null,
        humidity: null
      }
    ];

    db.prepare('DELETE FROM daily_summary WHERE station_id = ? AND summary_date = ?').run(config.stationId, day);

    ingestRawObservations(observationRows, 'daily-window-test');

    db.prepare(
      `INSERT OR IGNORE INTO lightning_events(station_id, event_time_utc, event_time_local, distance_km, bearing_deg, intensity)
       VALUES(?,?,?,?,?,?)`
    ).run(
      config.stationId,
      utcIso(0, 11, 0),
      DateTime.fromISO(utcIso(0, 11, 0), { zone: 'utc' }).setZone(config.timezone).toISO(),
      2.5,
      180,
      5
    );
    db.prepare(
      `INSERT OR IGNORE INTO lightning_events(station_id, event_time_utc, event_time_local, distance_km, bearing_deg, intensity)
       VALUES(?,?,?,?,?,?)`
    ).run(
      config.stationId,
      utcIso(1, 11, 0),
      DateTime.fromISO(utcIso(1, 11, 0), { zone: 'utc' }).setZone(config.timezone).toISO(),
      3.1,
      190,
      6
    );
    db.prepare(
      `INSERT OR IGNORE INTO lightning_events(station_id, event_time_utc, event_time_local, distance_km, bearing_deg, intensity)
       VALUES(?,?,?,?,?,?)`
    ).run(
      config.stationId,
      utcIso(0, 14, 0),
      DateTime.fromISO(utcIso(0, 14, 0), { zone: 'utc' }).setZone(config.timezone).toISO(),
      28,
      210,
      9
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
          lightning_count,
          thunder_day,
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
      lightning_count: number;
      thunder_day: number;
      observation_count: number;
    };

    expect(summary.max_temp).toBe(21);
    expect(summary.max_temp_time_local).toContain(
      localDay.plus({ days: 1 }).toFormat("yyyy-MM-dd'T'05:50")
    );
    expect(summary.min_temp).toBe(3);
    expect(summary.min_temp_time_local).toContain(
      localDay.plus({ days: 1 }).toFormat("yyyy-MM-dd'T'17:30")
    );
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
    expect(summary.lightning_count).toBe(1);
    expect(summary.thunder_day).toBe(1);
    expect(summary.observation_count).toBe(3);
  });

  it('exposes lightning climatology in archive, summaries, records, and graph APIs', async () => {
    const day = '2039-05-12';

    db.prepare('DELETE FROM daily_summary WHERE station_id = ? AND summary_date = ?').run(config.stationId, day);
    db.prepare('DELETE FROM monthly_summary WHERE station_id = ? AND summary_year = ? AND summary_month = ?').run(
      config.stationId,
      2039,
      5
    );
    db.prepare('DELETE FROM annual_summary WHERE station_id = ? AND summary_year = ?').run(
      config.stationId,
      2039
    );
    db.prepare('DELETE FROM records WHERE station_id = ? AND variable IN (?, ?)').run(
      config.stationId,
      'lightning_count',
      'thunder_days'
    );
    db.prepare('DELETE FROM lightning_events WHERE station_id = ? AND event_time_utc >= ? AND event_time_utc < ?').run(
      config.stationId,
      `${day}T00:00:00Z`,
      '2039-05-13T00:00:00Z'
    );

    ingestRawObservations(
      [
        { timestamp_utc: `${day}T00:10:00Z`, temperature: 9, rainfall: 0, wind_gust: 5 },
        { timestamp_utc: `${day}T12:10:00Z`, temperature: 17, rainfall: 2.1, wind_gust: 12 }
      ],
      'lightning-climatology-api-test'
    );

    db.prepare(
      `INSERT OR IGNORE INTO lightning_events(station_id, event_time_utc, event_time_local, distance_km, bearing_deg, intensity)
       VALUES(?,?,?,?,?,?)`
    ).run(config.stationId, `${day}T10:00:00Z`, `${day}T11:00:00+01:00`, 8, 135, 4);
    db.prepare(
      `INSERT OR IGNORE INTO lightning_events(station_id, event_time_utc, event_time_local, distance_km, bearing_deg, intensity)
       VALUES(?,?,?,?,?,?)`
    ).run(config.stationId, `${day}T18:00:00Z`, `${day}T19:00:00+01:00`, 24, 150, 7);

    computeDailySummary(day);
    computeMonthlySummary(2039, 5);
    computeAnnualSummary(2039);
    rebuildRecords();

    const dailyArchive = await request(app).get('/api/archive/daily').query({ date: day });
    expect(dailyArchive.status).toBe(200);
    expect(dailyArchive.body.row.lightning_count).toBe(1);
    expect(dailyArchive.body.row.thunder_day).toBe(1);
    expect(dailyArchive.body.page.lightning.lightning_count).toBe(1);
    expect(dailyArchive.body.page.lightning.thunder_day).toBe(1);
    expect(dailyArchive.body.page.lightning.radius_km).toBe(20);

    const monthlyArchive = await request(app).get('/api/archive/monthly').query({ year: 2039, month: 5 });
    expect(monthlyArchive.status).toBe(200);
    expect(monthlyArchive.body[0].total_lightning_days).toBe(1);

    const annualArchive = await request(app).get('/api/archive/annual');
    expect(annualArchive.status).toBe(200);
    const annual2039 = annualArchive.body.find((row: { summary_year: number }) => row.summary_year === 2039);
    expect(annual2039.thunder_days).toBe(1);

    const records = await request(app).get('/api/climate/records');
    expect(records.status).toBe(200);
    expect(
      records.body.some(
        (row: { period_type: string; variable: string; record_type: string; record_value: number }) =>
          row.period_type === 'daily' &&
          row.variable === 'lightning_count' &&
          row.record_type === 'highest' &&
          row.record_value === 1
      )
    ).toBe(true);

    const graphs = await request(app).get('/api/climate/graphs');
    expect(graphs.status).toBe(200);
    const graphRow = graphs.body.find((row: { summary_date: string }) => row.summary_date === day);
    expect(graphRow.lightning_count).toBe(1);
    expect(graphRow.thunder_day).toBe(1);
  });
});
