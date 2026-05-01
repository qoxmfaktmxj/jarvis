/**
 * apps/web/lib/queries/infra-license.ts
 *
 * 인프라 라이선스 화면(admin/infra/licenses)에서 사용하는 read-only 쿼리.
 * 본 파일은 admin/infra/licenses/page.tsx (RSC) 에서만 사용한다.
 *
 * 쓰기/감사 로깅은 actions.ts (`saveInfraLicenses`)에서 담당.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { company } from "@jarvis/db/schema";

export type CompanyLookupOption = { value: string; label: string };

/**
 * 회사 lookup용 옵션 목록.
 * InfraLicensesGrid의 회사 select 셀에서 사용한다.
 */
export async function listCompanyOptions(workspaceId: string): Promise<CompanyLookupOption[]> {
  const rows = await db
    .select({ id: company.id, code: company.code, name: company.name })
    .from(company)
    .where(eq(company.workspaceId, workspaceId))
    .orderBy(asc(company.code));
  return rows.map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` }));
}

/**
 * 단일 회사를 조회한다 (audit 시 회사명 stamping 등에서 사용).
 * 사용처가 없으면 추후 제거 가능.
 */
export async function getCompanyById(workspaceId: string, id: string) {
  const [row] = await db
    .select({ id: company.id, code: company.code, name: company.name })
    .from(company)
    .where(and(eq(company.workspaceId, workspaceId), eq(company.id, id)))
    .limit(1);
  return row ?? null;
}
