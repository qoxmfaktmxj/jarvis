"use server";

import { cookies, headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import {
  listAdditionalDev,
} from "@/lib/queries/additional-dev";

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

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

async function resolveAddDevContext() {
  const sessionId = await resolveSessionId();
  if (!sessionId) return { ok: false as const, error: "Unauthorized" };

  const session = await getSession(sessionId);
  if (!session) return { ok: false as const, error: "Unauthorized" };

  if (!hasPermission(session, PERMISSIONS.PROJECT_READ)) {
    return { ok: false as const, error: "Forbidden" };
  }

  return {
    ok: true as const,
    workspaceId: session.workspaceId,
  };
}

// ---------------------------------------------------------------------------
// listAddDev — read-only server action for AddDevGridContainer
// ---------------------------------------------------------------------------

export type ListAddDevInput = {
  q?: string;
  status?: string;
  part?: string;
  page?: number;
  pageSize?: number;
};

export async function listAddDev(input: ListAddDevInput = {}) {
  const ctx = await resolveAddDevContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error, data: [], total: 0 };

  const result = await listAdditionalDev({
    workspaceId: ctx.workspaceId,
    q: input.q || undefined,
    status: input.status || undefined,
    part: input.part || undefined,
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 20,
  });

  return {
    ok: true as const,
    data: result.data,
    total: result.pagination.total,
  };
}
