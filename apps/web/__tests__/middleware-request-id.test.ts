import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware.js";

function makeReq(path: string, headers: Record<string, string> = {}) {
  const req = new NextRequest(new URL(`http://localhost${path}`), {
    headers: new Headers(headers),
  });
  // 인증 우회: sessionId 쿠키 삽입
  req.cookies.set("sessionId", "test-session");
  return req;
}

describe("middleware request-id injection", () => {
  it("generates a request-id when missing", () => {
    const req = makeReq("/dashboard");
    const res = middleware(req);
    const injected = res.headers.get("x-request-id");
    expect(injected).toBeTruthy();
    expect(injected).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("propagates an existing x-request-id", () => {
    const req = makeReq("/dashboard", { "x-request-id": "req-existing-1" });
    const res = middleware(req);
    expect(res.headers.get("x-request-id")).toBe("req-existing-1");
  });

  it("accepts legacy jarvis_session cookie without redirecting to /login", () => {
    const req = new NextRequest(new URL("http://localhost/dashboard"));
    req.cookies.set("jarvis_session", "legacy-session");
    const res = middleware(req);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-request-id")).toBeTruthy();
  });
});
