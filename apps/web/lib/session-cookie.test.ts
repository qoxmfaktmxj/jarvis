import { describe, it, expect } from "vitest";
import { resolveSessionId, SESSION_COOKIE_NAMES } from "./session-cookie";

type CookieMap = { get: (name: string) => { value: string } | undefined };

function makeCookies(map: Record<string, string>): CookieMap {
  return {
    get: (name) => (name in map ? { value: map[name]! } : undefined),
  };
}

describe("resolveSessionId", () => {
  it("prefers sessionId when both are present", () => {
    const cookies = makeCookies({ sessionId: "new", jarvis_session: "legacy" });
    expect(resolveSessionId(cookies)).toBe("new");
  });

  it("falls back to jarvis_session when sessionId is missing", () => {
    const cookies = makeCookies({ jarvis_session: "legacy" });
    expect(resolveSessionId(cookies)).toBe("legacy");
  });

  it("returns null when neither cookie is set", () => {
    expect(resolveSessionId(makeCookies({}))).toBeNull();
  });

  it("treats empty string as missing", () => {
    const cookies = makeCookies({ sessionId: "" });
    expect(resolveSessionId(cookies)).toBeNull();
  });

  it("exposes the canonical names in lookup order", () => {
    expect(SESSION_COOKIE_NAMES).toEqual(["sessionId", "jarvis_session"]);
  });
});
