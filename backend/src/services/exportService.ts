import { stringify } from 'csv-stringify/sync';
import { db } from '../db/connection';

const datasets: Record<string, string> = {
  raw: 'SELECT * FROM raw_observations ORDER BY timestamp_utc DESC LIMIT 5000',
  daily: 'SELECT * FROM daily_summary ORDER BY summary_date DESC LIMIT 5000',
  monthly: 'SELECT * FROM monthly_summary ORDER BY summary_year DESC, summary_month DESC LIMIT 5000',
  annual: 'SELECT * FROM annual_summary ORDER BY summary_year DESC LIMIT 5000',
  anomalies: 'SELECT * FROM anomalies ORDER BY period_key DESC LIMIT 5000',
  records: 'SELECT * FROM records ORDER BY generated_at DESC LIMIT 5000',
  rankings: 'SELECT * FROM rankings ORDER BY variable, rank_position ASC LIMIT 5000'
};

export const fetchDataset = (name: string): Record<string, unknown>[] => {
  const sql = datasets[name];
  if (!sql) {
    throw new Error(`Unsupported export dataset: ${name}`);
  }

  return db.prepare(sql).all() as Record<string, unknown>[];
};

export const toCsv = (rows: Record<string, unknown>[]): string => {
  if (!rows.length) {
    return '';
  }
  return stringify(rows, { header: true });
};
