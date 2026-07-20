import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@jarvis/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    })),
  },
  askConversation: {},
  askMessage: {},
  sourceDocument: {},
  sourceRevision: {},
  wikiPageIndex: {},
}));

describe("conversation repository", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns null for foreign conversations", async () => {
    const repository = await import("./conversation-repository");
    await expect(
      repository.loadOwnedConversation({
        workspaceId: crypto.randomUUID(),
        userId: crypto.randomUUID(),
        conversationId: crypto.randomUUID(),
      }),
    ).resolves.toBeNull();
  });
});
