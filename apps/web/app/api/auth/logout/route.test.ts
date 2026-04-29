import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { deleteSessionMock } = vi.hoisted(() => ({
  deleteSessionMock: vi.fn(),
}));

vi.mock("@jarvis/auth/session", () => ({
  deleteSession: deleteSessionMock,
}));

import { POST } from "./route";

function buildRequest(opts: {
  url: string;
  cookies?: Record<string, string>;
}) {
  const headers: HeadersInit = {};
  if (opts.cookies) {
    headers["cookie"] = Object.entries(opts.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
  return new NextRequest(opts.url, { method: "POST", headers });
}

describe("/api/auth/logout", () => {
  let originalCookieDomain: string | undefined;
  let originalAllowedHosts: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalCookieDomain = process.env.COOKIE_DOMAIN;
    originalAllowedHosts = process.env.ALLOWED_RETURN_HOSTS;
  });

  afterEach(() => {
    if (originalCookieDomain === undefined) delete process.env.COOKIE_DOMAIN;
    else process.env.COOKIE_DOMAIN = originalCookieDomain;
    if (originalAllowedHosts === undefined) delete process.env.ALLOWED_RETURN_HOSTS;
    else process.env.ALLOWED_RETURN_HOSTS = originalAllowedHosts;
  });

  it("deletes session and redirects to /login when no redirect param", async () => {
    const request = buildRequest({
      url: "http://localhost:3010/api/auth/logout",
      cookies: { sessionId: "sid-1" },
    });

    const response = await POST(request);

    expect(deleteSessionMock).toHaveBeenCalledWith("sid-1");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3010/login");
  });

  it("redirects to whitelisted full URL via ?redirect=", async () => {
    process.env.ALLOWED_RETURN_HOSTS = "jarvis.isusystem.com,yess.isusystem.com";
    const request = buildRequest({
      url: "http://localhost:3010/api/auth/logout?redirect=https%3A%2F%2Fyess.isusystem.com%2Fdashboard",
      cookies: { sessionId: "sid-1" },
    });

    const response = await POST(request);

    expect(response.headers.get("location")).toBe("https://yess.isusystem.com/dashboard");
  });

  it("falls back to /login when redirect host is not whitelisted", async () => {
    process.env.ALLOWED_RETURN_HOSTS = "jarvis.isusystem.com";
    const request = buildRequest({
      url: "http://localhost:3010/api/auth/logout?redirect=https%3A%2F%2Fattacker.com%2F",
      cookies: { sessionId: "sid-1" },
    });

    const response = await POST(request);

    expect(response.headers.get("location")).toBe("http://localhost:3010/login");
  });

  it("clears sessionId cookie with Domain when COOKIE_DOMAIN is set", async () => {
    process.env.COOKIE_DOMAIN = ".isusystem.com";
    const request = buildRequest({
      url: "http://localhost:3010/api/auth/logout",
      cookies: { sessionId: "sid-1" },
    });

    const response = await POST(request);

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/sessionId=;/i);
    expect(setCookie).toMatch(/Domain=\.isusystem\.com/i);
    expect(setCookie).toMatch(/Max-Age=0/i);
  });

  it("clears legacy jarvis_session cookie with same domain", async () => {
    process.env.COOKIE_DOMAIN = ".isusystem.com";
    const request = buildRequest({
      url: "http://localhost:3010/api/auth/logout",
      cookies: { jarvis_session: "legacy-1" },
    });

    const response = await POST(request);

    expect(deleteSessionMock).toHaveBeenCalledWith("legacy-1");
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/jarvis_session=;/i);
  });

  it("does not call deleteSession when no cookie is present", async () => {
    const request = buildRequest({ url: "http://localhost:3010/api/auth/logout" });

    const response = await POST(request);

    expect(deleteSessionMock).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
  });
});
