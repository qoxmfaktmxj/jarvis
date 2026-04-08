import { NextRequest, NextResponse } from "next/server";
import { getOidcConfig, oidcClient } from "@jarvis/auth/oidc";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  // Validate redirect is a safe relative path only (no open redirect)
  const rawRedirect = searchParams.get("redirect") ?? "/dashboard";
  const redirectTo =
    rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") && !rawRedirect.includes("://")
      ? rawRedirect
      : "/dashboard";
  const appUrl = new URL(request.url).origin;
  const redirectUri = `${appUrl}/api/auth/callback`;

  try {
    const config = await getOidcConfig();

    // PKCE S256
    const codeVerifier = oidcClient.randomPKCECodeVerifier();
    const codeChallenge = await oidcClient.calculatePKCECodeChallenge(codeVerifier);

    // state and nonce
    const state = oidcClient.randomState();
    const nonce = oidcClient.randomNonce();

    const authUrl = oidcClient.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: "openid profile email",
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const response = NextResponse.redirect(authUrl.toString());

    const cookieOpts = {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      maxAge: 60 * 10,
      sameSite: "lax" as const,
      path: "/",
    };

    response.cookies.set("oidc_pkce", codeVerifier, cookieOpts);
    response.cookies.set("oidc_state", state, cookieOpts);
    response.cookies.set("oidc_nonce", nonce, cookieOpts);
    response.cookies.set("oidc_redirect", redirectTo, cookieOpts);

    return response;
  } catch (error) {
    console.error("[auth] login error:", error);
    return NextResponse.redirect(new URL("/login?error=auth_init_failed", request.url));
  }
}
