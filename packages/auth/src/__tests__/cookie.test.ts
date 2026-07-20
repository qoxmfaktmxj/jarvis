import { describe, expect, it } from "vitest";
import { expiredSessionCookieOptions, sessionCookieOptions } from "../cookie.js";

describe("cookie", () => {
  it("derives maxAge from expiry", () => {
    const now = new Date("2026-07-20T00:00:00.000Z");
    const expiresAt = new Date(now.getTime() + 61_000);
    const options = sessionCookieOptions(expiresAt, now);
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.maxAge).toBe(61);
  });

  it("expires immediately for logout", () => {
    const options = expiredSessionCookieOptions();
    expect(options.maxAge).toBe(0);
    expect(options.expires.getTime()).toBe(0);
  });
});
