import { describe, expect, it, vi } from "vitest";
import { createBudgetTracker } from "../budget.js";
import { createMemoryRateLimiter } from "../rate-limit.js";

describe("budget and rate-limit adapters", () => {
  it.each(["", "not-a-number", "0", "-1", "Infinity"])(
    "rejects an invalid daily budget limit: %s",
    (dailyUsd) => {
      expect(() => createBudgetTracker({} as never, { dailyUsd })).toThrow(/daily budget/i);
    },
  );

  it("uses the database uniqueness boundary for duplicate finalize calls", async () => {
    const onConflictDoNothing = vi.fn(async () => undefined);
    const values = vi.fn(() => ({ onConflictDoNothing }));
    const insert = vi.fn(() => ({ values }));
    const tracker = createBudgetTracker({ insert } as never, { dailyUsd: "1.00" });
    const input = {
      callId: "ask-1:0",
      workspaceId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      provider: "mock",
      model: "deterministic",
      usage: { promptTokens: 1, completionTokens: 1, costUsd: "0" },
      success: true,
      errorCode: null,
      latencyMs: 1,
    } as const;

    await tracker.finalize(input);
    await tracker.finalize(input);

    expect(onConflictDoNothing).toHaveBeenCalledTimes(2);
    expect(onConflictDoNothing).toHaveBeenCalledWith(expect.objectContaining({ target: expect.anything() }));
  });

  it("fails closed once a per-user window is exhausted", async () => {
    const limiter = createMemoryRateLimiter({ windowMs: 60_000, maxCost: 2, now: () => 1_000 });
    const key = { workspaceId: "ws-1", userId: "user-1", cost: 1 };

    await limiter.consume(key);
    await limiter.consume(key);
    await expect(limiter.consume(key)).rejects.toThrow("RATE_LIMITED");
  });
});
