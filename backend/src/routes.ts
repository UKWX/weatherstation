import { Router } from 'express';
import { DateTime } from 'luxon';
import { db } from './db/connection';
import { config } from './config';
import {
  getClimateCalendar,
  getThisDayInHistory,
  getTrend,
  rebuildAnomalies,
  rebuildRankings,
  rebuildRecords
} from './services/analyticsService';
import { fetchDataset, toCsv } from './services/exportService';
import {
  ingestPrecipitationHistory,
  ingestPrecipitationSpreadsheet,
  ingestRawObservations,
  ingestTemperatureHistory,
  ingestTemperatureSpreadsheet
} from './services/ingestionService';
import { fetchLatestWeatherObservation } from './services/weatherDataFetcher';
import {
  computeAnnualSummary,
  computeClimateNormals,
  computeDailySummary,
  computeMonthlySummary,
  rebuildDerivedFromRaw
} from './services/processingService';

export const routes = Router();

type DailySummaryRow = {
  max_temp: number | null;
  max_temp_time_local: string | null;
  min_temp: number | null;
  min_temp_time_local: string | null;
  mean_temp: number | null;
  temp_range: number | null;
  rainfall_total: number | null;
  rain_day: number | null;
  max_wind_speed: number | null;
  max_raw_gust: number | null;
  max_adjusted_gust: number | null;
  max_pressure: number | null;
  min_pressure: number | null;
  mean_pressure: number | null;
  max_humidity: number | null;
  min_humidity: number | null;
  mean_humidity: number | null;
};

routes.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: DateTime.utc().toISO() });
});

routes.get('/api/navigation', (_req, res) => {
  res.json({
    sections: [
      'Dashboard',
      'Live Conditions',
      'Archives: Daily Archive, Monthly Archive, Annual Archive',
      'Climate: Climate Averages, Records, Extremes, Rankings, Trends, Graphs & Analytics, Year Comparisons, Climate Calendar, This Day In History',
      'Lightning',
      'Snow Archive',
      'Reports',
      'Data Import',
      'Exports',
      'Settings'
    ]
  });
});

routes.post('/api/import/raw', (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const result = ingestRawObservations(rows, req.body?.sourceBatchId ?? 'api');
  res.json(result);
});

routes.post('/api/import/raw/wunderground', async (_req, res) => {
  try {
    const result = await fetchLatestWeatherObservation();
    res.json(result);
  } catch (error) {
    res.status(400).json({
      message: error instanceof Error ? error.message : 'Failed to fetch weather observations'
    });
  }
});

routes.post('/api/import/historical/temperature', (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const result = ingestTemperatureHistory(rows);
  res.json(result);
});

routes.post('/api/import/historical/temperature/spreadsheet', (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const result = ingestTemperatureSpreadsheet({
    rows,
    source: req.body?.source
  });
  res.json(result);
});

routes.post('/api/import/historical/precipitation', (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const result = ingestPrecipitationHistory(rows);
  res.json(result);
});

routes.post('/api/import/historical/precipitation/spreadsheet', (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const year = Number(req.body?.year);
  const result = ingestPrecipitationSpreadsheet({
    rows,
    year,
    source: req.body?.source
  });
  res.json(result);
});

routes.post('/api/process/daily', (req, res) => {
  const date =
    req.body?.date ?? DateTime.now().setZone(config.timezone).minus({ days: 1 }).toISODate();
  if (!date) {
    res.status(400).json({ message: 'date is required' });
    return;
  }

  computeDailySummary(date);
  const dt = DateTime.fromISO(date);
  computeMonthlySummary(dt.year, dt.month);
  computeAnnualSummary(dt.year);
  computeClimateNormals();
  rebuildRecords();
  rebuildAnomalies();
  rebuildRankings();

  res.json({ processedDate: date, status: 'ok' });
});

routes.post('/api/process/rebuild', (req, res) => {
  const startDate = req.body?.startDate;
  const endDate = req.body?.endDate;
  if (!startDate || !endDate) {
    res.status(400).json({ message: 'startDate and endDate are required' });
    return;
  }

  rebuildDerivedFromRaw(startDate, endDate);
  rebuildRecords();
  rebuildAnomalies();
  rebuildRankings();

  res.json({ status: 'ok', startDate, endDate });
});

routes.get('/api/dashboard/overview', (_req, res) => {
  const live = db
    .prepare(
      `SELECT temperature, humidity, pressure, wind_gust, rainfall, timestamp_local
       FROM raw_observations
       ORDER BY timestamp_utc DESC
       LIMIT 1`
    )
    .get();

  const sevenDayRain = db
    .prepare(
      `SELECT summary_date, rainfall_total
       FROM daily_summary
       ORDER BY summary_date DESC LIMIT 7`
    )
    .all();

  const monthly = db
    .prepare(
      `SELECT summary_year, summary_month, mean_temp, total_rainfall
       FROM monthly_summary
       ORDER BY summary_year DESC, summary_month DESC LIMIT 1`
    )
    .get();

  res.json({ live, sevenDayRain, monthly });
});

routes.get('/api/archive/daily', (req, res) => {
  const date = String(req.query.date ?? DateTime.now().setZone(config.timezone).toISODate());
  const row = db.prepare('SELECT * FROM daily_summary WHERE summary_date = ?').get(date) as
    | DailySummaryRow
    | undefined;
  const dayStart = DateTime.fromISO(date, { zone: config.timezone }).startOf('day');
  const dayEnd = dayStart.plus({ days: 1 });
  const dayStartUtc = dayStart.toUTC().toISO({ suppressMilliseconds: true });
  const dayEndUtc = dayEnd.toUTC().toISO({ suppressMilliseconds: true });
  const lightning = db
    .prepare(
      `SELECT count(*) as strike_count,
              max(intensity) as peak_intensity
       FROM lightning_events
       WHERE station_id = ?
         AND event_time_utc >= ?
         AND event_time_utc < ?`
    )
    .get(config.stationId, dayStartUtc, dayEndUtc);
  const graphs = db
    .prepare(
      `SELECT summary_date, mean_temp, rainfall_total, max_adjusted_gust, mean_pressure, mean_humidity
       FROM daily_summary
       WHERE summary_date <= ?
       ORDER BY summary_date DESC
       LIMIT 30`
    )
    .all(date);
  const climateComparison = db
    .prepare(
      `SELECT variable, observed_value, baseline_value, anomaly_value, anomaly_percent
       FROM anomalies
       WHERE period_type = 'daily' AND period_key = ?
       ORDER BY variable`
    )
    .all(date);

  res.json({
    date,
    row,
    page: {
      date,
      temperature: row
        ? {
            max: row.max_temp,
            maxTime: row.max_temp_time_local,
            min: row.min_temp,
            minTime: row.min_temp_time_local,
            mean: row.mean_temp,
            range: row.temp_range
          }
        : null,
      rainfall: row
        ? {
            total: row.rainfall_total,
            rainDay: Boolean(row.rain_day)
          }
        : null,
      wind: row
        ? {
            maxWindSpeed: row.max_wind_speed,
            maxRawGust: row.max_raw_gust,
            maxAdjustedGust: row.max_adjusted_gust
          }
        : null,
      pressure: row
        ? {
            max: row.max_pressure,
            min: row.min_pressure,
            mean: row.mean_pressure
          }
        : null,
      humidity: row
        ? {
            max: row.max_humidity,
            min: row.min_humidity,
            mean: row.mean_humidity
          }
        : null,
      lightning,
      graphs,
      climateComparison
    }
  });
});

routes.get('/api/archive/monthly', (req, res) => {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  const rows = db
    .prepare(
      `SELECT * FROM monthly_summary
       WHERE (? IS NULL OR summary_year = ?)
         AND (? IS NULL OR summary_month = ?)
       ORDER BY summary_year DESC, summary_month DESC`
    )
    .all(Number.isNaN(year) ? null : year, Number.isNaN(year) ? null : year, Number.isNaN(month) ? null : month, Number.isNaN(month) ? null : month);
  res.json(rows);
});

routes.get('/api/archive/annual', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM annual_summary ORDER BY summary_year DESC')
    .all();
  res.json(rows);
});

routes.get('/api/climate/averages', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT month, variable, value
       FROM climate_normals
       WHERE normal_type = 'monthly'
       ORDER BY month`
    )
    .all();
  res.json(rows);
});

routes.get('/api/climate/records', (_req, res) => {
  const rows = db.prepare('SELECT * FROM records ORDER BY variable, record_type').all();
  res.json(rows);
});

routes.get('/api/climate/extremes', (_req, res) => {
  const row = db
    .prepare(
      `SELECT
        max(max_temp) as highest_temp,
        min(min_temp) as lowest_temp,
        max(rainfall_total) as highest_rainfall,
        max(max_gust) as highest_gust
      FROM daily_summary`
    )
    .get();
  res.json(row);
});

routes.get('/api/climate/rankings', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM rankings ORDER BY ranking_scope, variable, rank_position ASC')
    .all();
  res.json(rows);
});

routes.get('/api/climate/trends', (_req, res) => {
  const trend = getTrend();
  const rows = db
    .prepare('SELECT summary_year, mean_temp, total_rainfall FROM annual_summary ORDER BY summary_year')
    .all();
  res.json({ trend, rows });
});

routes.get('/api/climate/graphs', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT summary_date, mean_temp, rainfall_total, max_gust
       FROM daily_summary
       ORDER BY summary_date DESC LIMIT 365`
    )
    .all();
  res.json(rows);
});

routes.get('/api/climate/year-comparisons', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT summary_year, mean_temp, total_rainfall, highest_temp, lowest_temp
       FROM annual_summary
       ORDER BY summary_year DESC`
    )
    .all();
  res.json(rows);
});

routes.get('/api/climate/calendar', (req, res) => {
  const year = Number(req.query.year ?? DateTime.now().year);
  const month = Number(req.query.month ?? DateTime.now().month);
  res.json(getClimateCalendar(year, month));
});

routes.get('/api/climate/this-day', (req, res) => {
  const now = DateTime.now();
  const month = Number(req.query.month ?? now.month);
  const day = Number(req.query.day ?? now.day);
  res.json(getThisDayInHistory(month, day));
});

routes.get('/api/lightning', (_req, res) => {
  const summary = db
    .prepare(
      `SELECT count(*) as strike_count,
              max(intensity) as peak_intensity,
              max(distance_km) as furthest_distance
       FROM lightning_events`
    )
    .get();
  res.json(summary);
});

routes.get('/api/snow', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT observed_date, snow_depth_cm, snowfall_cm, snow_days, notes
       FROM snow_archive ORDER BY observed_date DESC`
    )
    .all();
  res.json(rows);
});

routes.get('/api/reports/daily', (req, res) => {
  const date = String(req.query.date ?? DateTime.now().setZone(config.timezone).toISODate());
  const summary = db.prepare('SELECT * FROM daily_summary WHERE summary_date = ?').get(date);
  const anomalies = db
    .prepare(
      `SELECT variable, observed_value, baseline_value, anomaly_value
       FROM anomalies
       WHERE period_type = 'daily' AND period_key = ?`
    )
    .all(date);

  res.json({
    title: `Daily Climate Report - ${date}`,
    summary,
    anomalies,
    generatedAt: DateTime.utc().toISO()
  });
});

routes.get('/api/reports/monthly', (req, res) => {
  const year = Number(req.query.year ?? DateTime.now().year);
  const month = Number(req.query.month ?? DateTime.now().month);
  const summary = db
    .prepare('SELECT * FROM monthly_summary WHERE summary_year = ? AND summary_month = ?')
    .get(year, month);

  res.json({
    title: `Monthly Climate Report - ${year}-${String(month).padStart(2, '0')}`,
    summary,
    generatedAt: DateTime.utc().toISO()
  });
});

routes.get('/api/reports/annual', (req, res) => {
  const year = Number(req.query.year ?? DateTime.now().year);
  const summary = db.prepare('SELECT * FROM annual_summary WHERE summary_year = ?').get(year);

  res.json({
    title: `Annual Climate Report - ${year}`,
    summary,
    generatedAt: DateTime.utc().toISO()
  });
});

routes.get('/api/exports/:dataset', (req, res) => {
  const dataset = req.params.dataset;
  const format = String(req.query.format ?? 'json').toLowerCase();
  const rows = fetchDataset(dataset);

  if (format === 'csv') {
    res.header('content-type', 'text/csv; charset=utf-8');
    res.send(toCsv(rows));
    return;
  }

  res.json(rows);
});
