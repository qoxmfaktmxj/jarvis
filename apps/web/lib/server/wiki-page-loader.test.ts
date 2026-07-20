import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@jarvis/db", () => ({
  db: {
    select: vi.fn(),
  },
  sourceDocument: {},
  sourceRevision: {},
  wikiPageIndex: {},
  wikiPageSourceRef: {},
}));

describe("wiki page loader", () => {
  beforeEach(() => {
    vi.resetModules();
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
});
