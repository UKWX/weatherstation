import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TestProject } from 'vitest/node';

const cleanupDbFiles = (dbPath: string) => {
  for (const suffix of ['', '-shm', '-wal']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
};

export default async function globalSetup(_project: TestProject) {
  const dbPath = path.join(os.tmpdir(), `wakefieldstation-vitest-${process.pid}.db`);
  process.env.DB_PATH = dbPath;
  cleanupDbFiles(dbPath);

  return () => {
    cleanupDbFiles(dbPath);
  };
}
