import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  hasPermissionMock,
  getProjectMock,
  updateProjectMock,
  deleteProjectMock,
  listProjectAccessEntriesMock,
  createProjectAccessMock,
  deleteProjectAccessMock
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  getProjectMock: vi.fn(),
  updateProjectMock: vi.fn(),
  deleteProjectMock: vi.fn(),
  listProjectAccessEntriesMock: vi.fn(),
  createProjectAccessMock: vi.fn(),
  deleteProjectAccessMock: vi.fn()
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock
}));

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: hasPermissionMock
}));

vi.mock("@/lib/queries/projects", () => ({
  getProject: getProjectMock,
  updateProject: updateProjectMock,
  deleteProject: deleteProjectMock,
  listProjectAccessEntries: listProjectAccessEntriesMock,
  createProjectAccess: createProjectAccessMock,
  deleteProjectAccess: deleteProjectAccessMock
}));

import { DELETE, GET, PUT } from "./route";
import {
  DELETE as DELETEAccess,
  GET as GETAccess,
  POST as POSTAccess
} from "./access/route";

function buildRequest(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, {
    ...init,
    headers: {
      cookie: "sessionId=session-1",
      ...init?.headers
    }
  });
}

const params = { params: Promise.resolve({ projectId: "proj-1" }) };

describe("/api/projects/[projectId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roles: ["ADMIN"],
      permissions: ["project:read", "project:update", "project:delete"]
    });
    hasPermissionMock.mockReturnValue(true);
  });

  it("returns 404 when the project is missing", async () => {
    getProjectMock.mockResolvedValue(null);

    const response = await GET(buildRequest("http://localhost/api/projects/proj-1"), params);

    expect(response.status).toBe(404);
  });

  it("returns the project detail", async () => {
    getProjectMock.mockResolvedValue({
      id: "proj-1",
      name: "Payroll"
    });

    const response = await GET(buildRequest("http://localhost/api/projects/proj-1"), params);

    expect(response.status).toBe(200);
  });

  it("returns 422 for invalid updates", async () => {
    const response = await PUT(
      buildRequest("http://localhost/api/projects/proj-1", {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ prodDomainUrl: "not-a-url" })
      }),
      params
    );

    expect(response.status).toBe(422);
  });

  it("updates the project", async () => {
    updateProjectMock.mockResolvedValue({ id: "proj-1", name: "Renamed" });

    const response = await PUT(
      buildRequest("http://localhost/api/projects/proj-1", {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ name: "Renamed", status: "deprecated" })
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(updateProjectMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      projectId: "proj-1",
      input: expect.objectContaining({
        name: "Renamed",
        status: "deprecated"
      })
    });
  });

  it("deletes the project", async () => {
    deleteProjectMock.mockResolvedValue({ id: "proj-1" });

    const response = await DELETE(
      buildRequest("http://localhost/api/projects/proj-1", {
        method: "DELETE"
      }),
      params
    );

    expect(response.status).toBe(204);
  });
});

describe("/api/projects/[projectId]/access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roles: ["ADMIN"],
      permissions: ["project:read", "project:update"]
    });
    hasPermissionMock.mockReturnValue(true);
  });

  it("returns resolved access entries", async () => {
    listProjectAccessEntriesMock.mockResolvedValue([
      {
        id: "acc-1",
        label: "Primary DB",
        passwordRef: {
          ref: "vault://jarvis/payroll/password",
          resolved: "secret",
          canView: true
        }
      }
    ]);

    const response = await GETAccess(
      buildRequest("http://localhost/api/projects/proj-1/access"),
      params
    );

    expect(response.status).toBe(200);
    expect(listProjectAccessEntriesMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      projectId: "proj-1",
      sessionRoles: ["ADMIN"],
      sessionPermissions: ["project:read", "project:update"]
    });
  });

  it("returns 422 for invalid access payloads", async () => {
    const response = await POSTAccess(
      buildRequest("http://localhost/api/projects/proj-1/access", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ label: "" })
      }),
      params
    );

    expect(response.status).toBe(422);
  });

  it("creates an access entry", async () => {
    createProjectAccessMock.mockResolvedValue({ id: "acc-1" });

    const response = await POSTAccess(
      buildRequest("http://localhost/api/projects/proj-1/access", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          envType: "prod",
          accessType: "db",
          label: "Primary DB",
          usernameRef: "vault://jarvis/payroll/user"
        })
      }),
      params
    );

    expect(response.status).toBe(201);
  });

  it("requires accessId for deletion", async () => {
    const response = await DELETEAccess(
      buildRequest("http://localhost/api/projects/proj-1/access", {
        method: "DELETE"
      }),
      params
    );

    expect(response.status).toBe(400);
  });
});
