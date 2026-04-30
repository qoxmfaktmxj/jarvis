"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { db } from "@jarvis/db/client";
import { menuItem } from "@jarvis/db/schema";
import { and, eq, isNull } from "drizzle-orm";

function normalizeMenuIds(menuIds: string[]) {
  return Array.from(new Set(menuIds.filter(Boolean)));
}

async function resolveSessionId() {
  const headerStore = await headers();
  const cookieStore = await cookies();

  return (
    headerStore.get("x-session-id") ??
    cookieStore.get("sessionId")?.value ??
    cookieStore.get("jarvis_session")?.value ??
    null
  );
}

export async function updateQuickMenuOrder(
  menuIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const sessionId = await resolveSessionId();
  if (!sessionId) {
    return { success: false, error: "Unauthorized" };
  }

  const session = await getSession(sessionId);
  if (!session) {
    return { success: false, error: "Unauthorized" };
  }

  // P1 #8 — menu_item.sortOrder 는 워크스페이스 공용 컬럼이라 일반 직원이
  // 무권한으로 사이드바·대시보드 메뉴 순서를 모든 사용자에게 강제할 수 있었음.
  // admin/menus PUT 과 동일하게 ADMIN_ALL 게이트를 강제한다.
  if (!hasPermission(session, PERMISSIONS.ADMIN_ALL)) {
    return { success: false, error: "forbidden" };
  }

  const uniqueMenuIds = normalizeMenuIds(menuIds);

  try {
    await Promise.all(
      uniqueMenuIds.map((id, index) =>
        db
          .update(menuItem)
          .set({
            sortOrder: index,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(menuItem.id, id),
              eq(menuItem.workspaceId, session.workspaceId),
              isNull(menuItem.parentId),
              eq(menuItem.isVisible, true)
            )
          )
      )
    );
  } catch (err) {
    console.error("updateQuickMenuOrder failed:", err);
    return { success: false, error: "Failed to update menu order" };
  }

  revalidatePath("/dashboard");
  revalidatePath("/profile");

  return { success: true };
}
