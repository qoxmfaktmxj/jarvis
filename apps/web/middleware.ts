import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@jarvis/auth/cookie";

const SESSION_ID = /^[a-f0-9]{64}$/;
const PUBLIC_PAGES = new Set(["/login"]);
const RETURN_TO_ALLOWLIST = [
  "/dashboard",
  "/ask",
  "/wiki",
  "/search",
  "/profile",
  "/admin/sources",
  "/admin/wiki-reviews",
  "/admin/users",
  "/admin/menus",
  "/admin/codes",
  "/admin/llm-usage",
  "/admin/audit",
] as const;

function isAllowedReturnTo(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.includes("?") || path.includes("#")) {
    return false;
  }
  if (path.split("/").some((segment) => segment === "." || segment === "..")) {
    return false;
  }
  return RETURN_TO_ALLOWLIST.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function middleware(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;
  if (path.startsWith("/api/") || PUBLIC_PAGES.has(path)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token && SESSION_ID.test(token)) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-jarvis-pathname", path);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("returnTo", isAllowedReturnTo(path) ? path : "/dashboard");
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
