import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.mjs",
  fullyParallel: true,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  workers: process.env.CI ? 2 : 4,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3010",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node --env-file=../../.env.local ./node_modules/next/dist/bin/next dev --port 3010",
    url: "http://127.0.0.1:3010/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { NEXT_DIST_DIR: ".next-e2e" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
