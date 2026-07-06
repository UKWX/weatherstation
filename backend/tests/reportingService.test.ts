import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from '../src/config';
import { db } from '../src/db/connection';
import '../src/db/migrate';
import { getAnnualClimateReport, getMonthlyClimateReport } from '../src/services/reportingService';

const TEST_YEAR = 2099;
const TEST_MONTH = 1;
const DATE_A = `${TEST_YEAR}-01-10`;
const DATE_B = `${TEST_YEAR}-01-11`;

beforeAll(() => {
  db.prepare('DELETE FROM anomalies WHERE station_id = ? AND period_type = ? AND period_key LIKE ?').run(
    config.stationId,
    'daily',
    `${TEST_YEAR}-%`
  );
  db.prepare('DELETE FROM records WHERE station_id = ? AND record_date LIKE ?').run(
    config.stationId,
    `${TEST_YEAR}-%`
  );
  db.prepare('DELETE FROM rankings WHERE station_id = ? AND ranking_scope = ? AND period_key = ?').run(
    config.stationId,
    'annual',
    String(TEST_YEAR)
  );
  db.prepare('DELETE FROM daily_summary WHERE station_id = ? AND summary_date LIKE ?').run(
    config.stationId,
    `${TEST_YEAR}-%`
  );
  db.prepare('DELETE FROM monthly_summary WHERE station_id = ? AND summary_year = ?').run(
    config.stationId,
    TEST_YEAR
  );
  db.prepare('DELETE FROM annual_summary WHERE station_id = ? AND summary_year = ?').run(
    config.stationId,
    TEST_YEAR
  );

  db.prepare(
    `INSERT INTO daily_summary(
      station_id, summary_date, mean_temp, max_temp, min_temp, rainfall_total,
      max_adjusted_gust, max_pressure, min_pressure, mean_pressure,
      observation_count, calc_version
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(config.stationId, DATE_A, 5, 8, 2, 10, 21, 1018, 1002, 1010, 24, 'report-test');

  db.prepare(
    `INSERT INTO daily_summary(
      station_id, summary_date, mean_temp, max_temp, min_temp, rainfall_total,
      max_adjusted_gust, max_pressure, min_pressure, mean_pressure,
      observation_count, calc_version
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(config.stationId, DATE_B, 7, 11, 3, 15, 27, 1021, 1000, 1012, 24, 'report-test');

  db.prepare(
    `INSERT INTO monthly_summary(
      station_id, summary_year, summary_month, mean_temp, total_rainfall,
      max_temp, min_temp, max_gust, total_lightning_days, observation_days, calc_version
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?)`
  ).run(config.stationId, TEST_YEAR, TEST_MONTH, 6, 25, 11, 2, 27, 1, 2, 'report-test');

  db.prepare(
    `INSERT INTO annual_summary(
      station_id, summary_year, mean_temp, total_rainfall,
      highest_temp, lowest_temp, max_gust, thunder_days, valid_days, calc_version
    ) VALUES(?,?,?,?,?,?,?,?,?,?)`
  ).run(config.stationId, TEST_YEAR, 6, 25, 11, 2, 27, 1, 2, 'report-test');

  db.prepare(
    `INSERT INTO rankings(station_id, ranking_scope, variable, period_key, value, rank_position, percentile, calc_version)
     VALUES(?,?,?,?,?,?,?,?)`
  ).run(config.stationId, 'annual', 'mean_temp', String(TEST_YEAR), 6, 1, 100, 'report-test');

  db.prepare(
    `INSERT OR REPLACE INTO records(station_id, period_type, variable, record_type, record_value, record_date, source_summary, calc_version)
     VALUES(?,?,?,?,?,?,?,?)`
  ).run(config.stationId, 'annual', 'rainfall', 'highest', 25, `${TEST_YEAR}-01-01`, 'annual_summary', 'report-test');

  db.prepare(
    `INSERT INTO anomalies(
      station_id, period_type, period_key, variable,
      observed_value, baseline_value, anomaly_value, anomaly_percent, calc_version
    ) VALUES(?,?,?,?,?,?,?,?,?)`
  ).run(config.stationId, 'daily', DATE_A, 'mean_temp', 5, 4, 1, 25, 'report-test');
});

afterAll(() => {
  db.prepare('DELETE FROM anomalies WHERE station_id = ? AND period_type = ? AND period_key LIKE ?').run(
    config.stationId,
    'daily',
    `${TEST_YEAR}-%`
  );
  db.prepare('DELETE FROM records WHERE station_id = ? AND record_date LIKE ?').run(
    config.stationId,
    `${TEST_YEAR}-%`
  );
  db.prepare('DELETE FROM rankings WHERE station_id = ? AND ranking_scope = ? AND period_key = ?').run(
    config.stationId,
    'annual',
    String(TEST_YEAR)
  );
  db.prepare('DELETE FROM daily_summary WHERE station_id = ? AND summary_date LIKE ?').run(
    config.stationId,
    `${TEST_YEAR}-%`
  );
  db.prepare('DELETE FROM monthly_summary WHERE station_id = ? AND summary_year = ?').run(
    config.stationId,
    TEST_YEAR
  );
  db.prepare('DELETE FROM annual_summary WHERE station_id = ? AND summary_year = ?').run(
    config.stationId,
    TEST_YEAR
  );
});

describe('reporting service', () => {
  it('returns a monthly report with expected sections and graph data', () => {
    const report = getMonthlyClimateReport(TEST_YEAR, TEST_MONTH);
    expect(report).not.toBeNull();
    expect(report?.period.label).toContain('2099');
    expect(report?.monthlyOverview.total_rainfall).toBe(25);
    expect(report?.graphs.dailySeries).toHaveLength(2);
    expect(report?.temperatureSummary.warmestDay?.max_temp).toBe(11);
    expect(report?.qualityChecks.noDuplicateProcessing).toBe(true);
  });

  it('returns an annual report with rankings and trend analysis', () => {
    const report = getAnnualClimateReport(TEST_YEAR);
    expect(report).not.toBeNull();
    expect(report?.annualStatistics.total_rainfall).toBe(25);
    expect(report?.rankings.length).toBeGreaterThan(0);
    expect(typeof report?.trendAnalysis.linearTemperatureTrendPerYear).toBe('number');
    expect(report?.graphs.monthlyBreakdown).toHaveLength(1);
  });

  it('returns null for missing periods', () => {
    expect(getMonthlyClimateReport(1900, 1)).toBeNull();
    expect(getAnnualClimateReport(1900)).toBeNull();
  });
});
