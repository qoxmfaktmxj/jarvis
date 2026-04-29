import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Hoist mocks so vi.mock factory closures can reference them.
// ---------------------------------------------------------------------------
const {
  createSessionMock,
  userLookupQueue,
  roleLookupQueue,
  auditInsertMock,
  checkRateLimitMock,
  findTempDevAccountMock,
} = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  userLookupQueue: [] as unknown[][],
  roleLookupQueue: [] as unknown[][],
  auditInsertMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  findTempDevAccountMock: vi.fn(),
}));

vi.mock("@jarvis/auth/session", () => ({
  createSession: createSessionMock,
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
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        catch: vi.fn((_cb) => {
          auditInsertMock();
          return Promise.resolve();
        }),
      })),
    })),
  },
}));

vi.mock("@/lib/auth/dev-accounts", () => ({
  findTempDevAccount: findTempDevAccountMock,
}));

vi.mock("@/lib/server/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
  __resetRateLimitForTests: vi.fn(),
}));

import { POST } from "./route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildRequest(
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return new NextRequest("http://localhost:3010/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

const ALLOWED_RL = { allowed: true, current: 1, max: 5 };
const BLOCKED_RL = { allowed: false, retryAfterSec: 45, current: 6, max: 5 };

const DEV_ACCOUNT = {
  label: "Admin User",
  role: "ADMIN",
  username: "admin",
  password: "admin123!",
  email: "admin@jarvis.dev",
} as const;

const DB_USER = {
  id: "user-1",
  workspaceId: "ws-1",
  employeeId: "EMP001",
  name: "Admin User",
  email: "admin@jarvis.dev",
  orgId: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("/api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    userLookupQueue.length = 0;
    roleLookupQueue.length = 0;
    // Default: rate-limit passes, dev account matches
    checkRateLimitMock.mockReturnValue(ALLOWED_RL);
    findTempDevAccountMock.mockReturnValue(DEV_ACCOUNT);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // ── P0-2: production → always 404 ────────────────────────────────────────

  it("TC1: NODE_ENV=production → 404 (env override 무시)", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const res = await POST(buildRequest({ username: "admin", password: "admin123!" }));
    expect(res.status).toBe(404);
  });

  it("TC2: NODE_ENV=production + JARVIS_ENABLE_TEMP_LOGIN=true → 404 (완전 제거됨)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JARVIS_ENABLE_TEMP_LOGIN", "true");

    const res = await POST(buildRequest({ username: "admin", password: "admin123!" }));
    expect(res.status).toBe(404);
  });

  // ── Happy path (NODE_ENV=development) ────────────────────────────────────

  it("TC3: NODE_ENV=development + 정상 자격증명 → 200 + 세션 발급", async () => {
    vi.stubEnv("NODE_ENV", "development");
    userLookupQueue.push([DB_USER]);
    roleLookupQueue.push([{ roleCode: "ADMIN" }]);

    const res = await POST(buildRequest({ username: "admin", password: "admin123!" }));

    expect(res.status).toBe(200);
    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "ws-1",
        email: "admin@jarvis.dev",
        roles: ["ADMIN"],
      }),
    );
    expect(res.headers.get("set-cookie")).toContain("sessionId=");
  });

  // ── P0-1: secure 플래그 ───────────────────────────────────────────────────

  it("TC4a: NODE_ENV=development → secure=false 쿠키", async () => {
    vi.stubEnv("NODE_ENV", "development");
    userLookupQueue.push([DB_USER]);
    roleLookupQueue.push([{ roleCode: "ADMIN" }]);

    const res = await POST(buildRequest({ username: "admin", password: "admin123!" }));

    expect(res.status).toBe(200);
    // development 환경에서는 secure 속성이 없거나 false여야 함
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie.toLowerCase()).not.toMatch(/;\s*secure/);
  });

  // ── P0-3: rate-limit ─────────────────────────────────────────────────────

  it("TC5: rate-limit 초과 → 429 + Retry-After 헤더 + retryAfterSec 필드", async () => {
    vi.stubEnv("NODE_ENV", "development");
    checkRateLimitMock.mockReturnValue(BLOCKED_RL);

    const res = await POST(buildRequest({ username: "admin", password: "admin123!" }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("45");
    const body = await res.json() as Record<string, unknown>;
    expect(body.error).toBe("too_many_requests");
    expect(body.retryAfterSec).toBe(45);
  });

  // ── Audit log ────────────────────────────────────────────────────────────

  it("TC6: 실패 로그인 → audit_log INSERT (action=auth.login.fail)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    findTempDevAccountMock.mockReturnValue(null);

    const res = await POST(buildRequest({ username: "admin", password: "wrong!" }));

    expect(res.status).toBe(401);
    expect(auditInsertMock).toHaveBeenCalledTimes(1);
  });

  it("TC7: rate-limit 발동 → audit_log INSERT (action=auth.login.rate_limit)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    checkRateLimitMock.mockReturnValue(BLOCKED_RL);

    const res = await POST(buildRequest({ username: "admin", password: "admin123!" }));

    expect(res.status).toBe(429);
    expect(auditInsertMock).toHaveBeenCalledTimes(1);
  });

  // ── IP 추출 ───────────────────────────────────────────────────────────────

  it("TC8: x-forwarded-for 'a.b.c.d, e.f.g.h' → 첫 번째 IP만 rate-limit 키로 사용", async () => {
    vi.stubEnv("NODE_ENV", "development");

    await POST(
      buildRequest(
        { username: "admin", password: "admin123!" },
        { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
      ),
    );

    // checkRateLimit이 'login:1.2.3.4' 키로 호출됐는지 확인
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "login:1.2.3.4",
      expect.any(Number),
      expect.any(Number),
    );
  });

  // ── 기존 엣지 케이스 유지 ────────────────────────────────────────────────

  it("username/password 누락 → 400", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const res = await POST(buildRequest({}));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "username and password required" });
  });

  it("dev account 이메일이 DB에 없으면 → 401", async () => {
    vi.stubEnv("NODE_ENV", "development");
    userLookupQueue.push([]);

    const res = await POST(buildRequest({ username: "admin", password: "admin123!" }));
    expect(res.status).toBe(401);
  });
});

describe("/api/auth/login - cookie options", () => {
  let originalCookieDomain: string | undefined;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalCookieDomain = process.env.COOKIE_DOMAIN;
    originalNodeEnv = process.env.NODE_ENV;
    vi.clearAllMocks();
    userLookupQueue.length = 0;
    roleLookupQueue.length = 0;
  });

  afterEach(() => {
    const env = process.env as Record<string, string | undefined>;
    if (originalCookieDomain === undefined) delete env.COOKIE_DOMAIN;
    else env.COOKIE_DOMAIN = originalCookieDomain;
    if (originalNodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = originalNodeEnv;
  });

  function seedSuccessfulLogin() {
    userLookupQueue.push([{
      id: "user-1",
      workspaceId: "ws-1",
      employeeId: "EMP001",
      name: "Admin User",
      email: "admin@jarvis.dev",
      orgId: null,
    }]);
    roleLookupQueue.push([{ roleCode: "ADMIN" }]);
  }

  it("Set-Cookie includes Domain when COOKIE_DOMAIN is set", async () => {
    process.env.COOKIE_DOMAIN = ".isusystem.com";
    seedSuccessfulLogin();

    const response = await POST(
      buildRequest({ username: "admin", password: "admin123!" }),
    );

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/Domain=\.isusystem\.com/i);
  });

  it("Set-Cookie omits Domain when COOKIE_DOMAIN is unset", async () => {
    delete process.env.COOKIE_DOMAIN;
    seedSuccessfulLogin();

    const response = await POST(
      buildRequest({ username: "admin", password: "admin123!" }),
    );

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).not.toMatch(/Domain=/i);
  });

  it("Set-Cookie omits Secure when NODE_ENV is not production", async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = "test";
    delete process.env.COOKIE_DOMAIN;
    seedSuccessfulLogin();

    const response = await POST(
      buildRequest({ username: "admin", password: "admin123!" }),
    );

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).not.toMatch(/(?:^|;\s*)Secure(?:;|$)/i);
  });
});
