import type { RateLimiter } from "./types.js";

export function createMemoryRateLimiter(options: {
  windowMs: number;
  maxCost: number;
  now?: () => number;
}): RateLimiter {
  const buckets = new Map<string, { resetAt: number; cost: number }>();
  const now = options.now ?? Date.now;
  return {
    async consume(input) {
      const key = `${input.workspaceId}:${input.userId}`;
      const current = now();
      const bucket = buckets.get(key);
      const next =
        !bucket || bucket.resetAt <= current
          ? { resetAt: current + options.windowMs, cost: input.cost }
          : { resetAt: bucket.resetAt, cost: bucket.cost + input.cost };
      if (next.cost > options.maxCost) {
        throw new Error("RATE_LIMITED");
      }
      buckets.set(key, next);
    },
  };
}
