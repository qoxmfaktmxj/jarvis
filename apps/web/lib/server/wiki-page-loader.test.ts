import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMocks = vi.hoisted(() => ({
  limit: vi.fn(async () => []),
}));

vi.mock("@jarvis/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({ limit: queryMocks.limit })),
        })),
      })),
    })),
  },
  sourceDocument: {},
  sourceRevision: {},
  wikiPageIndex: {},
  wikiPageSourceRef: {},
}));

describe("wiki page loader", () => {
  beforeEach(() => {
    vi.resetModules();
    queryMocks.limit.mockClear();
  });

  it("rejects _system, _archive, index, and log paths", async () => {
    const { loadWikiPage } = await import("./wiki-page-loader");
    const repo = {
      readBlob: vi.fn(),
    };

    await expect(loadWikiPage({ workspaceId: crypto.randomUUID(), segments: ["_system", "foo"], repo })).rejects.toThrow(
      "WIKI_PAGE_NOT_FOUND",
    );
    await expect(loadWikiPage({ workspaceId: crypto.randomUUID(), segments: ["index"], repo })).rejects.toThrow(
      "WIKI_PAGE_NOT_FOUND",
    );
  });

  it("limits recent dashboard Wiki queries", async () => {
    const { listRecentWikiPages } = await import("./wiki-page-loader");
    await listRecentWikiPages({ workspaceId: crypto.randomUUID(), limit: 5 });
    expect(queryMocks.limit).toHaveBeenCalledWith(5);
  });
});
