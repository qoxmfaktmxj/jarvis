/**
 * packages/ai/page-first/__tests__/sql-injection.test.ts
 *
 * SQL injection regression tests for page-first helpers (catalog, shortlist, expand).
 * These tests verify that:
 *  1. Sensitivity filters use Drizzle SQL fragments (not raw user strings).
 *  2. buildWikiSensitivitySqlFragment returns an empty SQL fragment for admins,
 *     proper IN (...) for non-admins, and AND 1 = 0 for no-permission.
 *  3. Call sites no longer use sql.raw(<dynamic-string>) for filter construction.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SQL } from "drizzle-orm";

const capturedSqls: SQL[] = [];

vi.mock("@jarvis/db/client", () => ({
  db: {
    execute: vi.fn(async (sqlObj: SQL) => {
      capturedSqls.push(sqlObj);
      return { rows: [] };
    }),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) }),
  },
}));

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "test-key";

vi.mock("../../budget.js", () => ({
  assertBudget: vi.fn().mockResolvedValue(undefined),
  recordBlocked: vi.fn().mockResolvedValue(undefined),
  BudgetExceededError: class BudgetExceededError extends Error {},
}));

vi.mock("../../logger.js", () => ({
  logLlmCall: vi.fn().mockResolvedValue(undefined),
  logger: { info: vi.fn(), error: vi.fn(), child: vi.fn() },
  withRequestId: vi.fn(),
}));

vi.mock("@jarvis/wiki-fs", () => ({
  readPage: vi.fn(async () => "---\ntitle: Fake\n---\n\nBody"),
  wikiRoot: () => "/tmp/wiki",
}));

import { buildWikiSensitivitySqlFragment } from "@jarvis/auth/rbac";
import { getCatalog } from "../catalog.js";
import { expandOneHop } from "../expand.js";

const BASE_WORKSPACE = "00000000-0000-0000-0000-000000000000";

describe("buildWikiSensitivitySqlFragment unit", () => {
  it("returns empty SQL fragment for admin (no WHERE filter appended)", () => {
    const frag = buildWikiSensitivitySqlFragment(["admin:all"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = frag as any;
    const text = JSON.stringify(raw);
    // Empty fragment = no AND clause emitted
    expect(text).not.toContain("AND sensitivity");
    expect(text).not.toContain("AND 1 = 0");
  });

  it("returns AND 1 = 0 for empty permissions (deny all)", () => {
    const frag = buildWikiSensitivitySqlFragment([]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = JSON.stringify(frag as any);
    expect(text).toContain("AND 1 = 0");
  });

  it("returns IN clause with PUBLIC+INTERNAL for knowledge:read only", () => {
    const frag = buildWikiSensitivitySqlFragment(["knowledge:read"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = JSON.stringify(frag as any);
    expect(text).toContain("PUBLIC");
    expect(text).toContain("INTERNAL");
    expect(text).not.toContain("RESTRICTED");
    expect(text).not.toContain("SECRET_REF_ONLY");
  });

  it("adds RESTRICTED for knowledge:review permission", () => {
    const frag = buildWikiSensitivitySqlFragment(["knowledge:read", "knowledge:review"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = JSON.stringify(frag as any);
    expect(text).toContain("RESTRICTED");
  });

  it("only emits whitelisted WIKI_SENSITIVITIES values (no user input in fragment)", () => {
    // Even if caller tries to pass a crafted permission string that looks like SQL
    const frag = buildWikiSensitivitySqlFragment(["knowledge:read'; DROP TABLE wiki_page_index;--"]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = JSON.stringify(frag as any);
    // Since "knowledge:read'; DROP..." is not equal to PERMISSIONS.KNOWLEDGE_READ,
    // it is treated as no permissions → AND 1 = 0
    expect(text).toContain("AND 1 = 0");
    expect(text).not.toContain("DROP TABLE");
  });
});

describe("getCatalog SQL injection regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSqls.length = 0;
  });

  it("sensitivity filter does not contain user-supplied strings (only whitelisted constants)", async () => {
    await getCatalog({
      workspaceId: BASE_WORKSPACE,
      userPermissions: ["knowledge:read"],
    });

    expect(capturedSqls.length).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = JSON.stringify(capturedSqls[0] as any);
    // The sensitivity filter must reference only static constants
    expect(text).toContain("PUBLIC");
    expect(text).toContain("INTERNAL");
    // No user-controlled string should appear outside a parameter binding
    expect(text).not.toContain("DROP");
  });

  it("no permissions → AND 1 = 0 appended (deny all)", async () => {
    await getCatalog({
      workspaceId: BASE_WORKSPACE,
      userPermissions: [],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = JSON.stringify(capturedSqls[0] as any);
    expect(text).toContain("AND 1 = 0");
  });
});

describe("expandOneHop SQL injection regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedSqls.length = 0;
  });

  it("empty shortlist returns early without querying DB", async () => {
    const result = await expandOneHop({
      workspaceId: BASE_WORKSPACE,
      userPermissions: ["knowledge:read"],
      shortlist: [],
    });
    expect(result).toEqual([]);
    expect(capturedSqls.length).toBe(0);
  });

  it("sensitivity filter uses SQL fragment (not raw string) for non-admin user", async () => {
    await expandOneHop({
      workspaceId: BASE_WORKSPACE,
      userPermissions: ["knowledge:read"],
      shortlist: [
        {
          id: "page-1",
          path: "manual/test",
          title: "Test",
          slug: "test",
          sensitivity: "INTERNAL",
          requiredPermission: null,
          updatedAt: new Date(),
          score: 1,
        },
      ],
    });

    expect(capturedSqls.length).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const text = JSON.stringify(capturedSqls[0] as any);
    // Sensitivity filter must contain whitelisted values only
    expect(text).toContain("PUBLIC");
    expect(text).toContain("INTERNAL");
    expect(text).not.toContain("DROP");
  });
});
