import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMocks = vi.hoisted(() => ({
  select: vi.fn(),
  countWhere: vi.fn(),
  rowsWhere: vi.fn(),
  limit: vi.fn(),
  offset: vi.fn(),
}));

vi.mock("@jarvis/db", () => ({
  db: {
    select: queryMocks.select,
  },
  sourceDocument: {},
  sourceRevision: {},
  wikiPageIndex: {},
  wikiPageSourceRef: {},
}));

describe("wiki page loader", () => {
  beforeEach(() => {
    vi.resetModules();
    queryMocks.select.mockReset();
    queryMocks.countWhere.mockReset();
    queryMocks.rowsWhere.mockReset();
    queryMocks.limit.mockClear();
    queryMocks.offset.mockClear();
  });

  function mockPagedQueries(total: number, rows: unknown[] = []): void {
    queryMocks.countWhere.mockResolvedValue([{ total }]);
    queryMocks.offset.mockResolvedValue(rows);
    queryMocks.limit.mockReturnValue({ offset: queryMocks.offset });
    queryMocks.rowsWhere.mockReturnValue({ orderBy: vi.fn(() => ({ limit: queryMocks.limit })) });
    queryMocks.select
      .mockReturnValueOnce({ from: vi.fn(() => ({ where: queryMocks.countWhere })) })
      .mockReturnValueOnce({ from: vi.fn(() => ({ where: queryMocks.rowsWhere })) });
  }

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
    queryMocks.limit.mockResolvedValue([]);
    queryMocks.select.mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: queryMocks.limit })) })),
      })),
    });
    const { listRecentWikiPages } = await import("./wiki-page-loader");
    await listRecentWikiPages({ workspaceId: crypto.randomUUID(), limit: 5 });
    expect(queryMocks.limit).toHaveBeenCalledWith(5);
  });

  it("counts and loads the first Wiki page with an exact page size of 20", async () => {
    mockPagedQueries(21);
    const { listWikiPages } = await import("./wiki-page-loader");

    const result = await listWikiPages({ workspaceId: crypto.randomUUID(), page: 1, limit: 20 });

    expect(result).toMatchObject({ total: 21, page: 1, totalPages: 2, rows: [] });
    expect(queryMocks.select).toHaveBeenCalledTimes(2);
    expect(queryMocks.limit).toHaveBeenCalledWith(20);
    expect(queryMocks.offset).toHaveBeenCalledWith(0);
    expect(queryMocks.countWhere.mock.calls[0]?.[0]).toBe(queryMocks.rowsWhere.mock.calls[0]?.[0]);
  });

  it("loads the second Wiki page at offset 20", async () => {
    mockPagedQueries(40);
    const { listWikiPages } = await import("./wiki-page-loader");

    const result = await listWikiPages({ workspaceId: crypto.randomUUID(), page: 2, limit: 20 });

    expect(result).toMatchObject({ total: 40, page: 2, totalPages: 2, rows: [] });
    expect(queryMocks.limit).toHaveBeenCalledWith(20);
    expect(queryMocks.offset).toHaveBeenCalledWith(20);
  });

  it("clamps a page beyond the final Wiki page", async () => {
    mockPagedQueries(21);
    const { listWikiPages } = await import("./wiki-page-loader");

    const result = await listWikiPages({ workspaceId: crypto.randomUUID(), page: 999, limit: 20 });

    expect(result).toMatchObject({ total: 21, page: 2, totalPages: 2, rows: [] });
    expect(queryMocks.offset).toHaveBeenCalledWith(20);
  });
});
