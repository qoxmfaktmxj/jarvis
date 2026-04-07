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
      roles: ["MANAGER"],
      permissions: ["project:read", "project:create"]
    });
    hasPermissionMock.mockReturnValue(true);
  });

  it("returns 401 when no session cookie is present", async () => {
    const response = await GET(new NextRequest("http://localhost/api/projects"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when the session lacks project read permission", async () => {
    hasPermissionMock.mockReturnValue(false);

    const response = await GET(buildRequest("http://localhost/api/projects"));

    expect(response.status).toBe(403);
  });

  it("returns 400 for invalid pagination params", async () => {
    const response = await GET(
      buildRequest("http://localhost/api/projects?page=0&limit=999")
    );

    expect(response.status).toBe(400);
  });

  it("returns paginated projects", async () => {
    listProjectsMock.mockResolvedValue({
      data: [{ id: "project-1", code: "P-001", name: "One" }],
      meta: { page: 2, limit: 10, total: 11, totalPages: 2 }
    });

    const response = await GET(
      buildRequest("http://localhost/api/projects?page=2&limit=10&q=One")
    );

    expect(response.status).toBe(200);
    expect(listProjectsMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      page: 2,
      limit: 10,
      q: "One",
      status: undefined
    });
    await expect(response.json()).resolves.toEqual({
      data: [{ id: "project-1", code: "P-001", name: "One" }],
      meta: { page: 2, limit: 10, total: 11, totalPages: 2 }
    });
  });

  it("returns 400 for an invalid create payload", async () => {
    const response = await POST(
      buildRequest("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: "" }),
        headers: {
          "content-type": "application/json"
        }
      })
    );

    expect(response.status).toBe(400);
  });

  it("creates a project and returns 201", async () => {
    createProjectMock.mockResolvedValue({
      id: "project-1",
      code: "P-001",
      name: "One"
    });

    const response = await POST(
      buildRequest("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          code: "P-001",
          name: "One",
          status: "active"
        }),
        headers: {
          "content-type": "application/json"
        }
      })
    );

    expect(response.status).toBe(201);
    expect(createProjectMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      userId: "user-1",
      input: {
        code: "P-001",
        name: "One",
        status: "active"
      }
    });
  });
});
