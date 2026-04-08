import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getOidcConfigMock,
  authorizationCodeGrantMock,
  createSessionMock,
  userLookupQueue,
  roleLookupQueue,
  updateValues
} = vi.hoisted(() => ({
  getOidcConfigMock: vi.fn(),
  authorizationCodeGrantMock: vi.fn(),
  createSessionMock: vi.fn(),
  userLookupQueue: [] as unknown[][],
  roleLookupQueue: [] as unknown[][],
  updateValues: [] as Record<string, unknown>[]
}));

vi.mock("@jarvis/auth/oidc", () => ({
  getOidcConfig: getOidcConfigMock,
  oidcClient: {
    authorizationCodeGrant: authorizationCodeGrantMock
  }
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
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updateValues.push(values);
        return {
          where: vi.fn(async () => [])
        };
      })
    }))
  }
}));

import { GET } from "./route";

function buildRequest(cookie?: string) {
  return new NextRequest("http://localhost:3120/api/auth/callback?code=abc&state=state-1", {
    headers: cookie ? { cookie } : undefined
  });
}

describe("/api/auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userLookupQueue.length = 0;
    roleLookupQueue.length = 0;
    updateValues.length = 0;

    getOidcConfigMock.mockResolvedValue({ issuer: "http://127.0.0.1:18080/realms/jarvis" });
  });

  it("redirects with missing_oidc_cookies when verifier cookies are absent", async () => {
    const response = await GET(buildRequest());

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3120/login?error=missing_oidc_cookies"
    );
  });

  it("falls back to email lookup and backfills ssoSubject on first SSO login", async () => {
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => ({
        sub: "kc-alice-subject",
        email: "alice@jarvis.dev",
        name: "Alice Kim"
      })
    });

    userLookupQueue.push([{
      id: "user-1",
      workspaceId: "ws-1",
      employeeId: "EMP002",
      name: "Alice Kim",
      email: "alice@jarvis.dev",
      orgId: null,
      ssoSubject: null
    }]);
    roleLookupQueue.push([{ roleCode: "MANAGER" }]);

    const response = await GET(
      buildRequest("oidc_pkce=verifier; oidc_state=state-1; oidc_nonce=nonce-1; oidc_redirect=/dashboard")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3120/dashboard");
    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "ws-1",
        employeeId: "EMP002",
        email: "alice@jarvis.dev",
        roles: ["MANAGER"],
        ssoSubject: "kc-alice-subject"
      })
    );
    expect(updateValues).toContainEqual({ ssoSubject: "kc-alice-subject" });
    expect(response.headers.get("set-cookie")).toContain("sessionId=");
  });
});
