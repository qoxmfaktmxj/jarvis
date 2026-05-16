/**
 * owner check 회귀 테스트 — /api/knowledge/[pageId] PUT / DELETE
 *
 * 정책:
 *  - KNOWLEDGE_ADMIN + 본인 작성 페이지 → 허용
 *  - KNOWLEDGE_ADMIN + 타인 작성 페이지 → 403 Forbidden: not owner
 *  - KNOWLEDGE_ADMIN + 타인 작성 페이지 + ADMIN_ALL → 허용 (슈퍼어드민 우회)
 *  - NOT_FOUND → 404
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const OWNER_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const OTHER_ID = "bbbbbbbb-0000-0000-0000-000000000002";
const PAGE_ID = "cccccccc-0000-0000-0000-000000000003";
const WS_ID = "dddddddd-0000-0000-0000-000000000004";

// ── hoisted mocks ─────────────────────────────────────────────────────────────
const {
  requireApiSessionMock,
  selectReturnMock,
  txSelectMock,
  txInsertReturnMock,
  txUpdateReturnMock,
  dbDeleteMock,
} = vi.hoisted(() => ({
  requireApiSessionMock: vi.fn(),
  selectReturnMock: vi.fn(),
  txSelectMock: vi.fn(),
  txInsertReturnMock: vi.fn(),
  txUpdateReturnMock: vi.fn(),
  dbDeleteMock: vi.fn(),
}));

vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => selectReturnMock()),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => dbDeleteMock()),
    })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: vi.fn(() => ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => txSelectMock()),
            })),
          })),
        })),
        insert: vi.fn(() => ({
          values: vi.fn(() => ({
            returning: vi.fn(async () => txInsertReturnMock()),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn(async () => txUpdateReturnMock()),
            })),
          })),
        })),
      };
      return fn(tx);
    }),
  },
}));

vi.mock("@jarvis/db/schema/knowledge", () => ({
  knowledgePage: { id: "id", workspaceId: "workspace_id" },
  knowledgePageVersion: { pageId: "page_id", versionNumber: "version_number" },
  knowledgePageOwner: { pageId: "page_id", userId: "user_id" },
}));

vi.mock("@/lib/server/api-auth", () => ({
  requireApiSession: requireApiSessionMock,
}));

vi.mock("@/lib/queries/knowledge", () => ({
  getKnowledgePage: vi.fn(),
}));

vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<typeof import("drizzle-orm")>("drizzle-orm");
  return {
    ...actual,
    and: vi.fn((...args: unknown[]) => args),
    eq: vi.fn((a: unknown, b: unknown) => ({ a, b })),
    max: vi.fn(),
  };
});

import { PUT, DELETE } from "./route";

// ── helpers ───────────────────────────────────────────────────────────────────
function makeRequest(method: string, body?: unknown) {
  return new NextRequest(`http://localhost/api/knowledge/${PAGE_ID}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function sessionWith(userId: string, permissions: string[]) {
  return { userId, workspaceId: WS_ID, roles: ["MEMBER"], permissions };
}

function pageOwnedBy(createdBy: string | null) {
  return {
    id: PAGE_ID,
    workspaceId: WS_ID,
    createdBy,
    publishStatus: "draft",
    title: "Test Page",
  };
}

function paramsOf(pageId = PAGE_ID) {
  return { params: Promise.resolve({ pageId }) };
}

const VALID_BODY = { mdxContent: "# Hello", title: "Test" };

beforeEach(() => {
  vi.clearAllMocks();
  txSelectMock.mockReturnValue([{ maxVer: 0 }]);
  txInsertReturnMock.mockReturnValue([{
    id: "ver-1",
    pageId: PAGE_ID,
    versionNumber: 1,
    title: "Test",
    mdxContent: "# Hello",
    frontmatter: {},
    changeNote: "Version 1",
    authorId: OWNER_ID,
    createdAt: new Date(),
  }]);
  txUpdateReturnMock.mockReturnValue([{ id: PAGE_ID }]);
  dbDeleteMock.mockReturnValue(undefined);
});

// ─────────────────────────────────────────────────────────────────────────────
describe("PUT /api/knowledge/[pageId] — owner check", () => {
  it("본인 작성 페이지 → 200 허용", async () => {
    requireApiSessionMock.mockResolvedValue({ session: sessionWith(OWNER_ID, ["knowledge:admin"]) });
    selectReturnMock.mockReturnValue([pageOwnedBy(OWNER_ID)]);

    const res = await PUT(makeRequest("PUT", VALID_BODY), paramsOf());
    expect(res.status).toBe(200);
  });

  it("타인 작성 페이지 → 403", async () => {
    requireApiSessionMock.mockResolvedValue({ session: sessionWith(OWNER_ID, ["knowledge:admin"]) });
    // 첫 호출: page lookup → OTHER 작성. 둘째 호출: knowledge_page_owner 조회 → empty.
    selectReturnMock
      .mockReturnValueOnce([pageOwnedBy(OTHER_ID)])
      .mockReturnValueOnce([]);

    const res = await PUT(makeRequest("PUT", VALID_BODY), paramsOf());
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("not owner");
  });

  it("타인 작성 페이지 + ADMIN_ALL → 200 허용", async () => {
    requireApiSessionMock.mockResolvedValue({
      session: sessionWith(OWNER_ID, ["knowledge:admin", "admin:all"]),
    });
    // ADMIN_ALL 보유 → owner check 우회 → 두 번째 호출 없음.
    selectReturnMock.mockReturnValue([pageOwnedBy(OTHER_ID)]);

    const res = await PUT(makeRequest("PUT", VALID_BODY), paramsOf());
    expect(res.status).toBe(200);
  });

  it("페이지 미존재 → 404", async () => {
    requireApiSessionMock.mockResolvedValue({ session: sessionWith(OWNER_ID, ["knowledge:admin"]) });
    selectReturnMock.mockReturnValue([]);

    const res = await PUT(makeRequest("PUT", VALID_BODY), paramsOf());
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("DELETE /api/knowledge/[pageId] — owner check", () => {
  it("본인 작성 페이지 → 204 허용", async () => {
    requireApiSessionMock.mockResolvedValue({ session: sessionWith(OWNER_ID, ["knowledge:admin"]) });
    selectReturnMock.mockReturnValue([pageOwnedBy(OWNER_ID)]);

    const res = await DELETE(makeRequest("DELETE"), paramsOf());
    expect(res.status).toBe(204);
  });

  it("타인 작성 페이지 → 403", async () => {
    requireApiSessionMock.mockResolvedValue({ session: sessionWith(OWNER_ID, ["knowledge:admin"]) });
    // 첫 호출: page lookup → OTHER 작성. 둘째 호출: knowledge_page_owner 조회 → empty.
    selectReturnMock
      .mockReturnValueOnce([pageOwnedBy(OTHER_ID)])
      .mockReturnValueOnce([]);

    const res = await DELETE(makeRequest("DELETE"), paramsOf());
    expect(res.status).toBe(403);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("not owner");
  });

  it("타인 작성 페이지 + ADMIN_ALL → 204 허용", async () => {
    requireApiSessionMock.mockResolvedValue({
      session: sessionWith(OWNER_ID, ["knowledge:admin", "admin:all"]),
    });
    // ADMIN_ALL 보유 → owner check 우회 → 두 번째 호출 없음.
    selectReturnMock.mockReturnValue([pageOwnedBy(OTHER_ID)]);

    const res = await DELETE(makeRequest("DELETE"), paramsOf());
    expect(res.status).toBe(204);
  });

  it("페이지 미존재 → 404", async () => {
    requireApiSessionMock.mockResolvedValue({ session: sessionWith(OWNER_ID, ["knowledge:admin"]) });
    selectReturnMock.mockReturnValue([]);

    const res = await DELETE(makeRequest("DELETE"), paramsOf());
    expect(res.status).toBe(404);
  });
});
