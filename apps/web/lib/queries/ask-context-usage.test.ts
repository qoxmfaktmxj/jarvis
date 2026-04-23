import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@jarvis/db/schema", () => ({
  askMessage: {
    conversationId: "ask_message.conversation_id",
    totalTokens: "ask_message.total_tokens",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ column, value })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings: Array.from(strings),
    values,
  })),
}));

import { db } from "@jarvis/db/client";
import { getConversationTokenUsage } from "./ask-context-usage";

function chain<T>(value: T) {
  const c = {
    from: vi.fn(() => c),
    where: vi.fn(() => c),
    then: (resolve: (r: T) => void) => Promise.resolve(resolve(value)),
  };
  return c;
}

describe("getConversationTokenUsage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 0 used tokens when the conversation has no messages", async () => {
    (db.select as unknown as Mock).mockReturnValue(
      chain([{ totalTokens: 0, messageCount: 0 }]),
    );

    const r = await getConversationTokenUsage("conv-empty");

    expect(r.conversationId).toBe("conv-empty");
    expect(r.usedTokens).toBe(0);
    expect(r.messageCount).toBe(0);
  });

  it("aggregates totalTokens across messages", async () => {
    (db.select as unknown as Mock).mockReturnValue(
      chain([{ totalTokens: 12_345, messageCount: 4 }]),
    );

    const r = await getConversationTokenUsage("conv-ok");

    expect(r.usedTokens).toBe(12_345);
    expect(r.messageCount).toBe(4);
  });

  it("coerces null SUM (empty table) to 0", async () => {
    (db.select as unknown as Mock).mockReturnValue(
      chain([{ totalTokens: null, messageCount: 0 }]),
    );

    const r = await getConversationTokenUsage("conv-null");

    expect(r.usedTokens).toBe(0);
  });
});
