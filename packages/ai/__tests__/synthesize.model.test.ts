/**
 * packages/ai/__tests__/synthesize.model.test.ts
 *
 * 2026-04-21 — Verifies that `synthesizePageFirstAnswer({ model })` forwards
 * the requested model to the LLM call (createChatWithTokenFallback) and to
 * logLlmCall. Default (undefined model) falls back to env SYNTH_MODEL.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";

vi.mock("@jarvis/db/client", () => ({
  db: {
    execute: vi.fn(),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
}));

vi.mock("@jarvis/wiki-fs", () => ({
  readPage: vi.fn(async () => "---\ntitle: Fake\n---\n\nBody"),
  wikiRoot: () => "/tmp/wiki",
}));

const { createChatMock, logLlmCallMock } = vi.hoisted(() => ({
  createChatMock: vi.fn(async () => {
    async function* gen() {
      yield { choices: [{ delta: { content: "answer" } }] };
      yield { choices: [{ delta: {} }], usage: { prompt_tokens: 10, completion_tokens: 5 } };
    }
    return gen();
  }),
  logLlmCallMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../openai-compat.js", () => ({
  createChatWithTokenFallback: createChatMock,
}));

vi.mock("../budget.js", () => ({
  assertBudget: vi.fn().mockResolvedValue(undefined),
  recordBlocked: vi.fn().mockResolvedValue(undefined),
  BudgetExceededError: class extends Error {},
}));

vi.mock("../logger.js", () => ({
  logLlmCall: logLlmCallMock,
  logger: { info: vi.fn(), error: vi.fn(), child: vi.fn() },
  withRequestId: vi.fn(),
}));

import { synthesizePageFirstAnswer } from "../page-first/synthesize.js";
import type { LoadedPage } from "../page-first/read-pages.js";

const WS = "00000000-0000-0000-0000-0000000000aa";
const pages: LoadedPage[] = [
  {
    id: "p1",
    slug: "alpha",
    path: "manual/alpha.md",
    title: "Alpha",
    sensitivity: "INTERNAL",
    content: "Alpha body content for synthesis.",
    origin: "shortlist",
  },
];

async function drain<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("synthesizePageFirstAnswer({ model })", () => {
  beforeEach(() => {
    createChatMock.mockClear();
    logLlmCallMock.mockClear();
  });

  it("forwards model='gpt-5.4' to createChatWithTokenFallback + logLlmCall", async () => {
    await drain(
      synthesizePageFirstAnswer({
        question: "what is alpha?",
        pages,
        workspaceId: WS,
        requestId: "req-model-test",
        sensitivityScope: "workspace:" + WS + "|level:internal|graph:0",
        model: "gpt-5.4",
      }),
    );

    expect(createChatMock).toHaveBeenCalledTimes(1);
    const [, modelArg] = createChatMock.mock.calls[0]!;
    expect(modelArg).toBe("gpt-5.4");

    expect(logLlmCallMock).toHaveBeenCalledTimes(1);
    const logRow = logLlmCallMock.mock.calls[0]![0];
    expect(logRow.model).toBe("gpt-5.4");
  });

  it("defaults to env SYNTH_MODEL when opts.model is undefined", async () => {
    await drain(
      synthesizePageFirstAnswer({
        question: "what is alpha?",
        pages,
        workspaceId: WS,
        requestId: "req-default",
      }),
    );
    const [, modelArg] = createChatMock.mock.calls[0]!;
    expect(modelArg).toBe(process.env["ASK_AI_MODEL"] ?? "gpt-5.4-mini");
  });

  it("forwards model='gpt-5.4-mini' explicitly", async () => {
    await drain(
      synthesizePageFirstAnswer({
        question: "alpha?",
        pages,
        workspaceId: WS,
        requestId: "req-mini",
        model: "gpt-5.4-mini",
      }),
    );
    const [, modelArg] = createChatMock.mock.calls[0]!;
    expect(modelArg).toBe("gpt-5.4-mini");
    expect(logLlmCallMock.mock.calls[0]![0].model).toBe("gpt-5.4-mini");
  });
});
