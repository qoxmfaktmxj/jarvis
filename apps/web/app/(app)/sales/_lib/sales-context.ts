import { cookies, headers } from "next/headers";
import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

/**
 * 영업 도메인 server action 공통 컨텍스트.
 * Group 6 차트 라우트들이 공유. 권한은 SALES_ALL.
 */
export async function resolveSalesContext():
  Promise<
    | { ok: true; userId: string; workspaceId: string }
    | { ok: false; error: "Unauthorized" | "Forbidden" }
  > {
  const headerStore = await headers();
  const cookieStore = await cookies();
  const sessionId =
    headerStore.get("x-session-id") ??
    cookieStore.get("sessionId")?.value ??
    cookieStore.get("jarvis_session")?.value ??
    null;
  if (!sessionId) return { ok: false, error: "Unauthorized" };
  const session = await getSession(sessionId);
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!hasPermission(session, PERMISSIONS.SALES_ALL)) return { ok: false, error: "Forbidden" };
  return { ok: true, userId: session.userId, workspaceId: session.workspaceId };
}
