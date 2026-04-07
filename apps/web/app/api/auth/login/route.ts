import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";

  const issuer =
    process.env["OIDC_ISSUER"] ?? "http://localhost:8080/realms/jarvis";
  const clientId = process.env["OIDC_CLIENT_ID"] ?? "jarvis-web";
  const appUrl = process.env["NEXTAUTH_URL"] ?? "http://localhost:3000";

  const state = Buffer.from(
    JSON.stringify({ redirect: redirectTo }),
    "utf8"
  ).toString("base64url");

  const authUrl = new URL(`${issuer}/protocol/openid-connect/auth`);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", `${appUrl}/api/auth/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid profile email");
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set("oidc_state", state, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    maxAge: 60 * 10,
    sameSite: "lax",
    path: "/"
  });

  return response;
}
