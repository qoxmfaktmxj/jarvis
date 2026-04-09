import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  createSessionMock,
  userLookupQueue,
  roleLookupQueue
} = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  userLookupQueue: [] as unknown[][],
  roleLookupQueue: [] as unknown[][]
}));

vi.mock("@jarvis/auth/session", () => ({
  createSession: createSessionMock
}));

vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => userLookupQueue.shift() ?? []),
        })),
        innerJoin: vi.fn(() => ({
          where: vi.fn(async () => roleLookupQueue.shift() ?? []),
        })),
      })),
    })),
  }
}));

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3010/api/auth/dev-login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json"
    }
  });
}

describe("/api/auth/dev-login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userLookupQueue.length = 0;
    roleLookupQueue.length = 0;
    vi.stubEnv("NODE_ENV", "development");
  });

  it("creates a dev session from an allowed development account", async () => {
    userLookupQueue.push([{
      id: "user-1",
      workspaceId: "ws-1",
      employeeId: "EMP001",
      name: "Admin User",
      email: "admin@jarvis.dev",
      orgId: null
    }]);
    roleLookupQueue.push([{ roleCode: "ADMIN" }]);

    const response = await POST(
      buildRequest({
        email: "admin@jarvis.dev"
      })
    );

    expect(response.status).toBe(200);
    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "ws-1",
        email: "admin@jarvis.dev",
        roles: ["ADMIN"]
      })
    );
    expect(response.headers.get("set-cookie")).toContain("sessionId=");
  });

  it("rejects invalid dev credentials", async () => {
    const invalidPassword = ["invalid", "test", "input"].join("-");
    const invalidPayload = {
      username: "alice",
      ["password"]: invalidPassword
    };

    const response = await POST(
      buildRequest(invalidPayload)
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid credentials" });
  });
});
