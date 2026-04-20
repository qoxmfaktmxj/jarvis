import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  hasPermissionMock,
  listContractorsMock,
  createContractorMock
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  listContractorsMock: vi.fn(),
  createContractorMock: vi.fn()
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock
}));

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: hasPermissionMock
}));

vi.mock("@/lib/queries/contractors", () => ({
  listContractors: listContractorsMock,
  createContractor: createContractorMock
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

const ADMIN_SESSION = {
  id: "session-1",
  userId: "user-1",
  workspaceId: "ws-1",
  roles: ["ADMIN"],
  permissions: ["contractor:read", "contractor:admin"]
};

describe("/api/contractors GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    hasPermissionMock.mockReturnValue(true);
  });

  it("returns 401 when no session cookie exists", async () => {
    const response = await GET(new NextRequest("http://localhost/api/contractors"));
    expect(response.status).toBe(401);
  });

  it("returns 403 when permission is missing", async () => {
    hasPermissionMock.mockReturnValue(false);
    const response = await GET(buildRequest("http://localhost/api/contractors"));
    expect(response.status).toBe(403);
  });

  it("returns 400 for invalid query params", async () => {
    const response = await GET(
      buildRequest("http://localhost/api/contractors?page=0&pageSize=999")
    );
    expect(response.status).toBe(400);
  });

  it("returns paginated contractors for admin", async () => {
    listContractorsMock.mockResolvedValue({
      data: [{ userId: "user-1", name: "홍길동", contractStatus: "active" }],
      pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 }
    });

    const response = await GET(
      buildRequest("http://localhost/api/contractors?status=active")
    );
    expect(response.status).toBe(200);
  });
});

describe("/api/contractors POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    hasPermissionMock.mockReturnValue(true);
  });

  it("returns 422 for invalid body", async () => {
    const response = await POST(
      buildRequest("http://localhost/api/contractors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "" })
      })
    );
    expect(response.status).toBe(422);
  });

  it("creates a contractor and returns 201", async () => {
    createContractorMock.mockResolvedValue({
      user: { id: "new-user-1", name: "홍길동" },
      contract: { id: "contract-1", status: "active" }
    });

    const response = await POST(
      buildRequest("http://localhost/api/contractors", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "홍길동",
          employeeId: "EMP001",
          startDate: "2024-01-01",
          endDate: "2024-12-31"
        })
      })
    );
    expect(response.status).toBe(201);
  });
});
