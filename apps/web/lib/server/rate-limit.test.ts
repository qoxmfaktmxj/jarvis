import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, __resetRateLimitForTests } from "./rate-limit.js";

describe("checkRateLimit", () => {
  beforeEach(() => {
    __resetRateLimitForTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows the first request and starts a new window", () => {
    const r = checkRateLimit("u1", 3, 60);
    expect(r.allowed).toBe(true);
    expect(r.current).toBe(1);
    expect(r.max).toBe(3);
  });

  it("increments within the window and blocks when exceeded", () => {
    expect(checkRateLimit("u1", 2, 60).allowed).toBe(true);
    expect(checkRateLimit("u1", 2, 60).allowed).toBe(true);
    const r = checkRateLimit("u1", 2, 60);
    expect(r.allowed).toBe(false);
    expect(r.retryAfterSec).toBeGreaterThan(0);
  });

  it("resets the window after the window elapses", () => {
    checkRateLimit("u1", 1, 60);
    expect(checkRateLimit("u1", 1, 60).allowed).toBe(false);

    vi.advanceTimersByTime(61_000);

    const r = checkRateLimit("u1", 1, 60);
    expect(r.allowed).toBe(true);
    expect(r.current).toBe(1);
  });

  it("keeps separate counters per key", () => {
    checkRateLimit("u1", 1, 60);
    expect(checkRateLimit("u2", 1, 60).allowed).toBe(true);
  });
});
