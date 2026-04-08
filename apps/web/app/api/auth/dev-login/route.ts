import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createSession } from "@jarvis/auth/session";
import { db } from "@jarvis/db/client";
import { role, user, userRole } from "@jarvis/db/schema";
import { ROLE_PERMISSIONS } from "@jarvis/shared/constants/permissions";

// Dev-only login bypass — disabled in production
export async function POST(request: NextRequest) {
  if (process.env["NODE_ENV"] === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { email } = await request.json() as { email?: string };
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const [dbUser] = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (!dbUser) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
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
    name: dbUser.name ?? "Dev User",
    email: dbUser.email ?? email,
    roles,
    permissions,
    orgId: dbUser.orgId ?? undefined,
    ssoSubject: `dev:${dbUser.id}`,
    createdAt: now,
    expiresAt: now + 8 * 60 * 60 * 1000,
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set("sessionId", sessionId, {
    httpOnly: true,
    secure: false,
    maxAge: 8 * 60 * 60,
    sameSite: "lax",
    path: "/",
  });

  return response;
}
