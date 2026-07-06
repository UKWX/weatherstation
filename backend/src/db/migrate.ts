import fs from 'node:fs';
import path from 'node:path';
import { db } from './connection';

const schemaFile = path.join(
  '/home/runner/work/WakefieldStation/WakefieldStation/backend/src/db',
  'schema.sql'
);

const schemaSql = fs.readFileSync(schemaFile, 'utf8');
db.exec(schemaSql);

const assertSqlIdentifier = (value: string): void => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`Invalid SQL identifier: ${value}`);
  }
};

const ensureColumn = (table: string, column: string, definition: string): void => {
  assertSqlIdentifier(table);
  assertSqlIdentifier(column);
  // PRAGMA/ALTER identifiers cannot be parameterized in SQLite, so we guard names explicitly.
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
};

ensureColumn('daily_summary', 'max_temp_time_local', 'TEXT');
ensureColumn('daily_summary', 'min_temp_time_local', 'TEXT');
ensureColumn('daily_summary', 'temp_range', 'REAL');
ensureColumn('daily_summary', 'rain_day', 'INTEGER DEFAULT 0');
ensureColumn('daily_summary', 'max_wind_speed', 'REAL');
ensureColumn('daily_summary', 'max_raw_gust', 'REAL');
ensureColumn('daily_summary', 'max_adjusted_gust', 'REAL');
ensureColumn('daily_summary', 'max_pressure', 'REAL');
ensureColumn('daily_summary', 'min_pressure', 'REAL');
ensureColumn('daily_summary', 'max_humidity', 'REAL');
ensureColumn('daily_summary', 'min_humidity', 'REAL');
ensureColumn('daily_summary', 'lightning_count', 'INTEGER DEFAULT 0');
ensureColumn('daily_summary', 'thunder_day', 'INTEGER DEFAULT 0');
ensureColumn('monthly_summary', 'total_lightning_count', 'INTEGER DEFAULT 0');
ensureColumn('annual_summary', 'total_lightning_count', 'INTEGER DEFAULT 0');

const hasVersion = db
  .prepare('SELECT COUNT(*) as count FROM schema_versions WHERE version = 1')
  .get() as { count: number };

if (!hasVersion.count) {
  db.prepare('INSERT INTO schema_versions(version, description) VALUES(1, ?)').run(
    'Initial climate archive schema'
  );
}

const hasVersion2 = db
  .prepare('SELECT COUNT(*) as count FROM schema_versions WHERE version = 2')
  .get() as { count: number };

if (!hasVersion2.count) {
  db.prepare('INSERT INTO schema_versions(version, description) VALUES(2, ?)').run(
    'Daily climate summary enhancements for UK time windows'
  );
}

const hasVersion3 = db
  .prepare('SELECT COUNT(*) as count FROM schema_versions WHERE version = 3')
  .get() as { count: number };

if (!hasVersion3.count) {
  db.prepare('INSERT INTO schema_versions(version, description) VALUES(3, ?)').run(
    'Lightning climatology daily archive fields'
  );
}

const hasVersion4 = db
  .prepare('SELECT COUNT(*) as count FROM schema_versions WHERE version = 4')
  .get() as { count: number };

if (!hasVersion4.count) {
  db.exec(`
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
    )
  `);
  db.prepare('INSERT INTO schema_versions(version, description) VALUES(4, ?)').run(
    'Record history table and lightning count rollups on monthly/annual summaries'
  );
}

console.log('Migration complete');
