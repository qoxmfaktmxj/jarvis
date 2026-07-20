import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  SESSION_COOKIE_NAME,
  requirePermission as requireLowLevelPermission,
  requireSession as requireLowLevelSession,
  type AuthSession,
} from "@jarvis/auth";
import type { Permission } from "@jarvis/shared/constants/permissions";
import { isAllowedRoutePath } from "@jarvis/shared/constants/routes";

function authCode(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

async function safeReturnTo(explicit?: string): Promise<string> {
  const candidate = explicit ?? (await headers()).get("x-jarvis-pathname") ?? "/dashboard";
  return isAllowedRoutePath(candidate) ? candidate : "/dashboard";
}

async function sessionIdFromCookie(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function requirePageSession(returnTo?: string): Promise<AuthSession> {
  try {
    return await requireLowLevelSession({ sessionId: await sessionIdFromCookie() });
  } catch (error) {
    if (authCode(error) !== "UNAUTHORIZED") {
      throw error;
    }
    const target = await safeReturnTo(returnTo);
    redirect(`/login?returnTo=${encodeURIComponent(target)}`);
  }
  throw new Error("unreachable");
}

export async function requirePagePermission(permission: Permission, returnTo?: string): Promise<AuthSession> {
  try {
    return await requireLowLevelPermission({
      sessionId: await sessionIdFromCookie(),
      permission,
    });
  } catch (error) {
    const code = authCode(error);
    if (code === "FORBIDDEN") {
      redirect("/forbidden");
    }
    if (code === "UNAUTHORIZED") {
      const target = await safeReturnTo(returnTo);
      redirect(`/login?returnTo=${encodeURIComponent(target)}`);
    }
    throw error;
  }
  throw new Error("unreachable");
}
