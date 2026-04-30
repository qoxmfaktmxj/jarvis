import path from "node:path";
import url from "node:url";
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db } from "../client.js";
import { company } from "../schema/company.js";
import { parseTsmt001 } from "./parsers/parse-tsmt001.js";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const DEFAULT_PATH = path.resolve(here, "../../../.local/TSMT001_회사마스터.sql");

export async function seedCompaniesFromTsmt001(workspaceId: string, sqlPath = DEFAULT_PATH) {
  const raw = readFileSync(sqlPath, "utf8");
  const rows = parseTsmt001(raw);
  if (rows.length === 0) {
    console.log("[seed/companies] no rows parsed, skipping");
    return { upserted: 0 };
  }

  const values = rows.map((r) => ({
    workspaceId,
    code: r.code,
    name: r.name,
    groupCode: r.groupCode,
    objectDiv: r.objectDiv,
    manageDiv: r.manageDiv,
    representCompany: r.representCompany,
    startDate: r.startDate,
    industryCode: r.industryCode,
    zip: r.zip,
    address: r.address,
    homepage: r.homepage,
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt,
  }));

  const result = await db
    .insert(company)
    .values(values)
    .onConflictDoUpdate({
      target: [company.workspaceId, company.code, company.objectDiv],
      set: {
        name: sql`excluded.name`,
        groupCode: sql`excluded.group_code`,
        manageDiv: sql`excluded.manage_div`,
        representCompany: sql`excluded.represent_company`,
        startDate: sql`excluded.start_date`,
        industryCode: sql`excluded.industry_code`,
        zip: sql`excluded.zip`,
        address: sql`excluded.address`,
        homepage: sql`excluded.homepage`,
        updatedBy: sql`excluded.updated_by`,
        updatedAt: sql`excluded.updated_at`,
      },
    })
    .returning({ id: company.id });

  console.log(`[seed/companies] upserted ${result.length} rows from TSMT001`);
  return { upserted: result.length };
}
