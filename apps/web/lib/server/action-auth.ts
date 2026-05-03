import { cookies, headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth/rbac";
import type { JarvisSession } from "@jarvis/auth/types";

/**
 * Resolve session from request headers or cookies.
 * Used in server actions (which don't have x-session-id header by default).
 */
async function resolveSessionId(): Promise<string | null> {
  const headerStore = await headers();
  const cookieStore = await cookies();
  return (
    headerStore.get("x-session-id") ??
    cookieStore.get("sessionId")?.value ??
    cookieStore.get("jarvis_session")?.value ??
    null
  );
}

/**
 * Server action guard: require a valid session with a specific permission.
 * Throws if session is missing, invalid, or permission denied.
 */
export async function requirePermission(permission: string): Promise<JarvisSession> {
  const sessionId = await resolveSessionId();
  if (!sessionId) {
    throw new Error("Unauthorized: no session");
  }

  const session = await getSession(sessionId);
  if (!session) {
    throw new Error("Unauthorized: invalid session");
  }

  if (!hasPermission(session, permission)) {
    throw new Error("Forbidden: insufficient permissions");
  }

  return session;
}

/**
 * Server action guard: require a valid session (no permission check).
 * Throws if session is missing or invalid.
 */
export async function requireSession(): Promise<JarvisSession> {
  const sessionId = await resolveSessionId();
  if (!sessionId) {
    throw new Error("Unauthorized: no session");
  }

  const session = await getSession(sessionId);
  if (!session) {
    throw new Error("Unauthorized: invalid session");
  }

  return session;
}
