import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { DateTime } from 'luxon';
import { app } from '../src/app';
import { db } from '../src/db/connection';
import '../src/db/migrate';
import { config } from '../src/config';
import { ingestPrecipitationHistory, ingestTemperatureHistory } from '../src/services/ingestionService';

const baseYear = DateTime.now().year + 4;
const years = [baseYear, baseYear + 1];

const day = (year: number, month: number, date: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;

beforeAll(() => {
  for (const year of years) {
    db.prepare('DELETE FROM temperature_history WHERE station_id = ? AND observed_date LIKE ?').run(config.stationId, `${year}-%`);
    db.prepare('DELETE FROM precipitation_history WHERE station_id = ? AND observed_date LIKE ?').run(config.stationId, `${year}-%`);
    db.prepare('DELETE FROM climate_monthly_observations WHERE station_id = ? AND summary_year = ?').run(config.stationId, year);
  }

  ingestTemperatureHistory([
    { observed_date: day(years[0], 7, 18), tmax: 30.4, tmin: 16.2, source: 'test-seed' },
    { observed_date: day(years[0], 7, 19), tmax: 35.2, tmin: 21.1, source: 'test-seed' },
    { observed_date: day(years[0], 12, 14), tmax: -1.2, tmin: -6.8, source: 'test-seed' },
    { observed_date: day(years[1], 7, 16), tmax: 33.8, tmin: 20.5, source: 'test-seed' },
    { observed_date: day(years[1], 1, 10), tmax: 2.1, tmin: -4.7, source: 'test-seed' }
  ]);

  ingestPrecipitationHistory([
    { observed_date: day(years[0], 7, 18), rainfall_total: 0, source: 'test-seed' },
    { observed_date: day(years[0], 7, 19), rainfall_total: 18.4, source: 'test-seed' },
    { observed_date: day(years[0], 12, 14), rainfall_total: 5.2, source: 'test-seed' },
    { observed_date: day(years[1], 7, 16), rainfall_total: 44.8, source: 'test-seed' },
    { observed_date: day(years[1], 1, 10), rainfall_total: 0.2, source: 'test-seed' }
  ]);

  db.prepare(
    `INSERT OR REPLACE INTO climate_monthly_observations(
      station_id, summary_year, summary_month, highest_pressure, lowest_pressure,
      highest_wind_gust, lightning_count, thunder_days
    ) VALUES(?,?,?,?,?,?,?,?)`
  ).run(config.stationId, years[0], 7, 1032.4, 995.1, 49.2, 12, 4);

  db.prepare(
    `INSERT OR REPLACE INTO climate_monthly_observations(
      station_id, summary_year, summary_month, highest_pressure, lowest_pressure,
      highest_wind_gust, lightning_count, thunder_days
    ) VALUES(?,?,?,?,?,?,?,?)`
  ).run(config.stationId, years[1], 7, 1028.8, 988.2, 53.6, 18, 6);
});

afterAll(() => {
  for (const year of years) {
    db.prepare('DELETE FROM temperature_history WHERE station_id = ? AND observed_date LIKE ?').run(config.stationId, `${year}-%`);
    db.prepare('DELETE FROM precipitation_history WHERE station_id = ? AND observed_date LIKE ?').run(config.stationId, `${year}-%`);
    db.prepare('DELETE FROM climate_monthly_observations WHERE station_id = ? AND summary_year = ?').run(config.stationId, year);
  }
});

describe('climate platform overview', () => {
  it('returns derived temperature and rainfall extremes from historical source tables', async () => {
    const response = await request(app).get('/api/climate-platform/overview');
    expect(response.status).toBe(200);
    expect(response.body.temperature.dailyExtremes.highestDailyMaximum.value).toBe(35.2);
    expect(response.body.temperature.dailyExtremes.highestDailyMaximum.date).toBe(day(years[0], 7, 19));
    expect(response.body.rainfall.extremes.wettestDay.value).toBe(44.8);
    expect(response.body.monthlySummary.extremes.highestLightningCount.value).toBe(18);
    expect(response.body.rankings.warmestYears[0].year).toBe(years[0]);
  });

  it('accepts manual monthly summary entry through the climatology endpoint', async () => {
    const response = await request(app)
      .post('/api/climate-platform/monthly-summary')
      .send({
        year: years[1],
        month: 8,
        highestPressure: 1024.5,
        lowestPressure: 991.4,
        highestWindGust: 46.2,
        lightningCount: 9,
        thunderDays: 3
      });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);

    const stored = db
      .prepare(
        `SELECT lightning_count, thunder_days
         FROM climate_monthly_observations
         WHERE station_id = ? AND summary_year = ? AND summary_month = ?`
      )
      .get(config.stationId, years[1], 8) as { lightning_count: number; thunder_days: number };

    expect(stored.lightning_count).toBe(9);
    expect(stored.thunder_days).toBe(3);
  });
});
