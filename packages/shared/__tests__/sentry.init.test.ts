import { describe, it, expect, vi, beforeEach } from "vitest";

describe("initSentry entry-point contract", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.SENTRY_DSN;
  });

  it("reads SENTRY_DSN from env and calls Sentry.init when set", async () => {
    process.env.SENTRY_DSN = "https://example@o0.ingest.sentry.io/0";
    const initSpy = vi.fn();
    vi.doMock("@sentry/node", () => ({
      init: initSpy,
      captureException: vi.fn(),
      captureMessage: vi.fn(),
    }));
    const { initSentry } = await import("../sentry.js");
    initSentry();
    expect(initSpy).toHaveBeenCalled();
    const firstCall = initSpy.mock.calls[0];
    expect(firstCall).toBeDefined();
    expect(firstCall![0]).toMatchObject({
      dsn: "https://example@o0.ingest.sentry.io/0",
    });
  });

  it("is a pure no-op when SENTRY_DSN missing (Sentry.init not called)", async () => {
    const initSpy = vi.fn();
    vi.doMock("@sentry/node", () => ({
      init: initSpy,
      captureException: vi.fn(),
      captureMessage: vi.fn(),
    }));
    const { initSentry } = await import("../sentry.js");
    initSentry();
    expect(initSpy).not.toHaveBeenCalled();
  });
});
