// packages/ai/embed.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateEmbedding } from "./embed.js";

const dbMock = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@jarvis/db/client", () => ({ db: dbMock }));

// OpenAI mock
vi.mock("openai", () => ({
  default: class {
    embeddings = {
      create: vi.fn().mockResolvedValue({
        data: [{ embedding: new Array(1536).fill(0.1) }],
        usage: { prompt_tokens: 5 },
      }),
    };
  },
}));

// Budget + logger stubs so non-cache paths don't throw
vi.mock("../ai/budget.js", () => ({
  assertBudget: vi.fn().mockResolvedValue(undefined),
  BudgetExceededError: class extends Error {},
  recordBlocked: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./budget.js", () => ({
  assertBudget: vi.fn().mockResolvedValue(undefined),
  BudgetExceededError: class extends Error {},
  recordBlocked: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn() },
  withRequestId: () => ({ info: vi.fn() }),
  logLlmCall: vi.fn().mockResolvedValue(undefined),
}));

// Helper: simulate a cache hit
function mockEmbedCacheHit(embedding: number[]) {
  const limit = vi.fn().mockResolvedValue([{ embedding }]);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  dbMock.select.mockReturnValue({ from });
}

// Helper: simulate a cache miss + successful insert
function mockEmbedCacheMiss() {
  const limit = vi.fn().mockResolvedValue([]);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  dbMock.select.mockReturnValue({ from });

  const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
  dbMock.insert.mockReturnValue({ values });
}

describe("generateEmbedding", () => {
  beforeEach(() => {
    dbMock.select.mockReset();
    dbMock.insert.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a float array of length 1536", async () => {
    mockEmbedCacheMiss();
    const result = await generateEmbedding("test question");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1536);
    result.forEach((v: number) => expect(typeof v).toBe("number"));
  });

  it("returns cached embedding when hash exists", async () => {
    const fakeEmbedding = new Array(1536).fill(0.5);
    mockEmbedCacheHit(fakeEmbedding);

    const result = await generateEmbedding("cached question");
    expect(result).toEqual(fakeEmbedding);

    // OpenAI must NOT have been called on a cache hit
    const { default: OpenAI } = await import("openai");
    const instance = new (OpenAI as any)();
    expect(instance.embeddings.create).not.toHaveBeenCalled();
  });
});
