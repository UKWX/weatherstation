import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/globalSetup.ts'],
    // Run test files sequentially to avoid race conditions on the shared SQLite DB.
    fileParallelism: false
  }
});
