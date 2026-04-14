import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@jarvis/db/client", () => ({
  db: {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe("logger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exports a pino logger instance", async () => {
    const { logger } = await import("../logger.js");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("withRequestId binds request id into child logger", async () => {
    const { withRequestId } = await import("../logger.js");
    const child = withRequestId("req-abc");
    expect(child.bindings().requestId).toBe("req-abc");
  });

  it("logLlmCall inserts into llm_call_log and returns void", async () => {
    const { logLlmCall } = await import("../logger.js");
    const { db } = await import("@jarvis/db/client");
    await logLlmCall({
      workspaceId: "00000000-0000-0000-0000-000000000001",
      requestId: "req-xyz",
      model: "gpt-5.4-mini",
      promptVersion: "v1",
      tokensIn: 10,
      tokensOut: 20,
      costUsd: "0.0012",
      latencyMs: 123,
      status: "ok",
      blockedBy: null,
      errorMessage: null,
    });
    expect(db.insert).toHaveBeenCalledTimes(1);
  });
});
