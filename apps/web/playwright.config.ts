import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3010',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm -F web dev -- --port 3010',
    url: 'http://localhost:3010',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
