"use server";
import { z } from "zod";
import { and, eq, ilike, or } from "drizzle-orm";
import { headers, cookies } from "next/headers";
import { db } from "@jarvis/db/client";
import { user } from "@jarvis/db/schema/user";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

const searchEmployeesInput = z.object({
  q: z.string().transform((s) => s.trim()).pipe(z.string().min(2).max(50)),
  limit: z.number().int().min(1).max(50).default(10),
});

// `userId` is the user table PK (uuid). Sales edit forms (opportunities,
// activities, …) need this to populate uuid columns like `insUserId` /
// `attendeeUserId` — without it the picker only exposes sabun (a varchar
// employee number) which would fail uuid validation server-side.
// `email` returns '' for callers that interpolate; null contract is cleaner
// but requires a separate EmployeePicker refactor — deferred.
export type EmployeeHit = { userId: string; sabun: string; name: string; email: string };

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
  // Generalized: any domain that needs to pick an engineer/employee can call
  // this. Add the relevant read-permission to the OR list when introducing a
  // new domain (sales, maintenance, etc.).
  const allowedPerms = [
    PERMISSIONS.SALES_ALL,
    PERMISSIONS.MAINTENANCE_READ,
    PERMISSIONS.ADMIN_ALL,
    PERMISSIONS.USER_READ,
  ];
  if (!allowedPerms.some((p) => hasPermission(session, p))) {
    throw new Error("Forbidden");
  }

  const { q, limit } = searchEmployeesInput.parse(rawInput);

  const rows = await db
    .select({
      id: user.id,
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
    userId: r.id,
    sabun: r.employeeId,
    name: r.name,
    email: r.email ?? "",
  }));
}
