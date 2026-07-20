import "server-only";

import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  requirePermission as requireLowLevelPermission,
  requireSession as requireLowLevelSession,
  type AuthSession,
} from "@jarvis/auth";
import type { Permission } from "@jarvis/shared/constants/permissions";

async function actionSessionId(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function requireActionSession(): Promise<AuthSession> {
  return requireLowLevelSession({ sessionId: await actionSessionId() });
}

export async function requireActionPermission(permission: Permission): Promise<AuthSession> {
  return requireLowLevelPermission({
    sessionId: await actionSessionId(),
    permission,
  });
}
