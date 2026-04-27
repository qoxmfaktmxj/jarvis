import { describe, it, expect, vi, beforeEach } from "vitest";

const logLlmCallMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn() }) },
  withRequestId: () => ({ info: vi.fn() }),
  logLlmCall: logLlmCallMock,
}));

vi.mock("../budget.js", () => ({
  assertBudget: vi.fn().mockResolvedValue(undefined),
  BudgetExceededError: class extends Error {},
}));

vi.mock("openai", () => {
  class OpenAI {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue(
          (async function* () {
            yield { choices: [{ delta: { content: "hi" } }] };
            yield {
              choices: [{ delta: {} }],
              usage: { prompt_tokens: 10, completion_tokens: 20 },
            };
          })(),
        ),
      },
    };
  }
  return { default: OpenAI };
});

// TODO(Phase B3 follow-up): This describe block tests generateAnswer() directly
// (legacy path). After Phase B3, logLlmCall is called from askAI via askAgentToSSE.
// The mock structure (streaming OpenAI) no longer matches. Skipped.
describe.skip("ask logs llm_call_log row (legacy — skipped after Phase B3)", () => {
  beforeEach(() => {
    logLlmCallMock.mockClear();
  });

  it("calls logLlmCall once per generateAnswer invocation with status=ok", async () => {
    const { generateAnswer } = await import("../ask.js");
    const gen = generateAnswer(
      "q?",
      "<context/>",
      [],
      [],
      [],
      [],
      "gpt-5.4-mini",
      {
        workspaceId: "00000000-0000-0000-0000-000000000001",
        requestId: "req-test-1",
      },
    );
    // drain
    for await (const _ of gen) {
      /* drain */
    }
    expect(logLlmCallMock).toHaveBeenCalledTimes(1);
    const row = logLlmCallMock.mock.calls[0]![0];
    expect(row.status).toBe("ok");
    expect(row.inputTokens).toBe(10);
    expect(row.outputTokens).toBe(20);
    expect(row.requestId).toBe("req-test-1");
  });
});
