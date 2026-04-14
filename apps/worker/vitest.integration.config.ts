// apps/worker/vitest.integration.config.ts
// Runs only the integration suite; excluded from the default `pnpm test`.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    // Integration tests hit a real DB; run serially to avoid TRUNCATE races.
    poolOptions: { forks: { singleFork: true } },
  },
});
