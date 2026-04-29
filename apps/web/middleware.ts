import { NextRequest, NextResponse } from "next/server";
import { resolveSessionId } from "./lib/session-cookie";
import { buildCsp } from "./lib/security/csp";

const PUBLIC_PATHS = ["/login", "/callback", "/api/auth", "/capybara"];

function ensureRequestId(request: NextRequest): string {
  const existing = request.headers.get("x-request-id");
  if (existing && existing.trim().length > 0) return existing;
  return crypto.randomUUID();
}

function withRequestId(res: NextResponse, requestId: string): NextResponse {
  res.headers.set("x-request-id", requestId);
  return res;
}

function withSecurityHeaders(res: NextResponse, nonce: string): NextResponse {
  const isProd = process.env["NODE_ENV"] === "production";

  res.headers.set("content-security-policy", buildCsp({ nonce, isProd }));
  res.headers.set("x-frame-options", "DENY");
  res.headers.set("x-content-type-options", "nosniff");
  res.headers.set(
    "referrer-policy",
    "strict-origin-when-cross-origin",
  );
  res.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=()",
  );

  if (isProd) {
    res.headers.set(
      "strict-transport-security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return res;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId = ensureRequestId(request);
  const nonce = crypto.randomUUID();

  if (pathname.startsWith("/systems")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/systems/, "/projects");
    const res = NextResponse.redirect(url, 301);
    withRequestId(res, requestId);
    withSecurityHeaders(res, nonce);
    return res;
  }

  // /attendance/* -> /contractors (legacy route)
  if (pathname === "/attendance" || pathname.startsWith("/attendance/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/contractors";  // collapse subpaths since old subroutes are gone
    url.search = request.nextUrl.search;  // preserve query if any
    const res = NextResponse.redirect(url, 301);
    withRequestId(res, requestId);
    withSecurityHeaders(res, nonce);
    return res;
  }

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    const res = NextResponse.next();
    withRequestId(res, requestId);
    withSecurityHeaders(res, nonce);
    return res;
  }

  if (pathname === "/api/health") {
    const res = NextResponse.next();
    withRequestId(res, requestId);
    withSecurityHeaders(res, nonce);
    return res;
  }

  const sessionId = resolveSessionId(request.cookies);

  if (!sessionId) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "redirect",
      pathname === "/" ? "/dashboard" : pathname,
    );
    const res = NextResponse.redirect(loginUrl);
    withRequestId(res, requestId);
    withSecurityHeaders(res, nonce);
    return res;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-session-id", sessionId);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-csp-nonce", nonce);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  withRequestId(res, requestId);
  withSecurityHeaders(res, nonce);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|_next/webpack-hmr|favicon.ico).*)"],
};
