import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq, or } from "drizzle-orm";
import { buildSessionCookieOptions } from "@jarvis/auth/cookie";
import { verifyPassword } from "@jarvis/auth/password";
import { createSession } from "@jarvis/auth/session";
import { db } from "@jarvis/db/client";
import { auditLog, role, user, userRole } from "@jarvis/db/schema";
import { ROLE_PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { findTempDevAccount } from "@/lib/auth/dev-accounts";
import { checkRateLimit } from "@/lib/server/rate-limit";

// dev-account login endpoint — production에서 절대 활성화 불가.
// JARVIS_ENABLE_TEMP_LOGIN env override는 완전히 제거됨.

const LOGIN_RATE_MAX = 5;
const LOGIN_RATE_WINDOW_SEC = 60;

// zero UUID: workspaceId NOT NULL fallback for system-level audit events (no authenticated workspace).
const SYSTEM_WORKSPACE_ID = "00000000-0000-0000-0000-000000000000";

function extractClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: NextRequest) {
  const isProduction = (process.env.NODE_ENV as string) === "production";
  const ip = extractClientIp(request);
  const rl = checkRateLimit(`login:${ip}`, LOGIN_RATE_MAX, LOGIN_RATE_WINDOW_SEC);

  if (!rl.allowed) {
    const retryAfterSec = rl.retryAfterSec ?? LOGIN_RATE_WINDOW_SEC;
    await db
      .insert(auditLog)
      .values({
        workspaceId: SYSTEM_WORKSPACE_ID,
        action: "auth.login.rate_limit",
        resourceType: "login",
        ipAddress: ip === "unknown" ? null : ip,
        details: {
          ip,
          retryAfterSec,
          ipHash: createHash("sha256").update(ip).digest("hex").slice(0, 16),
        },
        success: false,
      })
      .catch(() => undefined);

    return NextResponse.json(
      { error: "too_many_requests", retryAfterSec },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      },
    );
  }

  const payload = (await request.json()) as {
    username?: string;
    password?: string;
    keepSignedIn?: boolean;
  };

  if (!payload.username || !payload.password) {
    return NextResponse.json({ error: "username and password required" }, { status: 400 });
  }

  const sessionLifetimeMs =
    payload.keepSignedIn === true
      ? 30 * 24 * 60 * 60 * 1000
      : 8 * 60 * 60 * 1000;

  // DB 비밀번호 우선: employeeId 또는 email로 사용자 조회.
  //
  // TODO(multi-tenant, B안): 현재는 단일 테넌트 운영 + user.employee_id / user.email 의
  // 글로벌 unique 제약(0047 마이그레이션)으로 cross-tenant 충돌이 데이터 레벨에서 차단된다.
  // 멀티테넌트 운영 전환 시:
  //   1) host→workspaceId 라우팅을 미들웨어에 추가
  //   2) 아래 where 에 `eq(user.workspaceId, resolvedWorkspaceId)` 를 함께 박을 것
  //   3) 글로벌 unique 를 (workspace_id, employee_id) / (workspace_id, email) 복합 unique 로 교체
  // (Code review P1 #1, 2026-04-30)
  const [dbUser] = await db
    .select()
    .from(user)
    .where(
      or(
        eq(user.employeeId, payload.username),
        eq(user.email, payload.username),
      ),
    )
    .limit(1);

  let authenticated = false;

  if (dbUser?.passwordHash) {
    // DB에 passwordHash가 있으면 scrypt로 검증
    authenticated = await verifyPassword(payload.password, dbUser.passwordHash);
  } else if (!isProduction) {
    // dev 전용: dev-accounts.ts 폴백 (DB에 hash 없는 경우만)
    const account = findTempDevAccount(payload.username, payload.password);
    if (account) {
      authenticated = true;
      // dev-account email로 dbUser를 다시 찾기 (위에서 못 찾은 경우)
      if (!dbUser) {
        const [devDbUser] = await db
          .select()
          .from(user)
          .where(eq(user.email, account.email))
          .limit(1);
        if (!devDbUser) {
          return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
        }
        return buildLoginResponse(devDbUser, sessionLifetimeMs, ip, payload.keepSignedIn === true);
      }
    }
  }

  if (!authenticated) {
    await db
      .insert(auditLog)
      .values({
        workspaceId: SYSTEM_WORKSPACE_ID,
        action: "auth.login.fail",
        resourceType: "login",
        ipAddress: ip === "unknown" ? null : ip,
        details: {
          ip,
          username: payload.username,
          reason: "invalid_credentials",
          usernameHash: createHash("sha256")
            .update(payload.username)
            .digest("hex")
            .slice(0, 16),
        },
        success: false,
      })
      .catch(() => undefined);

    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  if (!dbUser) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  return buildLoginResponse(dbUser, sessionLifetimeMs, ip, payload.keepSignedIn === true);
}

async function buildLoginResponse(
  dbUser: { id: string; workspaceId: string; employeeId: string; name: string; email: string | null; orgId: string | null },
  sessionLifetimeMs: number,
  ip: string,
  keepSignedIn = false,
) {
  const userRoleRows = await db
    .select({ roleCode: role.code })
    .from(userRole)
    .innerJoin(role, eq(userRole.roleId, role.id))
    .where(eq(userRole.userId, dbUser.id));

  const roles = userRoleRows.map((row) => row.roleCode.toUpperCase());
  const permissions = [
    ...new Set(roles.flatMap((roleCode) => ROLE_PERMISSIONS[roleCode] ?? [])),
  ];

  const sessionId = randomUUID();
  const now = Date.now();

  await createSession({
    id: sessionId,
    userId: dbUser.id,
    workspaceId: dbUser.workspaceId,
    employeeId: dbUser.employeeId,
    name: dbUser.name ?? "User",
    email: dbUser.email ?? "",
    roles,
    permissions,
    orgId: dbUser.orgId ?? undefined,
    createdAt: now,
    expiresAt: now + sessionLifetimeMs,
    keepSignedIn,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    "sessionId",
    sessionId,
    buildSessionCookieOptions(
      {
        cookieDomain: process.env.COOKIE_DOMAIN,
        isProduction: process.env.NODE_ENV === "production",
      },
      sessionLifetimeMs,
    ),
  );

  // audit_log: 로그인 성공 — fire-and-forget
  void db
    .insert(auditLog)
    .values({
      workspaceId: dbUser.workspaceId,
      userId: dbUser.id,
      action: "auth.login.success",
      resourceType: "login",
      ipAddress: ip === "unknown" ? null : ip,
      details: { ip },
      success: true,
    })
    .catch(() => undefined);

  return response;
}
