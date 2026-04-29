// packages/wiki-agent/src/__tests__/projection.test.ts
//
// Unit tests for the shared projectLinks() utility.
// All DB I/O is mocked — no actual DB connection required.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock @jarvis/db/client ────────────────────────────────────────────────
// We intercept the module before importing the unit under test.

const mockDeleteWhere = vi.fn().mockResolvedValue(undefined);
const mockInsertValues = vi.fn().mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) });

// Track calls for inspection.
const deleteChain = { where: mockDeleteWhere };
const insertChain = { values: mockInsertValues };

// Fake page rows returned by tx.select().from().where().limit()
let fakeFromRows: { id: string }[] = [];
let fakeAllPageRows: { id: string; path: string }[] = [];

const mockLimit = vi.fn(() => Promise.resolve(fakeFromRows));
const mockSelectWhere = vi.fn().mockReturnThis();
const mockSelectFrom = vi.fn().mockReturnThis();

// We need two different .where() behaviours depending on whether .limit() is called.
// Use a counter to differentiate the two select calls inside projectLinks.
let selectCallCount = 0;
const mockSelect = vi.fn(() => {
  selectCallCount++;
  const callIndex = selectCallCount;
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue(
        callIndex === 1
          // First select: fromPageId lookup → returns limit()
          ? { limit: vi.fn(() => Promise.resolve(fakeFromRows)) }
          // Second select: all workspace pages → returns the rows directly
          : Promise.resolve(fakeAllPageRows),
      ),
    }),
  };
});

vi.mock("@jarvis/db/client", () => ({
  db: {},
}));

vi.mock("@jarvis/db/schema/wiki-page-index", () => ({
  wikiPageIndex: {
    id: "id",
    workspaceId: "workspace_id",
    path: "path",
  },
}));

vi.mock("@jarvis/db/schema/wiki-page-link", () => ({
  wikiPageLink: {
    fromPageId: "from_page_id",
    kind: "kind",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ type: "and", args })),
  eq: vi.fn((col: unknown, val: unknown) => ({ type: "eq", col, val })),
  inArray: vi.fn((col: unknown, vals: unknown) => ({ type: "inArray", col, vals })),
}));

// ── Mock @jarvis/wiki-fs ──────────────────────────────────────────────────
vi.mock("@jarvis/wiki-fs", () => ({
  parseWikilinks: vi.fn((body: string) => {
    // Simple inline parser for testing: extract [[target]] or [[target|alias]] or [[target#anchor]]
    const regex = /\[\[([^\]]+)\]\]/g;
    const results: { target: string; alias?: string; anchor?: string; raw: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(body)) !== null) {
      const inner = m[1]!;
      let rest = inner;
      let alias: string | undefined;
      let anchor: string | undefined;
      const pipeIdx = rest.indexOf("|");
      if (pipeIdx !== -1) {
        alias = rest.slice(pipeIdx + 1).trim() || undefined;
        rest = rest.slice(0, pipeIdx).trim();
      }
      const hashIdx = rest.indexOf("#");
      if (hashIdx !== -1) {
        anchor = rest.slice(hashIdx + 1).trim() || undefined;
        rest = rest.slice(0, hashIdx).trim();
      }
      const target = rest.trim();
      if (target) results.push({ target, alias, anchor, raw: m[0]! });
    }
    return results;
  }),
}));

// ── Import unit under test ────────────────────────────────────────────────
// Imported after mocks are set up.
import { projectLinks } from "../projection.js";

// ── Helper: build a mock tx ───────────────────────────────────────────────

function buildTx() {
  selectCallCount = 0;

  const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
  const insertOnConflict = vi.fn().mockResolvedValue(undefined);
  const insertValuesMock = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflict });
  const deleteMock = vi.fn().mockReturnValue({ where: deleteWhereMock });
  const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

  let selectIdx = 0;
  const selectMock = vi.fn(() => {
    selectIdx++;
    const idx = selectIdx;
    return {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(
          idx === 1
            ? { limit: vi.fn().mockResolvedValue(fakeFromRows) }
            : Promise.resolve(fakeAllPageRows),
        ),
      }),
    };
  });

  return {
    select: selectMock,
    delete: deleteMock,
    insert: insertMock,
    _deleteWhere: deleteWhereMock,
    _insertValues: insertValuesMock,
    _insertOnConflict: insertOnConflict,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("projectLinks()", () => {
  beforeEach(() => {
    fakeFromRows = [];
    fakeAllPageRows = [];
  });

  it("no-op when fromPage not found in index", async () => {
    fakeFromRows = []; // page not in DB
    const tx = buildTx();

    await projectLinks(tx as never, {
      workspaceId: "ws1",
      sourcePath: "wiki/ws1/manual/foo.md",
      body: "[[bar]]",
    });

    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("body with [[foo]] and [[bar]] → DELETE then INSERT 2 rows", async () => {
    fakeFromRows = [{ id: "uuid-source" }];
    fakeAllPageRows = [
      { id: "uuid-source", path: "wiki/ws1/manual/source.md" },
      { id: "uuid-foo", path: "wiki/ws1/foo.md" },
      { id: "uuid-bar", path: "wiki/ws1/bar.md" },
    ];

    const tx = buildTx();

    await projectLinks(tx as never, {
      workspaceId: "ws1",
      sourcePath: "wiki/ws1/manual/source.md",
      body: "See [[foo]] and [[bar]] for details.",
    });

    // DELETE must be called once
    expect(tx.delete).toHaveBeenCalledTimes(1);

    // INSERT must be called with 2 rows
    expect(tx.insert).toHaveBeenCalledTimes(1);
    const insertedValues = tx._insertValues.mock.calls[0]?.[0] as Array<{ toPath: string }>;
    expect(insertedValues).toHaveLength(2);
    const paths = insertedValues.map((r) => r.toPath);
    expect(paths).toContain("wiki/ws1/foo.md");
    expect(paths).toContain("wiki/ws1/bar.md");
  });

  it("body with 0 links → DELETE only, no INSERT", async () => {
    fakeFromRows = [{ id: "uuid-source" }];
    fakeAllPageRows = [{ id: "uuid-source", path: "wiki/ws1/manual/source.md" }];

    const tx = buildTx();

    await projectLinks(tx as never, {
      workspaceId: "ws1",
      sourcePath: "wiki/ws1/manual/source.md",
      body: "No links here at all.",
    });

    expect(tx.delete).toHaveBeenCalledTimes(1);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("duplicate [[foo]] [[foo]] → deduplicated to 1 INSERT row", async () => {
    fakeFromRows = [{ id: "uuid-source" }];
    fakeAllPageRows = [
      { id: "uuid-source", path: "wiki/ws1/manual/source.md" },
      { id: "uuid-foo", path: "wiki/ws1/foo.md" },
    ];

    const tx = buildTx();

    await projectLinks(tx as never, {
      workspaceId: "ws1",
      sourcePath: "wiki/ws1/manual/source.md",
      body: "[[foo]] again [[foo]]",
    });

    const insertedValues = tx._insertValues.mock.calls[0]?.[0] as Array<{ toPath: string }>;
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]!.toPath).toBe("wiki/ws1/foo.md");
  });

  it("workspaceId filter: toPageId resolved only from same workspace", async () => {
    fakeFromRows = [{ id: "uuid-source" }];
    // Only ws1 pages in scope — ws2 page should NOT be used.
    fakeAllPageRows = [
      { id: "uuid-source", path: "wiki/ws1/manual/source.md" },
      { id: "uuid-ws2-page", path: "wiki/ws2/somepage.md" },
    ];

    const tx = buildTx();

    await projectLinks(tx as never, {
      workspaceId: "ws1",
      sourcePath: "wiki/ws1/manual/source.md",
      body: "[[somepage]]",
    });

    // somepage resolves as wiki/ws1/somepage.md which is NOT in allPagePaths
    // → toPageId should be null (unresolved)
    const insertedValues = tx._insertValues.mock.calls[0]?.[0] as Array<{
      toPath: string;
      toPageId: string | null;
    }>;
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]!.toPageId).toBeNull();
  });

  it("all rows have kind='direct' and correct workspaceId", async () => {
    fakeFromRows = [{ id: "uuid-source" }];
    fakeAllPageRows = [
      { id: "uuid-source", path: "wiki/ws1/manual/source.md" },
      { id: "uuid-target", path: "wiki/ws1/target.md" },
    ];

    const tx = buildTx();

    await projectLinks(tx as never, {
      workspaceId: "ws1",
      sourcePath: "wiki/ws1/manual/source.md",
      body: "[[target]]",
    });

    const insertedValues = tx._insertValues.mock.calls[0]?.[0] as Array<{
      kind: string;
      workspaceId: string;
      fromPageId: string;
    }>;
    expect(insertedValues[0]!.kind).toBe("direct");
    expect(insertedValues[0]!.workspaceId).toBe("ws1");
    expect(insertedValues[0]!.fromPageId).toBe("uuid-source");
  });
});
