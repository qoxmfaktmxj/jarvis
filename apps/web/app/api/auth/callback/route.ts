import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { createSession } from "@jarvis/auth/session";
import { db } from "@jarvis/db/client";
import { role, user, userRole } from "@jarvis/db/schema";
import { ROLE_PERMISSIONS } from "@jarvis/shared/constants/permissions";

type TokenResponse = {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

type IdTokenPayload = {
  sub: string;
  name?: string;
  email?: string;
  preferred_username?: string;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const stateCookie = request.cookies.get("oidc_state")?.value;

  if (!code || !state || !stateCookie || stateCookie !== state) {
    return NextResponse.redirect(new URL("/login?error=invalid_state", request.url));
  }

  const issuer =
    process.env["OIDC_ISSUER"] ?? "http://localhost:8080/realms/jarvis";
  const clientId = process.env["OIDC_CLIENT_ID"] ?? "jarvis-web";
  const clientSecret = process.env["OIDC_CLIENT_SECRET"] ?? "";
  const appUrl = process.env["NEXTAUTH_URL"] ?? "http://localhost:3000";

  try {
    const tokenRes = await fetch(`${issuer}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${appUrl}/api/auth/callback`,
        client_id: clientId,
        client_secret: clientSecret
      })
    });

    const tokens = (await tokenRes.json()) as TokenResponse;
    if (!tokenRes.ok || !tokens.id_token) {
      return NextResponse.redirect(new URL("/login?error=auth_failed", request.url));
    }

    const payload = JSON.parse(
      Buffer.from(tokens.id_token.split(".")[1] ?? "", "base64url").toString(
        "utf8"
      )
    ) as IdTokenPayload;

    const [dbUser] = await db
      .select()
      .from(user)
      .where(eq(user.ssoSubject, payload.sub))
      .limit(1);

    if (!dbUser) {
      return NextResponse.redirect(
        new URL("/login?error=user_not_found", request.url)
      );
    }

    const userRoleRows = await db
      .select({ roleCode: role.code })
      .from(userRole)
      .innerJoin(role, eq(userRole.roleId, role.id))
      .where(eq(userRole.userId, dbUser.id));

    const roles = userRoleRows.map((row) => row.roleCode);
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
      name: dbUser.name ?? payload.name ?? payload.preferred_username ?? "User",
      email: dbUser.email ?? payload.email,
      roles,
      permissions,
      orgId: dbUser.orgId ?? undefined,
      ssoSubject: payload.sub,
      createdAt: now,
      expiresAt: now + 8 * 60 * 60 * 1000
    });

    let redirectTo = "/dashboard";
    try {
      const stateData = JSON.parse(
        Buffer.from(state, "base64url").toString("utf8")
      ) as { redirect?: string };
      redirectTo = stateData.redirect ?? "/dashboard";
    } catch {
      redirectTo = "/dashboard";
    }

    const response = NextResponse.redirect(new URL(redirectTo, request.url));
    const cookieOptions = {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      maxAge: 8 * 60 * 60,
      sameSite: "lax" as const,
      path: "/"
    };

    response.cookies.set("sessionId", sessionId, cookieOptions);
    response.cookies.set("jarvis_session", sessionId, cookieOptions);
    response.cookies.delete("oidc_state");
    return response;
  } catch (error) {
    console.error("Auth callback error:", error);
    return NextResponse.redirect(new URL("/login?error=auth_failed", request.url));
  }
}
