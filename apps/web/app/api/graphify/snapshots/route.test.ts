/**
 * P1 #4 — graph snapshots 목록 API ACL 회귀 테스트.
 *
 * 기존: knowledge:read 만 요구하고 graph sensitivity 필터링이 없어서, 같은
 * workspace 내 graph snapshot 을 모든 직원이 권한 무관하게 조회 가능했음.
 * 동일 도메인의 graph file API 는 graph:read + canAccessGraphSnapshotSensitivity
 * 를 모두 검사하는데 비해 약한 ACL.
 *
 * 픽스 후 동작:
 *   1. 권한: knowledge:read → graph:read 또는 admin:all
 *   2. 결과 행 sensitivity 필터: RESTRICTED/SECRET_REF_ONLY 는 admin:all 만
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

describe("GET /api/graphify/snapshots — P1 #4 ACL", () => {
  it("graph:read 권한 없으면 requireApiSession 이 401/403 반환 → 그대로 통과", async () => {
    requireApiSessionMock.mockResolvedValue({
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    });
    const res = await GET(makeReq());
    expect(res.status).toBe(403);
    // 권한 인자가 graph:read 인지 확인
    expect(requireApiSessionMock).toHaveBeenCalledWith(expect.anything(), "graph:read");
  });

  it("graph:read 보유자: RESTRICTED/SECRET_REF_ONLY snapshot 은 응답에서 제외", async () => {
    requireApiSessionMock.mockResolvedValue({
      session: { workspaceId: "ws-1", permissions: ["graph:read"] },
    });
    dbSelectMock.mockReturnValue([
      { id: "s1", title: "Public", sensitivity: "PUBLIC" },
      { id: "s2", title: "Internal", sensitivity: "INTERNAL" },
      { id: "s3", title: "Restricted", sensitivity: "RESTRICTED" },
      { id: "s4", title: "Secret", sensitivity: "SECRET_REF_ONLY" },
    ]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as { snapshots: Array<{ id: string }> };
    const ids = body.snapshots.map((s) => s.id);
    expect(ids).toEqual(["s1", "s2"]);
  });

  it("admin:all 보유자: 전체 sensitivity 노출", async () => {
    requireApiSessionMock.mockResolvedValue({
      session: { workspaceId: "ws-1", permissions: ["admin:all"] },
    });
    dbSelectMock.mockReturnValue([
      { id: "s1", sensitivity: "PUBLIC" },
      { id: "s3", sensitivity: "RESTRICTED" },
      { id: "s4", sensitivity: "SECRET_REF_ONLY" },
    ]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json() as { snapshots: Array<{ id: string }> };
    expect(body.snapshots.map((s) => s.id)).toEqual(["s1", "s3", "s4"]);
  });
});

// NextResponse import-after-mocks for use in the 401/403 mock
import { NextResponse } from "next/server";
