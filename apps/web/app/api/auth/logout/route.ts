import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@jarvis/auth/session";
import { buildSessionCookieOptions } from "@jarvis/auth/cookie";
import { validateReturnUrl } from "@jarvis/auth/return-url";

export async function POST(request: NextRequest) {
  const sessionId =
    request.cookies.get("sessionId")?.value ??
    request.cookies.get("jarvis_session")?.value;

  if (sessionId) {
    await deleteSession(sessionId);
  }

  const url = new URL(request.url);
  const redirectRaw = url.searchParams.get("redirect");
  const allowedHosts = (process.env.ALLOWED_RETURN_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const fallback = new URL("/login", request.url).toString();
  const target = validateReturnUrl(redirectRaw, allowedHosts, fallback);

  const response = NextResponse.redirect(target);

  // 쿠키 삭제도 발급과 같은 domain 옵션을 명시해야 브라우저가 부모 도메인 쿠키를 제거함.
  // cookies.delete()는 호스트 한정 동작이라 부모 도메인 쿠키가 남는 버그 방지.
  const cookieOpts = buildSessionCookieOptions(
    {
      cookieDomain: process.env.COOKIE_DOMAIN,
      isProduction: process.env.NODE_ENV === "production",
    },
    0,
  );
  response.cookies.set("sessionId", "", cookieOpts);
  response.cookies.set("jarvis_session", "", cookieOpts);

  return response;
}
