import path from "node:path";
import url from "node:url";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "../client.js";
import { user } from "../schema/user.js";
import { organization } from "../schema/tenant.js";
import { parseTsys305 } from "./parsers/parse-tsys305.js";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const DEFAULT_PATH = path.resolve(here, "../../../.local/TSYS305_사용자.sql");

export async function seedUsersFromTsys305(workspaceId: string, sqlPath = DEFAULT_PATH) {
  const raw = readFileSync(sqlPath, "utf8");
  const rows = parseTsys305(raw);
  if (rows.length === 0) {
    console.log("[seed/users] no rows parsed, skipping");
    return { upserted: 0 };
  }

  // Build orgCode → orgId map (same workspace).
  const orgs = await db
    .select({ id: organization.id, code: organization.code })
    .from(organization)
    .where(eq(organization.workspaceId, workspaceId));
  const orgByCode = new Map(orgs.map((o) => [o.code, o.id]));

  const values = rows.map((r) => ({
    workspaceId,
    employeeId: r.employeeId,
    name: r.name,
    email: r.email,
    phone: r.phone,
    orgId: r.orgCode ? orgByCode.get(r.orgCode) ?? null : null,
    position: r.position,
    jobTitle: r.jobTitle,
    status: r.status,
    isOutsourced: r.isOutsourced,
    employmentType: "internal" as const,
    passwordHash: r.passwordHash,
    preferences: r.loginId ? { loginId: r.loginId, orgNm: r.orgName } : { orgNm: r.orgName ?? undefined },
    updatedAt: r.updatedAt,
  }));

  // Idempotent: upsert on (employeeId) — workspace-global unique per current schema.
  // Email has a global unique constraint; TSYS305 data occasionally contains duplicate
  // emails across employees. On email conflict, retry with email=null to avoid blocking
  // the row (seed-time data quality issue, not a schema bug).
  let upserted = 0;
  let emailNulled = 0;
  for (const v of values) {
    const doUpsert = (emailVal: string | null) =>
      db
        .insert(user)
        .values({ ...v, email: emailVal })
        .onConflictDoUpdate({
          target: user.employeeId,
          set: {
            name: v.name,
            email: emailVal,
            phone: v.phone,
            orgId: v.orgId,
            position: v.position,
            jobTitle: v.jobTitle,
            status: v.status,
            isOutsourced: v.isOutsourced,
            passwordHash: v.passwordHash,
            preferences: v.preferences,
            updatedAt: v.updatedAt,
          },
        });

    try {
      await doUpsert(v.email);
    } catch (err: unknown) {
      const pgErr = err as { cause?: { constraint?: string } };
      if (pgErr?.cause?.constraint === "user_email_unique") {
        // Duplicate email in TSYS305 data — persist without email
        await doUpsert(null);
        emailNulled++;
      } else {
        throw err;
      }
    }
    upserted++;
  }

  if (emailNulled > 0) {
    console.log(`[seed/users] ${emailNulled} rows had duplicate email → stored as null`);
  }

  console.log(`[seed/users] upserted ${upserted} rows from TSYS305`);
  return { upserted };
}
