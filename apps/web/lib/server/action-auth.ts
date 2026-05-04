import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth/rbac";
import type { JarvisSession } from "@jarvis/auth/types";
import { resolveRequestSessionId } from "@/lib/server/_resolveRequestSession";

/**
 * Server action guard: require a valid session with a specific permission.
 * Throws if session is missing, invalid, or permission denied.
 */
export async function requirePermission(permission: string): Promise<JarvisSession> {
  const sessionId = await resolveRequestSessionId();
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
  const sessionId = await resolveRequestSessionId();
  if (!sessionId) {
    throw new Error("Unauthorized: no session");
  }

  const session = await getSession(sessionId);
  if (!session) {
    throw new Error("Unauthorized: invalid session");
  }

  return session;
}
