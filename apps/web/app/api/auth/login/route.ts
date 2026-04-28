import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createSession } from "@jarvis/auth/session";
import { db } from "@jarvis/db/client";
import { role, user, userRole } from "@jarvis/db/schema";
import { ROLE_PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { findTempDevAccount } from "@/lib/auth/dev-accounts";

// Temporary local login endpoint. In production it is only enabled when
// JARVIS_ENABLE_TEMP_LOGIN=true is set by the deployment config.
export async function POST(request: NextRequest) {
  const tempLoginEnabled =
    process.env.NODE_ENV !== "production" ||
    process.env.JARVIS_ENABLE_TEMP_LOGIN === "true" ||
    process.env.JARVIS_ENABLE_TEMP_LOGIN === "1";

  if (!tempLoginEnabled) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const payload = await request.json() as {
    username?: string;
    password?: string;
    keepSignedIn?: boolean;
  };

  if (!payload.username || !payload.password) {
    return NextResponse.json({ error: "username and password required" }, { status: 400 });
  }

  const sessionLifetimeMs = payload.keepSignedIn === true
    ? 30 * 24 * 60 * 60 * 1000
    : 8 * 60 * 60 * 1000;

  const account = findTempDevAccount(payload.username, payload.password);
  if (!account) {
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
    ...new Set(roles.flatMap((roleCode) => ROLE_PERMISSIONS[roleCode] ?? []))
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
  response.cookies.set("sessionId", sessionId, {
    httpOnly: true,
    secure: false,
    maxAge: Math.floor(sessionLifetimeMs / 1000),
    sameSite: "lax",
    path: "/",
  });

  return response;
}
