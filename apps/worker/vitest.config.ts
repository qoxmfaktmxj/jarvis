import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 420_000,
    hookTimeout: 420_000,
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1,
  },
});
