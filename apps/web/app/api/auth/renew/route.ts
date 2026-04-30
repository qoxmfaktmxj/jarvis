import { NextRequest, NextResponse } from "next/server";
import { buildSessionCookieOptions } from "@jarvis/auth/cookie";
import { renewSession } from "@jarvis/auth/session";
import { resolveSessionId } from "@/lib/session-cookie";

const KEEP_SIGNED_IN_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const sessionId = resolveSessionId(request.cookies);
  if (!sessionId) {
    return NextResponse.json({ ok: false });
  }

  const result = await renewSession(sessionId);
  if (!result) {
    return NextResponse.json({ ok: false });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    "sessionId",
    sessionId,
    buildSessionCookieOptions(
      {
        cookieDomain: process.env.COOKIE_DOMAIN,
        isProduction: process.env.NODE_ENV === "production",
      },
      KEEP_SIGNED_IN_MS,
    ),
  );
  return response;
}
