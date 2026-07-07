import { Router } from 'express';
import { DateTime } from 'luxon';
import { db } from './db/connection';
import { config } from './config';
import {
  getClimateCalendar,
  getDailyNormals,
  getRecordHistory,
  getThisDayInHistory,
  getTrend,
  rebuildAnomalies,
  rebuildRankings,
  rebuildRecords
} from './services/analyticsService';
import { fetchDataset, toCsv, toExcelXml, toPdf } from './services/exportService';
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
import {
  getLightningClimatologyOverview,
  getLightningClimatologySummary,
  LIGHTNING_COUNT_SQL,
  LIGHTNING_CLIMATOLOGY_RADIUS_KM,
  THUNDER_DAY_SQL
} from './services/lightningClimatologyService';
import {
  getYearComparisonData,
  getYearToDateData,
  getTrendsData,
  getExtremesData
} from './services/analyticsChartService';
import { getAnnualClimateReport, getMonthlyClimateReport } from './services/reportingService';

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
  lightning_strikes: number | null;
  lightning_count: number | null;
  thunder_day: number | null;
};

routes.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: DateTime.utc().toISO() });
});

routes.get('/api/status', (_req, res) => {
  // Database status
  let dbStatus: 'connected' | 'error' = 'error';
  let recordCount = 0;
  let latest: { timestamp_utc: string; timestamp_local: string; ingested_at: string } | undefined;

  try {
    recordCount = (
      db.prepare('SELECT COUNT(*) as count FROM raw_observations').get() as { count: number }
    ).count;
    latest = db
      .prepare(
        `SELECT timestamp_utc, timestamp_local, ingested_at
         FROM raw_observations
         ORDER BY timestamp_utc DESC
         LIMIT 1`
      )
      .get() as { timestamp_utc: string; timestamp_local: string; ingested_at: string } | undefined;
    dbStatus = 'connected';
  } catch (error) {
    console.error('Status endpoint DB error:', error instanceof Error ? error.message : error);
  }

  const apiConfigured = Boolean(config.weatherApiKey && config.weatherStationId);
  const lastSuccessfulFetch = latest?.ingested_at ?? null;
  const latestObservationTime = latest?.timestamp_local ?? latest?.timestamp_utc ?? null;

  const minutesSinceLatest =
    latest != null
      ? DateTime.utc().diff(DateTime.fromISO(latest.timestamp_utc, { zone: 'utc' }), 'minutes').minutes
      : null;
  const stationStatus =
    dbStatus === 'error'
      ? 'Error'
      : recordCount === 0
        ? 'Waiting for data'
        : minutesSinceLatest !== null && minutesSinceLatest < 30
          ? 'Online'
          : 'Offline';

  res.json({
    backend: {
      status: 'ok'
    },
    database: {
      status: dbStatus,
      observationCount: recordCount
    },
    weatherApi: {
      status: apiConfigured ? 'configured' : 'unconfigured',
      stationId: config.weatherStationId || null,
      lastFetch: lastSuccessfulFetch
    },
    station: {
      id: config.weatherStationId || config.stationId || 'Unknown',
      name: config.stationId || 'Wakefield Station',
      status: stationStatus,
      lastSuccessfulFetch,
      latestObservationTime: latestObservationTime ?? (recordCount === 0 ? 'Waiting for data' : null),
      recordCount,
      apiConfigured
    }
  });
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

routes.get('/api/dashboard/charts', (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days ?? 30), 7), 365);
  try {
    const rows = db
      .prepare(
        `SELECT summary_date,
                max_temp, min_temp, mean_temp,
                rainfall_total,
                max_adjusted_gust, max_wind_speed,
                mean_pressure, max_pressure, min_pressure,
                mean_humidity,
                ${LIGHTNING_COUNT_SQL} as lightning_count,
                ${THUNDER_DAY_SQL} as thunder_day
         FROM daily_summary
         ORDER BY summary_date DESC
         LIMIT ?`
      )
      .all(days);
    res.json({ rows: rows.reverse() });
  } catch (error) {
    console.error('Dashboard charts error:', error instanceof Error ? error.message : error);
    res.status(500).json({ message: 'Failed to retrieve chart data' });
  }
});

routes.get('/api/dashboard/overview', (_req, res) => {
  const live = db
    .prepare(
      `SELECT temperature, feels_like, humidity, pressure, wind_speed, wind_gust, wind_direction,
              rainfall, solar_radiation, uv_index, timestamp_local
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
  if (!dayStart.isValid || !dayEnd.isValid) {
    res.status(400).json({ message: 'Invalid date' });
    return;
  }
  const dayStartUtc = dayStart.toUTC().toISO({ suppressMilliseconds: true })!;
  const dayEndUtc = dayEnd.toUTC().toISO({ suppressMilliseconds: true })!;
  const lightning = getLightningClimatologySummary(dayStartUtc, dayEndUtc);
  const archiveRow = row
    ? {
       ...row,
       // Keep the legacy field aligned with climatology-filtered counts for existing archive consumers.
       lightning_strikes: lightning.lightning_count,
       lightning_count: lightning.lightning_count,
       thunder_day: lightning.thunder_day
      }
    : null;
  const graphs = db
    .prepare(
      `SELECT summary_date, mean_temp, rainfall_total, max_adjusted_gust, mean_pressure, mean_humidity,
             ${LIGHTNING_COUNT_SQL} as lightning_count,
             ${THUNDER_DAY_SQL} as thunder_day
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
    row: archiveRow,
    page: {
      date,
      temperature: archiveRow
        ? {
            max: archiveRow.max_temp,
            maxTime: archiveRow.max_temp_time_local,
            min: archiveRow.min_temp,
            minTime: archiveRow.min_temp_time_local,
            mean: archiveRow.mean_temp,
            range: archiveRow.temp_range
          }
        : null,
      rainfall: archiveRow
        ? {
            total: archiveRow.rainfall_total,
            rainDay: Boolean(archiveRow.rain_day)
          }
        : null,
      wind: archiveRow
        ? {
            maxWindSpeed: archiveRow.max_wind_speed,
            maxRawGust: archiveRow.max_raw_gust,
            maxAdjustedGust: archiveRow.max_adjusted_gust
          }
        : null,
      pressure: archiveRow
        ? {
            max: archiveRow.max_pressure,
            min: archiveRow.min_pressure,
            mean: archiveRow.mean_pressure
          }
        : null,
      humidity: archiveRow
        ? {
            max: archiveRow.max_humidity,
            min: archiveRow.min_humidity,
            mean: archiveRow.mean_humidity
          }
        : null,
      lightning: {
        ...lightning,
        radius_km: LIGHTNING_CLIMATOLOGY_RADIUS_KM
      },
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

routes.get('/api/climate/record-history', (_req, res) => {
  res.json(getRecordHistory());
});

routes.get('/api/climate/daily-normals', (req, res) => {
  const now = DateTime.now();
  const month = Number(req.query.month ?? now.month);
  const day = Number(req.query.day ?? now.day);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    res.status(400).json({ message: 'Invalid month or day' });
    return;
  }
  res.json(getDailyNormals(month, day));
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
    .prepare(
      'SELECT summary_year, mean_temp, total_rainfall, thunder_days FROM annual_summary ORDER BY summary_year'
    )
    .all();
  res.json({ trend, rows });
});

routes.get('/api/climate/graphs', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT summary_date, max_temp, min_temp, mean_temp,
              rainfall_total, max_adjusted_gust, mean_pressure,
              ${LIGHTNING_COUNT_SQL} as lightning_count,
              ${THUNDER_DAY_SQL} as thunder_day
       FROM daily_summary
       ORDER BY summary_date DESC LIMIT 365`
    )
    .all();
  res.json(rows);
});

routes.get('/api/climate/year-comparisons', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT summary_year, mean_temp, total_rainfall, highest_temp, lowest_temp, thunder_days
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
  res.json(getLightningClimatologyOverview());
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

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    res.status(400).json({ message: 'Invalid year or month query parameter' });
    return;
  }

  const report = getMonthlyClimateReport(year, month);
  if (!report) {
    res.status(404).json({ message: 'Monthly report not found for requested period' });
    return;
  }

  res.json(report);
});

routes.get('/api/reports/annual', (req, res) => {
  const year = Number(req.query.year ?? DateTime.now().year);

  if (!Number.isInteger(year)) {
    res.status(400).json({ message: 'Invalid year query parameter' });
    return;
  }

  const report = getAnnualClimateReport(year);
  if (!report) {
    res.status(404).json({ message: 'Annual report not found for requested year' });
    return;
  }

  res.json(report);
});

routes.get('/api/climate/analytics/year-comparison', (_req, res) => {
  res.json(getYearComparisonData());
});

routes.get('/api/climate/analytics/year-to-date', (_req, res) => {
  res.json(getYearToDateData());
});

routes.get('/api/climate/analytics/trends', (_req, res) => {
  res.json(getTrendsData());
});

routes.get('/api/climate/analytics/extremes', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 100);
  res.json(getExtremesData(limit));
});

routes.get('/api/exports/:dataset', (req, res) => {
  const dataset = req.params.dataset;
  const format = String(req.query.format ?? 'json').toLowerCase();

  try {
    const rows = fetchDataset(dataset);

    if (format === 'json') {
      res.json(rows);
      return;
    }

    if (format === 'csv') {
      res.header('content-type', 'text/csv; charset=utf-8');
      res.attachment(`${dataset}.csv`);
      res.send(toCsv(rows));
      return;
    }

    if (format === 'excel' || format === 'xlsx') {
      res.header('content-type', 'application/vnd.ms-excel; charset=utf-8');
      res.attachment(`${dataset}.xls`);
      res.send(toExcelXml(rows));
      return;
    }

    if (format === 'pdf') {
      res.header('content-type', 'application/pdf');
      res.attachment(`${dataset}.pdf`);
      res.send(toPdf(rows, `${config.stationId} ${dataset} export`));
      return;
    }

    res.status(400).json({ message: 'Unsupported export format. Use json, csv, excel, xlsx, or pdf.' });
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Export failed' });
  }
});
