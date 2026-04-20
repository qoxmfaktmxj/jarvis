import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  hasPermissionMock,
  listSystemsMock,
  createSystemMock
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  listSystemsMock: vi.fn(),
  createSystemMock: vi.fn()
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock
}));

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: hasPermissionMock
}));

vi.mock("@/lib/queries/systems", () => ({
  listSystems: listSystemsMock,
  createSystem: createSystemMock
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

describe("/api/systems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roles: ["ADMIN"],
      permissions: ["system:read", "system:create"]
    });
    hasPermissionMock.mockReturnValue(true);
  });

  it("returns 401 when no session cookie exists", async () => {
    const response = await GET(new NextRequest("http://localhost/api/systems"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when permission is missing", async () => {
    hasPermissionMock.mockReturnValue(false);

    const response = await GET(buildRequest("http://localhost/api/systems"));

    expect(response.status).toBe(403);
  });

  it("returns 400 for invalid query params", async () => {
    const response = await GET(
      buildRequest("http://localhost/api/systems?page=0&pageSize=999")
    );

    expect(response.status).toBe(400);
  });

  it("returns paginated systems", async () => {
    listSystemsMock.mockResolvedValue({
      data: [{ id: "sys-1", name: "Payroll", status: "active" }],
      pagination: {
        page: 1,
        pageSize: 20,
        total: 1,
        totalPages: 1
      }
    });

    const response = await GET(
      buildRequest("http://localhost/api/systems?environment=prod&q=pay")
    );

    expect(response.status).toBe(200);
    expect(listSystemsMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      category: undefined,
      environment: "prod",
      page: 1,
      pageSize: 20,
      q: "pay",
      status: undefined
    });
  });

  it("returns 422 for an invalid create payload", async () => {
    const response = await POST(
      buildRequest("http://localhost/api/systems", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ name: "" })
      })
    );

    expect(response.status).toBe(422);
  });

  it("creates a system", async () => {
    createSystemMock.mockResolvedValue({
      id: "sys-1",
      name: "Payroll"
    });

    const response = await POST(
      buildRequest("http://localhost/api/systems", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          name: "Payroll",
          environment: "prod",
          sensitivity: "INTERNAL"
        })
      })
    );

    expect(response.status).toBe(201);
    expect(createSystemMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      userId: "user-1",
      input: {
        name: "Payroll",
        environment: "prod",
        sensitivity: "INTERNAL"
      }
    });
  });
});
