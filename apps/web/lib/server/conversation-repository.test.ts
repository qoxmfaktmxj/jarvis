import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMocks = vi.hoisted(() => ({
  orderedLimit: vi.fn(async () => []),
  updateWhere: vi.fn(() => ({ returning: vi.fn(async () => [{ id: "conversation-1" }]) })),
  deleteWhere: vi.fn(() => ({ returning: vi.fn(async () => [{ id: "conversation-1" }]) })),
  update: vi.fn(() => ({ set: vi.fn(() => ({ where: queryMocks.updateWhere })) })),
  delete: vi.fn(() => ({ where: queryMocks.deleteWhere })),
  eq: vi.fn((column: string, value: string) => ({ column, value })),
  and: vi.fn((...conditions: unknown[]) => conditions),
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
    update: queryMocks.update,
    delete: queryMocks.delete,
  },
  askConversation: {
    id: "conversation.id",
    workspaceId: "conversation.workspaceId",
    userId: "conversation.userId",
    title: "conversation.title",
    updatedAt: "conversation.updatedAt",
  },
  askMessage: {},
  sourceDocument: {},
  sourceRevision: {},
  wikiPageIndex: {},
}));

vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  and: queryMocks.and,
  eq: queryMocks.eq,
}));

describe("conversation repository", () => {
  beforeEach(() => {
    vi.resetModules();
    queryMocks.orderedLimit.mockClear();
    queryMocks.update.mockClear();
    queryMocks.delete.mockClear();
    queryMocks.updateWhere.mockClear();
    queryMocks.deleteWhere.mockClear();
    queryMocks.eq.mockClear();
    queryMocks.and.mockClear();
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

  it("renames only the requested conversation owned by the workspace user", async () => {
    const repository = await import("./conversation-repository");

    await expect(
      repository.renameOwnedConversation({
        workspaceId: "workspace-1",
        userId: "user-1",
        conversationId: "conversation-1",
        title: "  변경한 제목  ",
      }),
    ).resolves.toBe(true);

    expect(queryMocks.eq).toHaveBeenCalledWith("conversation.workspaceId", "workspace-1");
    expect(queryMocks.eq).toHaveBeenCalledWith("conversation.userId", "user-1");
    expect(queryMocks.eq).toHaveBeenCalledWith("conversation.id", "conversation-1");
  });

  it("rejects invalid rename titles before mutating", async () => {
    const repository = await import("./conversation-repository");
    const input = { workspaceId: "workspace-1", userId: "user-1", conversationId: "conversation-1" };

    await expect(repository.renameOwnedConversation({ ...input, title: "   " })).resolves.toBe(false);
    await expect(repository.renameOwnedConversation({ ...input, title: "a".repeat(201) })).resolves.toBe(false);

    expect(queryMocks.update).not.toHaveBeenCalled();
  });

  it("deletes only the requested conversation owned by the workspace user", async () => {
    const repository = await import("./conversation-repository");

    await expect(
      repository.deleteOwnedConversation({
        workspaceId: "workspace-1",
        userId: "user-1",
        conversationId: "conversation-1",
      }),
    ).resolves.toBe(true);

    expect(queryMocks.eq).toHaveBeenCalledWith("conversation.workspaceId", "workspace-1");
    expect(queryMocks.eq).toHaveBeenCalledWith("conversation.userId", "user-1");
    expect(queryMocks.eq).toHaveBeenCalledWith("conversation.id", "conversation-1");
  });

  it("returns false when an owned delete finds no row", async () => {
    queryMocks.deleteWhere.mockReturnValueOnce({ returning: vi.fn(async () => []) });
    const repository = await import("./conversation-repository");

    await expect(
      repository.deleteOwnedConversation({
        workspaceId: "workspace-1",
        userId: "user-1",
        conversationId: "missing",
      }),
    ).resolves.toBe(false);
  });
});
