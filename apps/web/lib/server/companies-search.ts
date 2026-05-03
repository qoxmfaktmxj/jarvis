"use server";
import { z } from "zod";
import { and, eq, ilike, or } from "drizzle-orm";
import { headers, cookies } from "next/headers";
import { db } from "@jarvis/db/client";
import { company } from "@jarvis/db/schema/company";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";

const searchCompaniesInput = z.object({
  q: z.string().transform((s) => s.trim()).pipe(z.string().min(1).max(200)),
  limit: z.number().int().min(1).max(50).default(10),
  objectDiv: z.string().max(10).optional(),
});

export type CompanyHit = {
  id: string;
  code: string;
  name: string;
  objectDiv: string;
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

export async function searchCompanies(
  rawInput: z.input<typeof searchCompaniesInput>,
): Promise<CompanyHit[]> {
  const sid = await resolveSessionId();
  if (!sid) throw new Error("Unauthorized");
  const session = await getSession(sid);
  if (!session) throw new Error("Unauthorized");

  const allowedPerms = [
    PERMISSIONS.SALES_ALL,
    PERMISSIONS.MAINTENANCE_READ,
    PERMISSIONS.ADMIN_ALL,
  ];
  if (!allowedPerms.some((p) => hasPermission(session, p))) {
    throw new Error("Forbidden");
  }

  const { q, limit, objectDiv } = searchCompaniesInput.parse(rawInput);

  const conds = [
    eq(company.workspaceId, session.workspaceId),
    or(ilike(company.name, `%${q}%`), ilike(company.code, `${q}%`))!,
  ];
  if (objectDiv) conds.push(eq(company.objectDiv, objectDiv));

  const rows = await db
    .select({
      id: company.id,
      code: company.code,
      name: company.name,
      objectDiv: company.objectDiv,
    })
    .from(company)
    .where(and(...conds))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    objectDiv: r.objectDiv,
  }));
}
