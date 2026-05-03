"use server";
import { z } from "zod";
import { and, eq, ilike, or } from "drizzle-orm";
import { headers, cookies } from "next/headers";
import { db } from "@jarvis/db/client";
import { company } from "@jarvis/db/schema";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

const searchCompaniesInput = z.object({
  q: z.string().transform((s) => s.trim()).pipe(z.string().min(2).max(50)),
  limit: z.number().int().min(1).max(50).default(10),
});

export type CompanyHit = { id: string; code: string; name: string };

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

export async function searchCompanies(
  rawInput: z.input<typeof searchCompaniesInput>,
): Promise<CompanyHit[]> {
  const sid = await resolveSessionId();
  if (!sid) throw new Error("Unauthorized");
  const session = await getSession(sid);
  if (!session) throw new Error("Unauthorized");
  const allowed =
    hasPermission(session, PERMISSIONS.SALES_ALL) ||
    hasPermission(session, PERMISSIONS.ADDITIONAL_DEV_READ) ||
    hasPermission(session, PERMISSIONS.ADDITIONAL_DEV_UPDATE) ||
    hasPermission(session, PERMISSIONS.ADDITIONAL_DEV_CREATE);
  if (!allowed) throw new Error("Forbidden");

  const { q, limit } = searchCompaniesInput.parse(rawInput);

  const rows = await db
    .select({ id: company.id, code: company.code, name: company.name })
    .from(company)
    .where(
      and(
        eq(company.workspaceId, session.workspaceId),
        or(ilike(company.name, `%${q}%`), ilike(company.code, `${q}%`)),
      ),
    )
    .limit(limit);

  return rows.map((r) => ({ id: r.id, code: r.code, name: r.name }));
}
