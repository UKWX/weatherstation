CREATE TABLE IF NOT EXISTS schema_versions (
  version INTEGER PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS raw_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  timestamp_utc TEXT NOT NULL,
  timestamp_local TEXT NOT NULL,
  temperature REAL,
  humidity REAL,
  dew_point REAL,
  pressure REAL,
  wind_speed REAL,
  wind_direction REAL,
  wind_gust REAL,
  rainfall REAL,
  rain_rate REAL,
  solar_radiation REAL,
  uv_index REAL,
  feels_like REAL,
  quality_flag TEXT,
  source_batch_id TEXT,
  ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(station_id, timestamp_utc)
);
CREATE INDEX IF NOT EXISTS idx_raw_obs_local ON raw_observations(station_id, timestamp_local);

CREATE TRIGGER IF NOT EXISTS raw_observations_immutable_update
BEFORE UPDATE ON raw_observations
BEGIN
  SELECT RAISE(ABORT, 'raw_observations are immutable');
END;

CREATE TRIGGER IF NOT EXISTS raw_observations_immutable_delete
BEFORE DELETE ON raw_observations
BEGIN
  SELECT RAISE(ABORT, 'raw_observations are immutable');
END;

CREATE TABLE IF NOT EXISTS temperature_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  observed_date TEXT NOT NULL,
  tmin REAL,
  tmax REAL,
  tmean REAL,
  source TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(station_id, observed_date)
);

CREATE TABLE IF NOT EXISTS precipitation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  observed_date TEXT NOT NULL,
  rainfall_total REAL,
  rain_days REAL,
  source TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(station_id, observed_date)
);

CREATE TABLE IF NOT EXISTS daily_summary (
  station_id TEXT NOT NULL,
  summary_date TEXT NOT NULL,
  max_temp REAL,
  max_temp_time_local TEXT,
  min_temp REAL,
  min_temp_time_local TEXT,
  mean_temp REAL,
  temp_range REAL,
  rainfall_total REAL,
  rain_day INTEGER DEFAULT 0,
  max_rain_rate REAL,
  max_wind_speed REAL,
  max_raw_gust REAL,
  max_adjusted_gust REAL,
  max_gust REAL,
  avg_wind_speed REAL,
  max_pressure REAL,
  min_pressure REAL,
  mean_pressure REAL,
  max_humidity REAL,
  min_humidity REAL,
  mean_humidity REAL,
  lightning_strikes INTEGER DEFAULT 0,
  lightning_count INTEGER DEFAULT 0,
  thunder_day INTEGER DEFAULT 0,
  observation_count INTEGER NOT NULL DEFAULT 0,
  calc_version TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(station_id, summary_date)
);

CREATE TABLE IF NOT EXISTS monthly_summary (
  station_id TEXT NOT NULL,
  summary_year INTEGER NOT NULL,
  summary_month INTEGER NOT NULL,
  mean_temp REAL,
  total_rainfall REAL,
  max_temp REAL,
  min_temp REAL,
  max_gust REAL,
  total_lightning_days INTEGER DEFAULT 0,
  observation_days INTEGER NOT NULL DEFAULT 0,
  calc_version TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(station_id, summary_year, summary_month)
);

CREATE TABLE IF NOT EXISTS annual_summary (
  station_id TEXT NOT NULL,
  summary_year INTEGER NOT NULL,
  mean_temp REAL,
  total_rainfall REAL,
  highest_temp REAL,
  lowest_temp REAL,
  max_gust REAL,
  thunder_days INTEGER DEFAULT 0,
  valid_days INTEGER NOT NULL DEFAULT 0,
  calc_version TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(station_id, summary_year)
);

CREATE TABLE IF NOT EXISTS climate_normals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  normal_type TEXT NOT NULL,
  month INTEGER,
  day_of_month INTEGER,
  variable TEXT NOT NULL,
  value REAL,
  baseline_start_year INTEGER NOT NULL,
  baseline_end_year INTEGER NOT NULL,
  calc_version TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(station_id, normal_type, month, day_of_month, variable, baseline_start_year, baseline_end_year)
);

CREATE TABLE IF NOT EXISTS records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  period_type TEXT NOT NULL,
  variable TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_value REAL NOT NULL,
  record_date TEXT,
  source_summary TEXT NOT NULL,
  calc_version TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(station_id, period_type, variable, record_type)
);

CREATE TABLE IF NOT EXISTS anomalies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  period_type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  variable TEXT NOT NULL,
  observed_value REAL,
  baseline_value REAL,
  anomaly_value REAL,
  anomaly_percent REAL,
  calc_version TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(station_id, period_type, period_key, variable)
);

CREATE TABLE IF NOT EXISTS rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  ranking_scope TEXT NOT NULL,
  variable TEXT NOT NULL,
  period_key TEXT NOT NULL,
  value REAL,
  rank_position INTEGER,
  percentile REAL,
  calc_version TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(station_id, ranking_scope, variable, period_key)
);

CREATE TABLE IF NOT EXISTS import_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  file_name TEXT,
  imported_rows INTEGER NOT NULL,
  duplicate_rows INTEGER NOT NULL,
  rejected_rows INTEGER NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS processing_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_name TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  message TEXT,
  calc_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lightning_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  event_time_utc TEXT NOT NULL,
  event_time_local TEXT NOT NULL,
  distance_km REAL,
  bearing_deg REAL,
  intensity REAL,
  UNIQUE(station_id, event_time_utc, distance_km, bearing_deg)
);

CREATE TABLE IF NOT EXISTS snow_archive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  observed_date TEXT NOT NULL,
  snow_depth_cm REAL,
  snowfall_cm REAL,
  snow_days INTEGER DEFAULT 0,
  notes TEXT,
  UNIQUE(station_id, observed_date)
);

CREATE TABLE IF NOT EXISTS record_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,
  period_type TEXT NOT NULL,
  variable TEXT NOT NULL,
  record_type TEXT NOT NULL,
  previous_value REAL,
  new_value REAL NOT NULL,
  record_date TEXT,
  detected_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(station_id, period_type, variable, record_type, new_value, record_date)
);

CREATE TABLE IF NOT EXISTS climate_monthly_observations (
  station_id TEXT NOT NULL,
  summary_year INTEGER NOT NULL,
  summary_month INTEGER NOT NULL,
  highest_pressure REAL,
  lowest_pressure REAL,
  highest_wind_gust REAL,
  lightning_count INTEGER,
  thunder_days INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(station_id, summary_year, summary_month)
);
