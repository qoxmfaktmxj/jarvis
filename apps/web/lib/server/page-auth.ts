import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth/rbac";
import type { JarvisSession } from "@jarvis/auth/types";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function requirePageSession(
  permission?: string,
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

  if (permission && !hasPermission(session, permission)) {
    redirect(fallbackPath);
  }

  return session;
}
