import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { buildSessionCookieOptions } from "@jarvis/auth/cookie";
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
  // dev-account 경로는 production에서 무조건 404.
  if ((process.env.NODE_ENV as string) === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const ip = extractClientIp(request);
  const rl = checkRateLimit(`login:${ip}`, LOGIN_RATE_MAX, LOGIN_RATE_WINDOW_SEC);

  if (!rl.allowed) {
    const retryAfterSec = rl.retryAfterSec ?? LOGIN_RATE_WINDOW_SEC;
    // audit_log: rate-limit 발동. fail-safe — 실패해도 429 응답은 반환.
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

  const account = findTempDevAccount(payload.username, payload.password);
  if (!account) {
    // audit_log: 인증 실패.
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

  const loginEmail = account.email;

  const [dbUser] = await db
    .select()
    .from(user)
    .where(eq(user.email, loginEmail))
    .limit(1);

  if (!dbUser) {
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

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
    email: dbUser.email ?? loginEmail,
    roles,
    permissions,
    orgId: dbUser.orgId ?? undefined,
    createdAt: now,
    expiresAt: now + sessionLifetimeMs,
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

  return response;
}
