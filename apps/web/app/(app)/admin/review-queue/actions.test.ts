/**
 * P1 #5 — review-queue legacy server action RBAC 회귀 테스트.
 *
 * 기존: 세션만 확인하고 KNOWLEDGE_REVIEW/ADMIN_ALL 권한 미검증으로 일반 직원이
 * approve/reject/defer 가능했음 (권한 모델 무력화).
 *
 * 본 테스트는 권한 부족 시 forbidden 반환을, 충분 시 정상 동작을 검증한다.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSessionMock, dbUpdateMock, dbInsertMock, dbSelectMock } = vi.hoisted(
  () => ({
    getSessionMock: vi.fn(),
    dbUpdateMock: vi.fn(),
    dbInsertMock: vi.fn(),
    dbSelectMock: vi.fn(),
  })
);

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (name === "sessionId" ? { value: "sess-1" } : undefined),
  })),
  headers: vi.fn(async () => ({
    get: (name: string) => {
      if (name === "x-session-id") return "sess-1";
      if (name === "user-agent") return "vitest";
      return null;
    },
  })),
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => dbSelectMock()),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => dbUpdateMock()),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async () => dbInsertMock()),
    })),
  },
}));

vi.mock("@jarvis/db/schema", () => ({
  reviewRequest: { id: "id", workspaceId: "workspace_id" },
  auditLog: {},
}));

vi.mock("@jarvis/shared/validation", () => ({
  approveCommentSchema: { safeParse: () => ({ success: true }) },
  rejectReasonSchema: { safeParse: () => ({ success: true }) },
  deferSchema: { safeParse: () => ({ success: true }) },
}));

import { approve, reject, defer } from "./actions";

const VALID_ID = "11111111-1111-1111-1111-111111111111";

function sessionWith(permissions: string[]) {
  return {
    userId: "user-1",
    workspaceId: "ws-1",
    roles: ["VIEWER"],
    permissions,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: review request exists (so missing-permission isn't masked by 404)
  dbSelectMock.mockReturnValue([{ id: VALID_ID, workspaceId: "ws-1" }]);
  dbUpdateMock.mockReturnValue(undefined);
  dbInsertMock.mockReturnValue(undefined);
});

describe("P1 #5 — review-queue actions RBAC", () => {
  describe("권한 없는 사용자 (KNOWLEDGE_REVIEW / ADMIN_ALL 둘 다 없음)", () => {
    beforeEach(() => {
      getSessionMock.mockResolvedValue(sessionWith(["knowledge:read"]));
    });

    it("approve 거부", async () => {
      const res = await approve(VALID_ID, "looks good");
      expect(res.ok).toBe(false);
      expect(res.error).toBe("forbidden");
      expect(dbUpdateMock).not.toHaveBeenCalled();
    });

    it("reject 거부", async () => {
      const res = await reject(VALID_ID, "no");
      expect(res.ok).toBe(false);
      expect(res.error).toBe("forbidden");
      expect(dbUpdateMock).not.toHaveBeenCalled();
    });

    it("defer 거부", async () => {
      const res = await defer(VALID_ID);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("forbidden");
      expect(dbUpdateMock).not.toHaveBeenCalled();
    });
  });

  describe("KNOWLEDGE_REVIEW 권한 보유", () => {
    beforeEach(() => {
      getSessionMock.mockResolvedValue(sessionWith(["knowledge:review"]));
    });

    it("approve 허용", async () => {
      const res = await approve(VALID_ID, "ok");
      expect(res.ok).toBe(true);
      expect(dbUpdateMock).toHaveBeenCalledTimes(1);
    });

    it("reject 허용", async () => {
      const res = await reject(VALID_ID, "needs work");
      expect(res.ok).toBe(true);
      expect(dbUpdateMock).toHaveBeenCalledTimes(1);
    });

    it("defer 허용", async () => {
      const res = await defer(VALID_ID);
      expect(res.ok).toBe(true);
      expect(dbUpdateMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("ADMIN_ALL 권한 보유 (관리자 오버라이드)", () => {
    beforeEach(() => {
      getSessionMock.mockResolvedValue(sessionWith(["admin:all"]));
    });

    it("approve 허용", async () => {
      const res = await approve(VALID_ID);
      expect(res.ok).toBe(true);
      expect(dbUpdateMock).toHaveBeenCalledTimes(1);
    });

    it("reject 허용", async () => {
      const res = await reject(VALID_ID, "no");
      expect(res.ok).toBe(true);
      expect(dbUpdateMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("세션 자체가 없을 때", () => {
    beforeEach(() => {
      getSessionMock.mockResolvedValue(null);
    });

    it("approve → Unauthorized", async () => {
      const res = await approve(VALID_ID);
      expect(res.ok).toBe(false);
      expect(res.error).toBe("Unauthorized");
    });
  });
});
