import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  hasPermissionMock,
  listProjectsMock,
  createProjectMock
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  listProjectsMock: vi.fn(),
  createProjectMock: vi.fn()
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock
}));

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: hasPermissionMock
}));

vi.mock("@/lib/queries/projects", () => ({
  listProjects: listProjectsMock,
  createProject: createProjectMock
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

describe("/api/projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roles: ["ADMIN"],
      permissions: ["project:read", "project:create"]
    });
    hasPermissionMock.mockReturnValue(true);
  });

  it("returns 401 when no session cookie exists", async () => {
    const response = await GET(new NextRequest("http://localhost/api/projects"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when permission is missing", async () => {
    hasPermissionMock.mockReturnValue(false);

    const response = await GET(buildRequest("http://localhost/api/projects"));

    expect(response.status).toBe(403);
  });

  it("returns 400 for invalid query params", async () => {
    const response = await GET(
      buildRequest("http://localhost/api/projects?page=0&pageSize=999")
    );

    expect(response.status).toBe(400);
  });

  it("returns paginated projects", async () => {
    listProjectsMock.mockResolvedValue({
      data: [{ id: "proj-1", name: "Payroll", status: "active" }],
      pagination: {
        page: 1,
        pageSize: 50,
        total: 1,
        totalPages: 1
      }
    });

    const response = await GET(
      buildRequest("http://localhost/api/projects?q=pay&status=active")
    );

    expect(response.status).toBe(200);
  });

  it("returns 422 for an invalid create payload", async () => {
    const response = await POST(
      buildRequest("http://localhost/api/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ name: "" })
      })
    );

    expect(response.status).toBe(422);
  });

  it("creates a project", async () => {
    createProjectMock.mockResolvedValue({
      id: "proj-1",
      name: "Payroll"
    });

    const response = await POST(
      buildRequest("http://localhost/api/projects", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          companyId: "00000000-0000-0000-0000-000000000001",
          name: "Payroll",
          sensitivity: "INTERNAL"
        })
      })
    );

    expect(response.status).toBe(201);
  });
});
