import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMocks = vi.hoisted(() => ({
  orderedLimit: vi.fn(async () => []),
}));

vi.mock("@jarvis/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
          orderBy: vi.fn(() => ({ limit: queryMocks.orderedLimit })),
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
    queryMocks.orderedLimit.mockClear();
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

  it("limits dashboard conversation queries", async () => {
    const repository = await import("./conversation-repository");
    await repository.listOwnedConversations({
      workspaceId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      limit: 5,
    });

    expect(queryMocks.orderedLimit).toHaveBeenCalledWith(5);
  });
});
