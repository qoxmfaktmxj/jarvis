// apps/web/lib/server/rate-limit.ts
// In-memory fixed-window rate limiter. Single-instance deployment assumed.
// (Bucket resets atomically once `now - windowStart > windowMs`. Allows a
// burst up to 2×max at the window boundary — acceptable for 20/h and 60/min.)

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec?: number;
  current: number;
  max: number;
}

export function checkRateLimit(
  key: string,
  max: number,
  windowSec: number,
): RateLimitResult {
  const now = Date.now();
  const windowMs = windowSec * 1000;
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, current: 1, max };
  }

  existing.count += 1;
  if (existing.count > max) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((existing.windowStart + windowMs - now) / 1000),
    );
    return { allowed: false, retryAfterSec, current: existing.count, max };
  }
  return { allowed: true, current: existing.count, max };
}

/** Test-only: clear all buckets between runs. Not exported from a package index. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}

// Periodic cleanup so the Map can't grow without bound. Runs every 10 min,
// removes buckets older than 1 hour. `unref()` so it doesn't keep the
// event loop alive in tests or during graceful shutdown.
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const MAX_BUCKET_AGE_MS = 60 * 60 * 1000;

// Guard against double-registration in Next.js dev HMR.
const g = globalThis as typeof globalThis & { __rateLimitCleanupTimer__?: NodeJS.Timeout };
if (!g.__rateLimitCleanupTimer__) {
  g.__rateLimitCleanupTimer__ = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (now - b.windowStart > MAX_BUCKET_AGE_MS) buckets.delete(k);
    }
  }, CLEANUP_INTERVAL_MS);
  g.__rateLimitCleanupTimer__.unref?.();
}
