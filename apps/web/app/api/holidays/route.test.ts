import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  hasPermissionMock,
  listHolidaysMock,
  createHolidayMock
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  listHolidaysMock: vi.fn(),
  createHolidayMock: vi.fn()
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock
}));

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: hasPermissionMock
}));

vi.mock("@/lib/queries/holidays", () => ({
  listHolidays: listHolidaysMock,
  createHoliday: createHolidayMock
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

describe("/api/holidays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      workspaceId: "ws-1",
      roles: ["ADMIN"],
      permissions: ["contractor:read", "contractor:admin"]
    });
    hasPermissionMock.mockReturnValue(true);
  });

  it("returns 401 when no session cookie exists", async () => {
    const response = await GET(new NextRequest("http://localhost/api/holidays"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when permission is missing", async () => {
    hasPermissionMock.mockReturnValue(false);

    const response = await GET(buildRequest("http://localhost/api/holidays"));

    expect(response.status).toBe(403);
  });

  it("returns holiday list with 200", async () => {
    listHolidaysMock.mockResolvedValue([
      { id: "h-1", date: "2025-01-01", name: "New Year" }
    ]);

    const response = await GET(buildRequest("http://localhost/api/holidays?year=2025"));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data).toHaveLength(1);
  });

  it("returns 400 for invalid year query param", async () => {
    const response = await GET(
      buildRequest("http://localhost/api/holidays?year=abc")
    );

    expect(response.status).toBe(400);
  });

  it("creates a holiday and returns 201", async () => {
    createHolidayMock.mockResolvedValue({
      id: "h-2",
      date: "2025-03-01",
      name: "Independence Day"
    });

    const response = await POST(
      buildRequest("http://localhost/api/holidays", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: "2025-03-01", name: "Independence Day" })
      })
    );

    expect(response.status).toBe(201);
  });

  it("returns 403 when CONTRACTOR_ADMIN permission is missing for POST", async () => {
    hasPermissionMock.mockReturnValue(false);

    const response = await POST(
      buildRequest("http://localhost/api/holidays", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: "2025-03-01", name: "Independence Day" })
      })
    );

    expect(response.status).toBe(403);
  });

  it("returns 409 on duplicate date", async () => {
    createHolidayMock.mockRejectedValue(new Error("unique constraint violation"));

    const response = await POST(
      buildRequest("http://localhost/api/holidays", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: "2025-01-01", name: "New Year" })
      })
    );

    expect(response.status).toBe(409);
    const json = await response.json();
    expect(json.error).toBe("duplicate");
  });

  it("returns 400 for invalid POST body", async () => {
    const response = await POST(
      buildRequest("http://localhost/api/holidays", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: "not-a-date", name: "" })
      })
    );

    expect(response.status).toBe(400);
  });
});
