export const SESSION_COOKIE_NAME = "jarvis_session";

export function sessionCookieOptions(expiresAt: Date, now = new Date()) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
    maxAge: Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)),
  };
}

export function expiredSessionCookieOptions() {
  return {
    ...sessionCookieOptions(new Date(0)),
    expires: new Date(0),
    maxAge: 0,
  };
}
