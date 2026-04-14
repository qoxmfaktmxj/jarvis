import { describe, it, expect, vi, beforeEach } from "vitest";

const logLlmCallMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
  withRequestId: () => ({ info: vi.fn() }),
  logLlmCall: logLlmCallMock,
}));

vi.mock("../budget.js", () => ({
  assertBudget: vi.fn().mockResolvedValue(undefined),
  BudgetExceededError: class extends Error {},
}));

vi.mock("@jarvis/db/redis", () => ({
  getRedis: () => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
  }),
}));

vi.mock("openai", () => {
  class OpenAI {
    embeddings = {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: new Array(1536).fill(0.1) }],
        usage: { prompt_tokens: 7, total_tokens: 7 },
      }),
    };
  }
  return { default: OpenAI };
});

describe("embed logs llm_call_log row", () => {
  beforeEach(() => {
    logLlmCallMock.mockClear();
  });

  it("logs one row with status=ok and tokensIn from usage", async () => {
    const { generateEmbedding } = await import("../embed.js");
    await generateEmbedding("hello world", {
      workspaceId: "00000000-0000-0000-0000-000000000001",
      requestId: "req-e-1",
    });
    expect(logLlmCallMock).toHaveBeenCalledTimes(1);
    const row = logLlmCallMock.mock.calls[0][0];
    expect(row.status).toBe("ok");
    expect(row.model).toBe("text-embedding-3-small");
    expect(row.tokensIn).toBe(7);
    expect(row.requestId).toBe("req-e-1");
  });
});
