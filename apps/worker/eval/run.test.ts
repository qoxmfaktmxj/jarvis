import { describe, it, expect } from "vitest";
import { runEval } from "./run.js";

describe("runEval", () => {
  it("returns summary object with total / errors / cache_hit_rate / avg_latency_ms / avg_cost_usd", async () => {
    // Use dryRun = true: no real API call, returns canned response
    const summary = await runEval({
      fixturesDir: "eval/fixtures/2026-04",
      dryRun: true,
    });
    expect(summary).toMatchObject({
      total: expect.any(Number),
      errors: expect.any(Number),
      cache_hit_rate: expect.any(Number),
      avg_latency_ms: expect.any(Number),
      avg_cost_usd: expect.any(Number),
    });
    expect(summary.total).toBeGreaterThan(0);
  });
});
