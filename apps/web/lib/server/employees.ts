"use server";
import { z } from "zod";
import { and, eq, ilike, or } from "drizzle-orm";
import { headers, cookies } from "next/headers";
import { db } from "@jarvis/db/client";
import { user } from "@jarvis/db/schema/user";
import { getSession } from "@jarvis/auth/session";

const searchEmployeesInput = z.object({
  q: z.string().transform((s) => s.trim()).pipe(z.string().min(2).max(50)),
  limit: z.number().int().min(1).max(50).default(10),
});

// Returning '' for callers that interpolate; null contract would be cleaner
// but requires Task 1 (EmployeePicker) refactor — deferred.
export type EmployeeHit = { sabun: string; name: string; email: string };

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

export async function searchEmployees(
  rawInput: z.input<typeof searchEmployeesInput>,
): Promise<EmployeeHit[]> {
  const sid = await resolveSessionId();
  if (!sid) throw new Error("Unauthorized");
  const session = await getSession(sid);
  if (!session) throw new Error("Unauthorized");

  const { q, limit } = searchEmployeesInput.parse(rawInput);

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
        eq(user.status, "active"),
        or(ilike(user.name, `%${q}%`), ilike(user.employeeId, `${q}%`)),
      ),
    )
    .limit(limit);

  return rows.map((r) => ({
    sabun: r.employeeId,
    name: r.name,
    email: r.email ?? "",
  }));
}
