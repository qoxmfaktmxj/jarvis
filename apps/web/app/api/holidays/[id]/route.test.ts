import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  hasPermissionMock,
  updateHolidayMock,
  deleteHolidayMock
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  updateHolidayMock: vi.fn(),
  deleteHolidayMock: vi.fn()
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock
}));

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: hasPermissionMock
}));

vi.mock("@/lib/queries/holidays", () => ({
  updateHoliday: updateHolidayMock,
  deleteHoliday: deleteHolidayMock
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

const params = { params: Promise.resolve({ id: "h-1" }) };

describe("/api/holidays/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roles: ["ADMIN"],
      permissions: ["contractor:admin"]
    });
    hasPermissionMock.mockReturnValue(true);
  });

  it("returns 200 on successful PATCH", async () => {
    updateHolidayMock.mockResolvedValue({
      id: "h-1",
      date: "2025-01-01",
      name: "New Year Updated"
    });

    const response = await PATCH(
      buildRequest("http://localhost/api/holidays/h-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "New Year Updated" })
      }),
      params
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.name).toBe("New Year Updated");
  });

  it("returns 404 when holiday is not found on PATCH", async () => {
    updateHolidayMock.mockResolvedValue(null);

    const response = await PATCH(
      buildRequest("http://localhost/api/holidays/h-999", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Ghost" })
      }),
      { params: Promise.resolve({ id: "h-999" }) }
    );

    expect(response.status).toBe(404);
  });

  it("returns 400 for invalid PATCH body", async () => {
    const response = await PATCH(
      buildRequest("http://localhost/api/holidays/h-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: "not-a-date" })
      }),
      params
    );

    expect(response.status).toBe(400);
  });

  it("returns 200 on successful DELETE", async () => {
    deleteHolidayMock.mockResolvedValue({ id: "h-1" });

    const response = await DELETE(
      buildRequest("http://localhost/api/holidays/h-1", { method: "DELETE" }),
      params
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
  });

  it("returns 404 when holiday is not found on DELETE", async () => {
    deleteHolidayMock.mockResolvedValue(null);

    const response = await DELETE(
      buildRequest("http://localhost/api/holidays/h-999", { method: "DELETE" }),
      { params: Promise.resolve({ id: "h-999" }) }
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 when CONTRACTOR_ADMIN permission is missing for DELETE", async () => {
    hasPermissionMock.mockReturnValue(false);

    const response = await DELETE(
      buildRequest("http://localhost/api/holidays/h-1", { method: "DELETE" }),
      params
    );

    expect(response.status).toBe(403);
  });
});
