import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  hasPermissionMock,
  getSystemMock,
  updateSystemMock,
  deleteSystemMock,
  listSystemAccessEntriesMock,
  createSystemAccessMock,
  deleteSystemAccessMock
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  getSystemMock: vi.fn(),
  updateSystemMock: vi.fn(),
  deleteSystemMock: vi.fn(),
  listSystemAccessEntriesMock: vi.fn(),
  createSystemAccessMock: vi.fn(),
  deleteSystemAccessMock: vi.fn()
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock
}));

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: hasPermissionMock
}));

vi.mock("@/lib/queries/systems", () => ({
  getSystem: getSystemMock,
  updateSystem: updateSystemMock,
  deleteSystem: deleteSystemMock,
  listSystemAccessEntries: listSystemAccessEntriesMock,
  createSystemAccess: createSystemAccessMock,
  deleteSystemAccess: deleteSystemAccessMock
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

const params = { params: Promise.resolve({ systemId: "sys-1" }) };

describe("/api/systems/[systemId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roles: ["ADMIN"],
      permissions: ["system:read", "system:update", "system:delete"]
    });
    hasPermissionMock.mockReturnValue(true);
  });

  it("returns 404 when the system is missing", async () => {
    getSystemMock.mockResolvedValue(null);

    const response = await GET(buildRequest("http://localhost/api/systems/sys-1"), params);

    expect(response.status).toBe(404);
  });

  it("returns the system detail", async () => {
    getSystemMock.mockResolvedValue({
      id: "sys-1",
      name: "Payroll"
    });

    const response = await GET(buildRequest("http://localhost/api/systems/sys-1"), params);

    expect(response.status).toBe(200);
  });

  it("returns 422 for invalid updates", async () => {
    const response = await PUT(
      buildRequest("http://localhost/api/systems/sys-1", {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ repositoryUrl: "not-a-url" })
      }),
      params
    );

    expect(response.status).toBe(422);
  });

  it("updates the system", async () => {
    updateSystemMock.mockResolvedValue({ id: "sys-1", name: "Renamed" });

    const response = await PUT(
      buildRequest("http://localhost/api/systems/sys-1", {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ name: "Renamed", status: "deprecated" })
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(updateSystemMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      systemId: "sys-1",
      input: {
        name: "Renamed",
        status: "deprecated"
      }
    });
  });

  it("deletes the system", async () => {
    deleteSystemMock.mockResolvedValue({ id: "sys-1" });

    const response = await DELETE(
      buildRequest("http://localhost/api/systems/sys-1", {
        method: "DELETE"
      }),
      params
    );

    expect(response.status).toBe(204);
  });
});

describe("/api/systems/[systemId]/access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roles: ["ADMIN"],
      permissions: ["system:read", "system:update"]
    });
    hasPermissionMock.mockReturnValue(true);
  });

  it("returns resolved access entries", async () => {
    listSystemAccessEntriesMock.mockResolvedValue([
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
      buildRequest("http://localhost/api/systems/sys-1/access"),
      params
    );

    expect(response.status).toBe(200);
    expect(listSystemAccessEntriesMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      systemId: "sys-1",
      sessionRoles: ["ADMIN"],
      sessionPermissions: ["system:read", "system:update"]
    });
  });

  it("returns 422 for invalid access payloads", async () => {
    const response = await POSTAccess(
      buildRequest("http://localhost/api/systems/sys-1/access", {
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
    createSystemAccessMock.mockResolvedValue({ id: "acc-1" });

    const response = await POSTAccess(
      buildRequest("http://localhost/api/systems/sys-1/access", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
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
      buildRequest("http://localhost/api/systems/sys-1/access", {
        method: "DELETE"
      }),
      params
    );

    expect(response.status).toBe(400);
  });
});
