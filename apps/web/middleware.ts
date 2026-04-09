import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/callback", "/api/auth"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  if (pathname === "/api/health") {
    return NextResponse.next();
  }

  const sessionId = request.cookies.get("sessionId")?.value;

  if (!sessionId) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname === "/" ? "/dashboard" : pathname);
    return NextResponse.redirect(loginUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-session-id", sessionId);

  return NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
