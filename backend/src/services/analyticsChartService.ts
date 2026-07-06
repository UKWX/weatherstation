import { DateTime } from 'luxon';
import { db } from '../db/connection';
import { config } from '../config';
import { LIGHTNING_COUNT_SQL } from './lightningClimatologyService';

type LinearTrendResult = { slope: number; intercept: number };

type AnnualRow = {
  year: number;
  mean_temp: number | null;
  total_rainfall: number | null;
  max_gust: number | null;
  thunder_days: number | null;
  total_lightning_count: number | null;
  mean_pressure: number | null;
};

const TREND_VARIABLES = [
  'mean_temp',
  'total_rainfall',
  'max_gust',
  'thunder_days',
  'total_lightning_count',
  'mean_pressure',
] as const;

type TrendVariable = (typeof TREND_VARIABLES)[number];

function computeLinearTrend(points: Array<{ x: number; y: number }>): LinearTrendResult {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0 };
  const sumX = points.reduce((a, p) => a + p.x, 0);
  const sumY = points.reduce((a, p) => a + p.y, 0);
  const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
  const sumXX = points.reduce((a, p) => a + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export const getYearComparisonData = () => {
  const monthly = db
    .prepare(
      `SELECT
        m.summary_year  AS year,
        m.summary_month AS month,
        m.mean_temp,
        m.total_rainfall,
        m.max_gust,
        COALESCE(m.total_lightning_count, 0) AS total_lightning_count,
        p.mean_pressure
      FROM monthly_summary m
      LEFT JOIN (
        SELECT
          CAST(strftime('%Y', summary_date) AS INTEGER) AS yr,
          CAST(strftime('%m', summary_date) AS INTEGER) AS mo,
          avg(mean_pressure) AS mean_pressure
        FROM daily_summary
        WHERE station_id = ?
        GROUP BY yr, mo
      ) p ON p.yr = m.summary_year AND p.mo = m.summary_month
      WHERE m.station_id = ?
      ORDER BY m.summary_year, m.summary_month`
    )
    .all(config.stationId, config.stationId);

  const monthlyAverages = db
    .prepare(
      `SELECT
        m.summary_month AS month,
        avg(m.mean_temp)                           AS avg_temp,
        avg(m.total_rainfall)                      AS avg_rainfall,
        avg(m.max_gust)                            AS avg_gust,
        avg(COALESCE(m.total_lightning_count, 0))  AS avg_lightning,
        avg(p.mean_pressure)                       AS avg_pressure
      FROM monthly_summary m
      LEFT JOIN (
        SELECT
          CAST(strftime('%Y', summary_date) AS INTEGER) AS yr,
          CAST(strftime('%m', summary_date) AS INTEGER) AS mo,
          avg(mean_pressure) AS mean_pressure
        FROM daily_summary
        WHERE station_id = ?
        GROUP BY yr, mo
      ) p ON p.yr = m.summary_year AND p.mo = m.summary_month
      WHERE m.station_id = ?
      GROUP BY m.summary_month
      ORDER BY month`
    )
    .all(config.stationId, config.stationId);

  return {
    monthly,
    monthlyAverages,
    currentYear: DateTime.now().year,
  };
};

export const getYearToDateData = () => {
  const currentYear = DateTime.now().year;
  const currentMonth = DateTime.now().month;

  const monthly = db
    .prepare(
      `SELECT
        summary_year  AS year,
        summary_month AS month,
        mean_temp,
        total_rainfall,
        COALESCE(total_lightning_count, 0) AS total_lightning_count
      FROM monthly_summary
      WHERE station_id = ?
        AND (
          summary_year < ?
          OR (summary_year = ? AND summary_month <= ?)
        )
      ORDER BY summary_year, summary_month`
    )
    .all(config.stationId, currentYear, currentYear, currentMonth);

  return { monthly, currentYear, currentMonth };
};

export const getTrendsData = () => {
  const annual = db
    .prepare(
      `SELECT
        a.summary_year AS year,
        a.mean_temp,
        a.total_rainfall,
        a.max_gust,
        a.thunder_days,
        COALESCE(a.total_lightning_count, 0) AS total_lightning_count,
        p.mean_pressure
      FROM annual_summary a
      LEFT JOIN (
        SELECT
          CAST(strftime('%Y', summary_date) AS INTEGER) AS yr,
          avg(mean_pressure) AS mean_pressure
        FROM daily_summary
        WHERE station_id = ?
        GROUP BY yr
      ) p ON p.yr = a.summary_year
      WHERE a.station_id = ?
      ORDER BY a.summary_year`
    )
    .all(config.stationId, config.stationId) as AnnualRow[];

  const currentYear = DateTime.now().year;
  const tenYearsAgo = currentYear - 10;

  const linearTrends: Partial<Record<TrendVariable, LinearTrendResult>> = {};
  const tenYearTrends: Partial<Record<TrendVariable, LinearTrendResult>> = {};

  for (const variable of TREND_VARIABLES) {
    const allPoints = annual
      .filter((r) => r[variable] !== null)
      .map((r) => ({ x: r.year, y: r[variable] as number }));

    if (allPoints.length >= 2) {
      linearTrends[variable] = computeLinearTrend(allPoints);
    }

    const recentPoints = allPoints.filter((p) => p.x >= tenYearsAgo);
    if (recentPoints.length >= 2) {
      tenYearTrends[variable] = computeLinearTrend(recentPoints);
    }
  }

  // 5-year rolling average
  const rollingAvg = annual.map((row, idx) => {
    const windowRows = annual.slice(Math.max(0, idx - 4), idx + 1);
    const result: Record<string, number | null> = { year: row.year };
    for (const variable of TREND_VARIABLES) {
      const validValues = windowRows
        .map((r) => r[variable])
        .filter((v): v is number => v !== null);
      result[variable] =
        validValues.length > 0
          ? validValues.reduce((a, b) => a + b, 0) / validValues.length
          : null;
    }
    return result;
  });

  return { annual, linearTrends, tenYearTrends, rollingAvg };
};

export const getExtremesData = (limit: number) => {
  const warmestDays = db
    .prepare(
      `SELECT summary_date AS date, max_temp, min_temp, mean_temp
       FROM daily_summary
       WHERE station_id = ? AND max_temp IS NOT NULL
       ORDER BY max_temp DESC, summary_date ASC
       LIMIT ?`
    )
    .all(config.stationId, limit);

  const coldestDays = db
    .prepare(
      `SELECT summary_date AS date, max_temp, min_temp, mean_temp
       FROM daily_summary
       WHERE station_id = ? AND min_temp IS NOT NULL
       ORDER BY min_temp ASC, summary_date ASC
       LIMIT ?`
    )
    .all(config.stationId, limit);

  const wettestDays = db
    .prepare(
      `SELECT summary_date AS date, rainfall_total
       FROM daily_summary
       WHERE station_id = ? AND rainfall_total > 0
       ORDER BY rainfall_total DESC, summary_date ASC
       LIMIT ?`
    )
    .all(config.stationId, limit);

  const highestGusts = db
    .prepare(
      `SELECT summary_date AS date, max_adjusted_gust, max_raw_gust
       FROM daily_summary
       WHERE station_id = ? AND max_adjusted_gust IS NOT NULL
       ORDER BY max_adjusted_gust DESC, summary_date ASC
       LIMIT ?`
    )
    .all(config.stationId, limit);

  const highestPressure = db
    .prepare(
      `SELECT summary_date AS date, max_pressure, min_pressure, mean_pressure
       FROM daily_summary
       WHERE station_id = ? AND max_pressure IS NOT NULL
       ORDER BY max_pressure DESC, summary_date ASC
       LIMIT ?`
    )
    .all(config.stationId, limit);

  const lowestPressure = db
    .prepare(
      `SELECT summary_date AS date, max_pressure, min_pressure, mean_pressure
       FROM daily_summary
       WHERE station_id = ? AND min_pressure IS NOT NULL
       ORDER BY min_pressure ASC, summary_date ASC
       LIMIT ?`
    )
    .all(config.stationId, limit);

  const highestLightning = db
    .prepare(
      `SELECT summary_date AS date, ${LIGHTNING_COUNT_SQL} AS lightning_count
       FROM daily_summary
       WHERE station_id = ? AND (${LIGHTNING_COUNT_SQL}) > 0
       ORDER BY ${LIGHTNING_COUNT_SQL} DESC, summary_date ASC
       LIMIT ?`
    )
    .all(config.stationId, limit);

  return {
    warmestDays,
    coldestDays,
    wettestDays,
    highestGusts,
    highestPressure,
    lowestPressure,
    highestLightning,
  };
};
