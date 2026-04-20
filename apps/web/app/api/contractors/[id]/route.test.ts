import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getSessionMock,
  hasPermissionMock,
  canAccessContractorDataMock,
  getContractorByIdMock,
  terminateContractMock
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  hasPermissionMock: vi.fn(),
  canAccessContractorDataMock: vi.fn(),
  getContractorByIdMock: vi.fn(),
  terminateContractMock: vi.fn()
}));

vi.mock("@jarvis/auth/session", () => ({
  getSession: getSessionMock
}));

vi.mock("@jarvis/auth/rbac", () => ({
  hasPermission: hasPermissionMock,
  canAccessContractorData: canAccessContractorDataMock
}));

vi.mock("@/lib/queries/contractors", () => ({
  getContractorById: getContractorByIdMock,
  terminateContract: terminateContractMock
}));

import { GET, DELETE } from "./route";

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

describe("/api/contractors/[id] GET", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    hasPermissionMock.mockReturnValue(true);
    canAccessContractorDataMock.mockReturnValue(true);
  });

  it("returns 401 when no session cookie", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/contractors/uid-1"),
      ctx("uid-1")
    );
    expect(response.status).toBe(401);
  });

  it("returns 403 when canAccessContractorData is false", async () => {
    canAccessContractorDataMock.mockReturnValue(false);
    const response = await GET(
      buildRequest("http://localhost/api/contractors/uid-1"),
      ctx("uid-1")
    );
    expect(response.status).toBe(403);
  });

  it("returns 404 when contractor not found", async () => {
    getContractorByIdMock.mockResolvedValue(null);
    const response = await GET(
      buildRequest("http://localhost/api/contractors/uid-1"),
      ctx("uid-1")
    );
    expect(response.status).toBe(404);
  });

  it("returns 200 with contractor detail", async () => {
    getContractorByIdMock.mockResolvedValue({
      user: { id: "uid-1", name: "홍길동" },
      contracts: [],
      activeContract: null,
      leaves: []
    });
    const response = await GET(
      buildRequest("http://localhost/api/contractors/uid-1"),
      ctx("uid-1")
    );
    expect(response.status).toBe(200);
  });
});

describe("/api/contractors/[id] DELETE", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(ADMIN_SESSION);
    hasPermissionMock.mockReturnValue(true);
  });

  it("returns 404 when no active contract", async () => {
    getContractorByIdMock.mockResolvedValue({
      user: { id: "uid-1" },
      contracts: [],
      activeContract: null,
      leaves: []
    });
    const response = await DELETE(
      buildRequest("http://localhost/api/contractors/uid-1", { method: "DELETE" }),
      ctx("uid-1")
    );
    expect(response.status).toBe(404);
  });

  it("terminates active contract and returns 200", async () => {
    getContractorByIdMock.mockResolvedValue({
      user: { id: "uid-1" },
      contracts: [{ id: "contract-1", status: "active" }],
      activeContract: { id: "contract-1", status: "active" },
      leaves: []
    });
    terminateContractMock.mockResolvedValue({ id: "contract-1", status: "terminated" });

    const response = await DELETE(
      buildRequest("http://localhost/api/contractors/uid-1", { method: "DELETE" }),
      ctx("uid-1")
    );
    expect(response.status).toBe(200);
  });
});
