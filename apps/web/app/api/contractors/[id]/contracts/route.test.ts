import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  hasPermissionMock,
  getContractorByIdMock,
  renewContractMock,
  updateContractMock
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  getContractorByIdMock: vi.fn(),
  renewContractMock: vi.fn(),
  updateContractMock: vi.fn()
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock
}));

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: hasPermissionMock
}));

vi.mock("@/lib/queries/contractors", () => ({
  getContractorById: getContractorByIdMock,
  renewContract: renewContractMock,
  updateContract: updateContractMock
}));

import { POST, PATCH } from "./route";

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

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("/api/contractors/[id]/contracts POST (renew)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    hasPermissionMock.mockReturnValue(true);
  });

  it("returns 401 when no session cookie", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/contractors/00000000-0000-0000-0000-000000000001/contracts", {
        method: "POST"
      }),
      ctx("00000000-0000-0000-0000-000000000001")
    );
    expect(response.status).toBe(401);
  });

  it("returns 422 for invalid body", async () => {
    const response = await POST(
      buildRequest("http://localhost/api/contractors/00000000-0000-0000-0000-000000000001/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate: "not-a-date" })
      }),
      ctx("00000000-0000-0000-0000-000000000001")
    );
    expect(response.status).toBe(422);
  });

  it("returns 404 when no active contract", async () => {
    getContractorByIdMock.mockResolvedValue({
      user: { id: "00000000-0000-0000-0000-000000000001" },
      activeContract: null
    });

    const response = await POST(
      buildRequest("http://localhost/api/contractors/00000000-0000-0000-0000-000000000001/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate: "2025-01-01", endDate: "2025-12-31" })
      }),
      ctx("00000000-0000-0000-0000-000000000001")
    );
    expect(response.status).toBe(404);
  });

  it("renews contract and returns 201", async () => {
    getContractorByIdMock.mockResolvedValue({
      user: { id: "00000000-0000-0000-0000-000000000001" },
      activeContract: { id: "contract-1", status: "active" }
    });
    renewContractMock.mockResolvedValue({ id: "contract-2", status: "active" });

    const response = await POST(
      buildRequest("http://localhost/api/contractors/00000000-0000-0000-0000-000000000001/contracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startDate: "2025-01-01", endDate: "2025-12-31" })
      }),
      ctx("00000000-0000-0000-0000-000000000001")
    );
    expect(response.status).toBe(201);
  });
});

describe("/api/contractors/[id]/contracts PATCH (update)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    hasPermissionMock.mockReturnValue(true);
  });

  it("returns 404 when no active contract", async () => {
    getContractorByIdMock.mockResolvedValue({
      user: { id: "00000000-0000-0000-0000-000000000001" },
      activeContract: null
    });

    const response = await PATCH(
      buildRequest("http://localhost/api/contractors/00000000-0000-0000-0000-000000000001/contracts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ additionalLeaveHours: 8 })
      }),
      ctx("00000000-0000-0000-0000-000000000001")
    );
    expect(response.status).toBe(404);
  });

  it("updates contract and returns 200", async () => {
    getContractorByIdMock.mockResolvedValue({
      user: { id: "00000000-0000-0000-0000-000000000001" },
      activeContract: { id: "contract-1", status: "active" }
    });
    updateContractMock.mockResolvedValue({ id: "contract-1", additionalLeaveHours: "8" });

    const response = await PATCH(
      buildRequest("http://localhost/api/contractors/00000000-0000-0000-0000-000000000001/contracts", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ additionalLeaveHours: 8 })
      }),
      ctx("00000000-0000-0000-0000-000000000001")
    );
    expect(response.status).toBe(200);
  });
});
