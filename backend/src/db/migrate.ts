import fs from 'node:fs';
import path from 'node:path';
import { db } from './connection';

const schemaFile = path.join(
  '/home/runner/work/WakefieldStation/WakefieldStation/backend/src/db',
  'schema.sql'
);

const schemaSql = fs.readFileSync(schemaFile, 'utf8');
db.exec(schemaSql);

const hasVersion = db
  .prepare('SELECT COUNT(*) as count FROM schema_versions WHERE version = 1')
  .get() as { count: number };

if (!hasVersion.count) {
  db.prepare('INSERT INTO schema_versions(version, description) VALUES(1, ?)').run(
    'Initial climate archive schema'
  );
}

console.log('Migration complete');
