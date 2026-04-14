import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/callback", "/api/auth"];

function ensureRequestId(request: NextRequest): string {
  const existing = request.headers.get("x-request-id");
  if (existing && existing.trim().length > 0) return existing;
  return crypto.randomUUID();
}

function withRequestId(res: NextResponse, requestId: string): NextResponse {
  res.headers.set("x-request-id", requestId);
  return res;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = ensureRequestId(request);

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return withRequestId(NextResponse.next(), requestId);
  }

  if (pathname === "/api/health") {
    return withRequestId(NextResponse.next(), requestId);
  }

  const sessionId = request.cookies.get("sessionId")?.value;

  if (!sessionId) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "redirect",
      pathname === "/" ? "/dashboard" : pathname,
    );
    return withRequestId(NextResponse.redirect(loginUrl), requestId);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-session-id", sessionId);
  requestHeaders.set("x-request-id", requestId);

  return withRequestId(
    NextResponse.next({ request: { headers: requestHeaders } }),
    requestId,
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico).*)"],
};
