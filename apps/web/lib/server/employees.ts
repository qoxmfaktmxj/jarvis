"use server";
import { z } from "zod";
import { and, eq, ilike, or } from "drizzle-orm";
import { headers, cookies } from "next/headers";
import { db } from "@jarvis/db/client";
import { user } from "@jarvis/db/schema/user";
import { getSession } from "@jarvis/auth/session";
import { resolveSessionId } from "@/lib/session-cookie";

export const searchEmployeesInput = z.object({
  q: z.string().min(2).max(50),
  limit: z.number().int().min(1).max(50).default(10),
});

export type EmployeeHit = { sabun: string; name: string; email: string };

async function resolveServerSessionId(): Promise<string | null> {
  const h = await headers();
  const fromHeader = h.get("x-session-id");
  if (fromHeader && fromHeader.length > 0) return fromHeader;
  const c = await cookies();
  return resolveSessionId(c);
}

export async function searchEmployees(
  rawInput: z.input<typeof searchEmployeesInput>,
): Promise<EmployeeHit[]> {
  const sid = await resolveServerSessionId();
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
