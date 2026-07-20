"use server";

import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, hashPassword, rotateSession, sessionCookieOptions, verifyPassword } from "@jarvis/auth";
import { appUser, auditLog, db } from "@jarvis/db";
import { buildAuditRow } from "@jarvis/shared/audit";
import { changePasswordInput } from "@jarvis/shared/validation/auth";
import { requireActionSession } from "@/lib/server/action-auth";

export type PasswordActionState = {
  status: "idle" | "success" | "error";
  errorCode?: "INVALID_INPUT" | "INVALID_CURRENT_PASSWORD" | "DEMO_READ_ONLY";
};

export async function changePasswordAction(
  _previous: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const session = await requireActionSession();
  if (session.accountType === "demo") {
    return { status: "error", errorCode: "DEMO_READ_ONLY" };
  }

  const parsed = changePasswordInput.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { status: "error", errorCode: "INVALID_INPUT" };
  }

  const [user] = await db
    .select({ passwordHash: appUser.passwordHash })
    .from(appUser)
    .where(
      and(
        eq(appUser.id, session.userId),
        eq(appUser.workspaceId, session.workspaceId),
        eq(appUser.accountType, "human"),
        eq(appUser.status, "active"),
      ),
    )
    .limit(1);
  if (!user?.passwordHash || !(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
    return { status: "error", errorCode: "INVALID_CURRENT_PASSWORD" };
  }

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db.transaction(async (tx) => {
    await tx
      .update(appUser)
      .set({ passwordHash, updatedAt: new Date() })
      .where(and(eq(appUser.id, session.userId), eq(appUser.workspaceId, session.workspaceId)));
    await tx.insert(auditLog).values(
      buildAuditRow({
        workspaceId: session.workspaceId,
        userId: session.userId,
        action: "profile.password.change",
        resourceType: "app_user",
        resourceId: session.userId,
        details: {},
      }),
    );
  });

  const issued = await rotateSession({
    currentSessionId: session.id,
    userId: session.userId,
  });
  (await cookies()).set(SESSION_COOKIE_NAME, issued.sessionId, sessionCookieOptions(issued.expiresAt));
  return { status: "success" };
}
