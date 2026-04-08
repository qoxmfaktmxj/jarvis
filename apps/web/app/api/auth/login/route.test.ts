import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getOidcConfigMock,
  randomPKCECodeVerifierMock,
  calculatePKCECodeChallengeMock,
  randomStateMock,
  randomNonceMock,
  buildAuthorizationUrlMock
} = vi.hoisted(() => ({
  getOidcConfigMock: vi.fn(),
  randomPKCECodeVerifierMock: vi.fn(),
  calculatePKCECodeChallengeMock: vi.fn(),
  randomStateMock: vi.fn(),
  randomNonceMock: vi.fn(),
  buildAuthorizationUrlMock: vi.fn()
}));

vi.mock("@jarvis/auth/oidc", () => ({
  getOidcConfig: getOidcConfigMock,
  oidcClient: {
    randomPKCECodeVerifier: randomPKCECodeVerifierMock,
    calculatePKCECodeChallenge: calculatePKCECodeChallengeMock,
    randomState: randomStateMock,
    randomNonce: randomNonceMock,
    buildAuthorizationUrl: buildAuthorizationUrlMock
  }
}));

import { GET } from "./route";

describe("/api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXTAUTH_URL = "http://localhost:3010";

    getOidcConfigMock.mockResolvedValue({ issuer: "http://127.0.0.1:18080/realms/jarvis" });
    randomPKCECodeVerifierMock.mockReturnValue("verifier");
    calculatePKCECodeChallengeMock.mockResolvedValue("challenge");
    randomStateMock.mockReturnValue("state-1");
    randomNonceMock.mockReturnValue("nonce-1");
    buildAuthorizationUrlMock.mockReturnValue(new URL("http://127.0.0.1:18080/auth"));
  });

  it("builds callback redirect_uri from the incoming request origin", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3120/api/auth/login?redirect=%2Fdashboard")
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://127.0.0.1:18080/auth");
    expect(buildAuthorizationUrlMock).toHaveBeenCalledWith(
      { issuer: "http://127.0.0.1:18080/realms/jarvis" },
      expect.objectContaining({
        redirect_uri: "http://localhost:3120/api/auth/callback",
        state: "state-1",
        nonce: "nonce-1",
        code_challenge: "challenge",
        code_challenge_method: "S256"
      })
    );
  });
});
