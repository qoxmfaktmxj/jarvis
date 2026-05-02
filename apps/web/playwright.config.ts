import { defineConfig, devices } from '@playwright/test';
import { config as dotenvConfig } from 'dotenv';
import path from 'path';

// Load repo-root .env so auth helpers can connect to Postgres during tests.
// The playwright runner executes from apps/web/ — walk up two levels to reach
// the monorepo root where .env lives.
dotenvConfig({ path: path.resolve(__dirname, '../../.env'), override: false });

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3010',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // In worktrees a different Next.js instance may already occupy port 3010.
    // Allow the base URL (and the corresponding server check URL) to be
    // overridden via PLAYWRIGHT_BASE_URL so each worktree can run its own
    // server on a distinct port without stepping on others.
    command: `pnpm -F web dev --port ${new URL(process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3010').port || 3010}`,
    url: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3010',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
