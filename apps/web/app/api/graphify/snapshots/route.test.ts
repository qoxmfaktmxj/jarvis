/**
 * GET /api/graphify/snapshots — 인증/권한 회귀 테스트.
 *
 * Step 2D (2026-05-11): graph_snapshot.sensitivity 컬럼 제거 (D2=B). row-level
 * sensitivity 필터링은 사라지고 RBAC + workspaceId 격리만 사용한다. 따라서:
 *   1. graph:read 권한이 없으면 requireApiSession 이 401/403 반환.
 *   2. graph:read 보유자 → workspace 의 모든 snapshot 반환 (sensitivity 필터 없음).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { requireApiSessionMock, dbSelectMock } = vi.hoisted(() => ({
  requireApiSessionMock: vi.fn(),
  dbSelectMock: vi.fn(),
}));

vi.mock("@/lib/server/api-auth", () => ({
  requireApiSession: requireApiSessionMock,
}));

vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => dbSelectMock()),
          })),
        })),
      })),
    })),
  },
}));

vi.mock("@jarvis/db/schema/graph", () => ({
  graphSnapshot: { workspaceId: "workspace_id", createdAt: "created_at" },
}));

import { GET } from "./route";

function makeReq(): NextRequest {
  return new NextRequest("http://localhost/api/graphify/snapshots");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/graphify/snapshots — Step 2D (RBAC + workspace only)", () => {
  it("graph:read 권한 없으면 requireApiSession 이 401/403 반환 → 그대로 통과", async () => {
    requireApiSessionMock.mockResolvedValue({
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
    // 권한 인자가 graph:read 인지 확인
    expect(requireApiSessionMock).toHaveBeenCalledWith(expect.anything(), "graph:read");
  });

  it("graph:read 보유자: workspace 의 모든 snapshot 반환 (sensitivity 필터 없음)", async () => {
    requireApiSessionMock.mockResolvedValue({
      session: { workspaceId: "ws-1", permissions: ["graph:read"] },
    });
    dbSelectMock.mockReturnValue([
      { id: "s1", title: "First" },
      { id: "s2", title: "Second" },
      { id: "s3", title: "Third" },
    ]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { snapshots: Array<{ id: string }> };
    expect(body.snapshots.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
  });
});

// NextResponse import-after-mocks for use in the 401/403 mock
import { NextResponse } from "next/server";
