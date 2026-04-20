import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  hasPermissionMock,
  canAccessContractorDataMock,
  dbSelectMock,
  updateLeaveRequestMock,
  cancelLeaveRequestMock,
  deleteLeaveRequestMock,
  getHolidaySetForRangeMock
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  canAccessContractorDataMock: vi.fn(),
  dbSelectMock: vi.fn(),
  updateLeaveRequestMock: vi.fn(),
  cancelLeaveRequestMock: vi.fn(),
  deleteLeaveRequestMock: vi.fn(),
  getHolidaySetForRangeMock: vi.fn()
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock
}));

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: hasPermissionMock,
  canAccessContractorData: canAccessContractorDataMock
}));

vi.mock("@jarvis/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ userId: "uid-1" }])
        })
      })
    })
  }
}));

vi.mock("@/lib/queries/contractors", () => ({
  updateLeaveRequest: updateLeaveRequestMock,
  cancelLeaveRequest: cancelLeaveRequestMock,
  deleteLeaveRequest: deleteLeaveRequestMock
}));

vi.mock("@/lib/queries/holidays", () => ({
  getHolidaySetForRange: getHolidaySetForRangeMock
}));

import { PATCH, DELETE } from "./route";

function buildRequest(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, {
    ...init,
    headers: {
      cookie: "sessionId=session-1",
      ...init?.headers
    }
  });
}

const SELF_SESSION = {
  id: "session-1",
  userId: "uid-1",
  workspaceId: "ws-1",
  roles: ["DEVELOPER"],
  permissions: ["contractor:read"]
};

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/leave-requests/[id] PATCH", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(SELF_SESSION);
    hasPermissionMock.mockReturnValue(true);
    canAccessContractorDataMock.mockReturnValue(true);
    getHolidaySetForRangeMock.mockResolvedValue(new Set());
  });

  it("returns 401 when no session cookie", async () => {
    const response = await PATCH(
      new NextRequest("http://localhost/api/leave-requests/lr-1", { method: "PATCH" }),
      ctx("lr-1")
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 when canAccessContractorData is false", async () => {
    canAccessContractorDataMock.mockReturnValue(false);
    const response = await PATCH(
      buildRequest("http://localhost/api/leave-requests/lr-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "updated" })
      }),
      ctx("lr-1")
    );
    expect(response.status).toBe(403);
  });

  it("updates leave request and returns 200", async () => {
    updateLeaveRequestMock.mockResolvedValue({ id: "lr-1", reason: "updated" });

    const response = await PATCH(
      buildRequest("http://localhost/api/leave-requests/lr-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "updated" })
      }),
      ctx("lr-1")
    );
    expect(response.status).toBe(200);
  });
});

describe("/api/leave-requests/[id] DELETE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(SELF_SESSION);
    hasPermissionMock.mockReturnValue(true);
    canAccessContractorDataMock.mockReturnValue(true);
    cancelLeaveRequestMock.mockResolvedValue({ id: "lr-1", status: "cancelled" });
  });

  it("returns 401 when no session cookie", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost/api/leave-requests/lr-1", { method: "DELETE" }),
      ctx("lr-1")
    );
    expect(response.status).toBe(401);
  });

  it("cancels leave request (soft delete) and returns 200", async () => {
    const response = await DELETE(
      buildRequest("http://localhost/api/leave-requests/lr-1", { method: "DELETE" }),
      ctx("lr-1")
    );
    expect(response.status).toBe(200);
  });
});
