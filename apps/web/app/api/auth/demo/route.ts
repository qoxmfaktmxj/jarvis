import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, createDemoSession, revokeSession, sessionCookieOptions } from "@jarvis/auth";
import { isAllowedRoutePath } from "@jarvis/shared/constants/routes";

function safeReturnTo(request: NextRequest): string {
  const value = request.nextUrl.searchParams.get("returnTo");
  return isAllowedRoutePath(value) ? value : "/dashboard";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  await revokeSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const demo = await createDemoSession({ ttlMs: 60 * 60 * 1000 });
  const response = NextResponse.json(
    { ok: true, redirectTo: safeReturnTo(request) },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(SESSION_COOKIE_NAME, demo.sessionId, sessionCookieOptions(demo.expiresAt));
  return response;
}
