import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getOidcConfig, oidcClient } from "@jarvis/auth/oidc";
import { createSession } from "@jarvis/auth/session";
import { db } from "@jarvis/db/client";
import { role, user, userRole } from "@jarvis/db/schema";
import { ROLE_PERMISSIONS } from "@jarvis/shared/constants/permissions";

export async function GET(request: NextRequest) {
  const codeVerifier = request.cookies.get("oidc_pkce")?.value;
  const expectedState = request.cookies.get("oidc_state")?.value;
  const expectedNonce = request.cookies.get("oidc_nonce")?.value;
  const redirectTo = request.cookies.get("oidc_redirect")?.value ?? "/dashboard";

  if (!codeVerifier || !expectedState || !expectedNonce) {
    return NextResponse.redirect(new URL("/login?error=missing_oidc_cookies", request.url));
  }

  try {
    const config = await getOidcConfig();

    // authorizationCodeGrant performs:
    // - state validation
    // - PKCE code_verifier validation
    // - JWKS-based id_token signature verification
    // - issuer, audience, expiry, nonce claim validation
    const tokens = await oidcClient.authorizationCodeGrant(
      config,
      new URL(request.url),
      {
        pkceCodeVerifier: codeVerifier,
        expectedNonce,
        expectedState,
        idTokenExpected: true,
      }
    );

    const claims = tokens.claims();
    if (!claims?.sub) {
      return NextResponse.redirect(new URL("/login?error=invalid_token_claims", request.url));
    }

    const [dbUser] = await db
      .select()
      .from(user)
      .where(eq(user.ssoSubject, claims.sub))
      .limit(1);

    if (!dbUser) {
      return NextResponse.redirect(new URL("/login?error=user_not_found", request.url));
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
      name: dbUser.name ?? (claims["name"] as string | undefined) ?? "User",
      email: dbUser.email ?? (claims["email"] as string | undefined),
      roles,
      permissions,
      orgId: dbUser.orgId ?? undefined,
      ssoSubject: claims.sub,
      createdAt: now,
      expiresAt: now + 8 * 60 * 60 * 1000,
    });

    const response = NextResponse.redirect(new URL(redirectTo, request.url));

    const sessionCookieOpts = {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      maxAge: 8 * 60 * 60,
      sameSite: "lax" as const,
      path: "/",
    };

    response.cookies.set("sessionId", sessionId, sessionCookieOpts);
    response.cookies.delete("oidc_pkce");
    response.cookies.delete("oidc_state");
    response.cookies.delete("oidc_nonce");
    response.cookies.delete("oidc_redirect");

    return response;
  } catch (error) {
    console.error("[auth] callback error:", error);
    return NextResponse.redirect(new URL("/login?error=auth_failed", request.url));
  }
}
