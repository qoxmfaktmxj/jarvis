"use server";

import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { user } from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";
import { cookies, headers } from "next/headers";

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

export type EmployeeMatch = {
  employeeId: string;
  name: string;
  email: string;
};

export async function searchEmployees(query: string): Promise<EmployeeMatch[]> {
  if (!query || query.length < 2) return [];

  const sessionId = await resolveSessionId();
  if (!sessionId) return [];
  const session = await getSession(sessionId);
  if (!session) return [];

  const q = `%${query}%`;
  const rows = await db
    .select({
      employeeId: user.employeeId,
      name: user.name,
      email: user.email,
    })
    .from(user)
    .where(
      and(
        eq(user.workspaceId, session.workspaceId),
        or(
          ilike(user.name, q),
          ilike(user.email, q),
          ilike(user.employeeId, q),
        ),
      ),
    )
    .limit(10);

  return rows.filter(
    (r): r is EmployeeMatch =>
      r.employeeId != null && r.name != null && r.email != null,
  );
}
