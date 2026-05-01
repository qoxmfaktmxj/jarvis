import { cookies, headers } from "next/headers";
import { hasPermission } from "@jarvis/auth";
import { getSession } from "@jarvis/auth/session";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

export type ProjectActionContext = {
  userId: string;
  workspaceId: string;
  ipAddress: string | null;
  userAgent: string | null;
};

export type ProjectActionError = {
  ok: false;
  error: string;
};

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

export async function resolveProjectContext(
  permission: string
): Promise<(ProjectActionContext & { ok: true }) | ProjectActionError> {
  const sessionId = await resolveSessionId();
  if (!sessionId) return { ok: false, error: "Unauthorized" };

  const session = await getSession(sessionId);
  if (!session) return { ok: false, error: "Unauthorized" };
  if (!hasPermission(session, permission)) return { ok: false, error: "Forbidden" };

  const headerStore = await headers();
  return {
    ok: true,
    userId: session.userId,
    workspaceId: session.workspaceId,
    ipAddress:
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      headerStore.get("x-real-ip") ??
      null,
    userAgent: headerStore.get("user-agent") ?? null,
  };
}

export function missingMutationPermission(
  ctx: ProjectActionContext,
  input: { creates: unknown[]; updates: unknown[]; deletes: unknown[] },
  has: (permission: string) => boolean
): string | null {
  if (input.creates.length > 0 && !has(PERMISSIONS.PROJECT_CREATE)) {
    return "Forbidden: project:create required";
  }
  if (input.updates.length > 0 && !has(PERMISSIONS.PROJECT_UPDATE)) {
    return "Forbidden: project:update required";
  }
  if (input.deletes.length > 0 && !has(PERMISSIONS.PROJECT_DELETE)) {
    return "Forbidden: project:delete required";
  }
  void ctx;
  return null;
}

export async function resolveProjectMutationContext(
  input: { creates: unknown[]; updates: unknown[]; deletes: unknown[] }
): Promise<(ProjectActionContext & { ok: true }) | ProjectActionError> {
  const sessionId = await resolveSessionId();
  if (!sessionId) return { ok: false, error: "Unauthorized" };

  const session = await getSession(sessionId);
  if (!session) return { ok: false, error: "Unauthorized" };

  const ctx = await resolveProjectContext(PERMISSIONS.PROJECT_READ);
  if (!ctx.ok) return ctx;

  const missing = missingMutationPermission(ctx, input, (permission) => hasPermission(session, permission));
  if (missing) return { ok: false, error: missing };
  return ctx;
}
