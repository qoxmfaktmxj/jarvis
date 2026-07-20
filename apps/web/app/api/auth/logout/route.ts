import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, expiredSessionCookieOptions, revokeSession } from "@jarvis/auth";

export async function POST(request: NextRequest): Promise<NextResponse> {
  await revokeSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const response = NextResponse.json(
    { ok: true, redirectTo: "/login" },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set(SESSION_COOKIE_NAME, "", expiredSessionCookieOptions());
  return response;
}
