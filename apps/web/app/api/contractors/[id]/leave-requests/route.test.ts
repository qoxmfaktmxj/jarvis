import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  hasPermissionMock,
  canAccessContractorDataMock,
  listLeaveRequestsMock,
  createLeaveRequestMock,
  getHolidaySetForRangeMock
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  canAccessContractorDataMock: vi.fn(),
  listLeaveRequestsMock: vi.fn(),
  createLeaveRequestMock: vi.fn(),
  getHolidaySetForRangeMock: vi.fn()
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock
}));

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: hasPermissionMock,
  canAccessContractorData: canAccessContractorDataMock
}));

vi.mock("@/lib/queries/contractors", () => ({
  listLeaveRequests: listLeaveRequestsMock,
  createLeaveRequest: createLeaveRequestMock
}));

vi.mock("@/lib/queries/holidays", () => ({
  getHolidaySetForRange: getHolidaySetForRangeMock
}));

import { GET, POST } from "./route";

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

describe("/api/contractors/[id]/leave-requests GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(SELF_SESSION);
    hasPermissionMock.mockReturnValue(true);
    canAccessContractorDataMock.mockReturnValue(true);
    listLeaveRequestsMock.mockResolvedValue([]);
  });

  it("returns 401 when no session cookie", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/contractors/uid-1/leave-requests"),
      ctx("uid-1")
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 when canAccessContractorData is false", async () => {
    canAccessContractorDataMock.mockReturnValue(false);
    const response = await GET(
      buildRequest("http://localhost/api/contractors/uid-1/leave-requests"),
      ctx("uid-1")
    );
    expect(response.status).toBe(403);
  });

  it("returns 200 with leave request list", async () => {
    const response = await GET(
      buildRequest("http://localhost/api/contractors/uid-1/leave-requests"),
      ctx("uid-1")
    );
    expect(response.status).toBe(200);
  });
});

describe("/api/contractors/[id]/leave-requests POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(SELF_SESSION);
    hasPermissionMock.mockReturnValue(true);
    canAccessContractorDataMock.mockReturnValue(true);
    getHolidaySetForRangeMock.mockResolvedValue(new Set());
  });

  it("returns 422 for invalid body", async () => {
    const response = await POST(
      buildRequest("http://localhost/api/contractors/uid-1/leave-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "invalid_type" })
      }),
      ctx("uid-1")
    );
    expect(response.status).toBe(422);
  });

  it("returns 409 when no active contract", async () => {
    const err = new Error("NO_ACTIVE_CONTRACT") as Error & { code: string };
    err.code = "NO_ACTIVE_CONTRACT";
    createLeaveRequestMock.mockRejectedValue(err);

    const response = await POST(
      buildRequest("http://localhost/api/contractors/uid-1/leave-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "day_off",
          startDate: "2024-03-01",
          endDate: "2024-03-01"
        })
      }),
      ctx("uid-1")
    );
    expect(response.status).toBe(409);
  });

  it("creates leave request and returns 201", async () => {
    createLeaveRequestMock.mockResolvedValue({ id: "lr-1", type: "day_off", hours: "8" });

    const response = await POST(
      buildRequest("http://localhost/api/contractors/uid-1/leave-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "day_off",
          startDate: "2024-03-01",
          endDate: "2024-03-01"
        })
      }),
      ctx("uid-1")
    );
    expect(response.status).toBe(201);
  });
});
