import { cookies, headers } from "next/headers";
import { hasPermission, isAdmin } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

/**
 * 영업 도메인 server action 공통 컨텍스트.
 * Group 6 차트 라우트들이 공유. 권한은 SALES_ALL.
 *
 * `isAdmin` flag (A4 P0-2): 도메인별 ACL/sensitivity bypass 로직이 admin 여부를
 *필요로 하므로 함께 반환한다. 사용처: `plan-view-permissions/actions.ts` 의
 * `checkPlanAcl` 등. admin 권한이 필요 없는 호출자는 무시해도 된다.
 */
export async function resolveSalesContext():
  Promise<
    | { ok: true; userId: string; workspaceId: string; isAdmin: boolean }
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
  if (!hasPermission(session, PERMISSIONS.SALES_ADMIN)) return { ok: false, error: "Forbidden" };
  return {
    ok: true,
    userId: session.userId,
    workspaceId: session.workspaceId,
    isAdmin: isAdmin(session),
  };
}
