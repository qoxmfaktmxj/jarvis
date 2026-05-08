import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth/rbac";
import type { JarvisSession } from "@jarvis/auth/types";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Server-side session + permission gate for `(app)/<route>/page.tsx`.
 *
 * - No `permission`: only authentication is checked. Use for routes every
 *   authenticated workspace member can see (e.g. dashboard).
 * - String `permission`: redirects to `fallbackPath` if the session lacks it.
 * - String[] `permission`: OR semantics — passes if the session holds ANY
 *   listed permission. Use for "X or admin" gates without writing the boolean
 *   inline (e.g. `[PERMISSIONS.SCHEDULE_READ, PERMISSIONS.ADMIN_ALL]`).
 *
 * On a forbidden redirect, prefer `"/dashboard?error=forbidden"` so the
 * dashboard's `ForbiddenBanner` can explain the bounce to the user.
 */
export async function requirePageSession(
  permission?: string | readonly string[],
  fallbackPath = "/dashboard"
): Promise<JarvisSession> {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id");

  if (!sessionId) {
    redirect("/login");
  }

  const session = await getSession(sessionId);
  if (!session) {
    redirect("/login");
  }

  if (permission) {
    const required = Array.isArray(permission) ? permission : [permission];
    const allowed = required.some((p) => hasPermission(session, p));
    if (!allowed) {
      redirect(fallbackPath);
    }
  }

  return session;
}
