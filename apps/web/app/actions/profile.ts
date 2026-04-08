"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
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
