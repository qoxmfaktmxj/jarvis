import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  hasPermissionMock,
  getProjectDetailMock,
  updateProjectMock,
  archiveProjectMock
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  getProjectDetailMock: vi.fn(),
  updateProjectMock: vi.fn(),
  archiveProjectMock: vi.fn()
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock
}));

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: hasPermissionMock
}));

vi.mock("@/lib/queries/projects", () => ({
  getProjectDetail: getProjectDetailMock,
  updateProject: updateProjectMock,
  archiveProject: archiveProjectMock
}));

import { DELETE, GET, PUT } from "./route";

function buildRequest(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, {
    ...init,
    headers: {
      cookie: "sessionId=session-1",
      ...init?.headers
    }
  });
}

describe("/api/projects/[projectId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roles: ["MANAGER"],
      permissions: ["project:read", "project:update", "project:delete"]
    });
    hasPermissionMock.mockReturnValue(true);
  });

  it("returns 404 when the project does not exist", async () => {
    getProjectDetailMock.mockResolvedValue(null);

    const response = await GET(buildRequest("http://localhost/api/projects/project-1"), {
      params: Promise.resolve({ projectId: "project-1" })
    });

    expect(response.status).toBe(404);
  });

  it("returns project detail with summary counts", async () => {
    getProjectDetailMock.mockResolvedValue({
      id: "project-1",
      code: "P-001",
      name: "One",
      taskCount: 2,
      staffCount: 1,
      inquiryCount: 3
    });

    const response = await GET(buildRequest("http://localhost/api/projects/project-1"), {
      params: Promise.resolve({ projectId: "project-1" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        id: "project-1",
        code: "P-001",
        name: "One",
        taskCount: 2,
        staffCount: 1,
        inquiryCount: 3
      }
    });
  });

  it("returns 400 for an invalid update payload", async () => {
    const response = await PUT(
      buildRequest("http://localhost/api/projects/project-1", {
        method: "PUT",
        body: JSON.stringify({ code: "" }),
        headers: {
          "content-type": "application/json"
        }
      }),
      {
        params: Promise.resolve({ projectId: "project-1" })
      }
    );

    expect(response.status).toBe(400);
  });

  it("updates the project", async () => {
    updateProjectMock.mockResolvedValue({
      id: "project-1",
      code: "P-001",
      name: "Renamed"
    });

    const response = await PUT(
      buildRequest("http://localhost/api/projects/project-1", {
        method: "PUT",
        body: JSON.stringify({ name: "Renamed", status: "on-hold" }),
        headers: {
          "content-type": "application/json"
        }
      }),
      {
        params: Promise.resolve({ projectId: "project-1" })
      }
    );

    expect(response.status).toBe(200);
    expect(updateProjectMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      projectId: "project-1",
      input: {
        name: "Renamed",
        status: "on-hold"
      }
    });
  });

  it("archives the project on delete", async () => {
    archiveProjectMock.mockResolvedValue({ id: "project-1", status: "archived" });

    const response = await DELETE(
      buildRequest("http://localhost/api/projects/project-1", {
        method: "DELETE"
      }),
      {
        params: Promise.resolve({ projectId: "project-1" })
      }
    );

    expect(response.status).toBe(200);
    expect(archiveProjectMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      projectId: "project-1"
    });
  });
});
