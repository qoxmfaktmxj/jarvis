import { describe, it, expect, beforeEach, vi } from "vitest";

describe("sentry wrapper", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SENTRY_DSN;
  });

  it("initSentry is a no-op when SENTRY_DSN missing", async () => {
    const { initSentry, captureException } = await import("../sentry.js");
    expect(() => initSentry()).not.toThrow();
    expect(() => captureException(new Error("boom"))).not.toThrow();
  }, 15000);

  it("initSentry calls Sentry.init when DSN is set", async () => {
    process.env.SENTRY_DSN = "https://example@o0.ingest.sentry.io/0";
    const initMock = vi.fn();
    vi.doMock("@sentry/node", () => ({
      init: initMock,
      captureException: vi.fn(),
      captureMessage: vi.fn(),
    }));
    const { initSentry } = await import("../sentry.js");
    initSentry();
    expect(initMock).toHaveBeenCalledTimes(1);
    const firstCall = initMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall![0].dsn).toBe(process.env.SENTRY_DSN);
  });
});
