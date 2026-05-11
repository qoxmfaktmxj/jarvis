import type { NextRequest } from "next/server";

/**
 * Extract caller IP/UA from a NextRequest for audit_log inserts.
 *
 * Mirrors the local helpers in `app/api/auth/login/route.ts` and
 * `app/api/auth/change-password/route.ts`. Centralised here so API routes that
 * write audit_log (e.g. add-dev mutations) don't each redefine the same logic.
 *
 * Honours `x-forwarded-for` first (proxied environments), then `x-real-ip`.
 * Returns `null` when neither header is present so audit_log NULL semantics
 * are preserved (audit_log.ip_address is nullable).
 */
export function extractRequestAudit(request: NextRequest): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  const xff = request.headers.get("x-forwarded-for");
  const ip = xff
    ? xff.split(",")[0]?.trim() ?? null
    : request.headers.get("x-real-ip");
  return {
    ipAddress: ip && ip.length > 0 ? ip : null,
    userAgent: request.headers.get("user-agent"),
  };
}
