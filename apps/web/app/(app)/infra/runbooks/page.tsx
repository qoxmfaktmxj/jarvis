import { forbidden } from 'next/navigation';
import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@jarvis/db/client';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { buildWikiSensitivitySqlFilter } from '@jarvis/auth/rbac';
import { requirePageSession } from '@/lib/server/page-auth';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/patterns/PageHeader';
import { EmptyState } from '@/components/patterns/EmptyState';

export const dynamic = 'force-dynamic';

/**
 * Company Infra Dashboard — lists all `domain=infra` pages in the current
 * workspace grouped by `infra.companyCd`. Clicking a system opens the
 * wiki viewer at the page's `routeKey`.
 *
 * Query path: direct `wiki_page_index` projection (no API route needed).
 * Sensitivity filter: reuses `buildWikiSensitivitySqlFilter` so users who
 * cannot view RESTRICTED pages silently get the filtered subset — same
 * contract as `packages/ai/page-first/shortlist.ts`.
 */
type InfraRow = {
  id: string;
  route_key: string | null;
  title: string;
  slug: string;
  sensitivity: string;
  company_cd: string | null;
  env_type: string | null;
  connect_cd: string | null;
  domain_addr: string | null;
  updated_at: Date;
};

type CompanyGroup = {
  companyCd: string;
  systems: InfraRow[];
};

async function loadInfraPages(
  workspaceId: string,
  userPermissions: string[],
): Promise<CompanyGroup[]> {
  const sensitivityFilter = buildWikiSensitivitySqlFilter(userPermissions, {
    column: 'wpi.sensitivity',
  }).trim();
  const sensitivityClause = sensitivityFilter ? sql.raw(` ${sensitivityFilter}`) : sql.empty();

  const rows = await db.execute<InfraRow>(sql`
    SELECT
      wpi.id,
      wpi.route_key,
      wpi.title,
      wpi.slug,
      wpi.sensitivity,
      wpi.updated_at,
      wpi.frontmatter -> 'infra' ->> 'companyCd' AS company_cd,
      wpi.frontmatter -> 'infra' ->> 'envType'   AS env_type,
      wpi.frontmatter -> 'infra' ->> 'connectCd' AS connect_cd,
      wpi.frontmatter -> 'infra' ->> 'domainAddr' AS domain_addr
    FROM wiki_page_index wpi
    WHERE wpi.workspace_id = ${workspaceId}::uuid
      AND wpi.published_status = 'published'
      AND wpi.stale = FALSE
      AND wpi.frontmatter ->> 'domain' = 'infra'
      ${sensitivityClause}
    ORDER BY company_cd NULLS LAST, env_type, connect_cd, wpi.title
  `);

  const grouped = new Map<string, InfraRow[]>();
  for (const r of rows.rows) {
    const key = r.company_cd ?? '(unassigned)';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }
  return Array.from(grouped.entries())
    .map(([companyCd, systems]) => ({ companyCd, systems }))
    .sort((a, b) => a.companyCd.localeCompare(b.companyCd));
}

export default async function InfraDashboardPage() {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');
  if (!session.workspaceId) forbidden();

  const groups = await loadInfraPages(session.workspaceId, session.permissions ?? []);
  const totalSystems = groups.reduce((n, g) => n + g.systems.length, 0);

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="인프라 Runbook"
          description={`${groups.length}개 회사 / ${totalSystems}개 시스템`}
        />
        <Link
          href="/infra/import"
          className="mt-2 inline-flex shrink-0 items-center rounded-md border border-surface-300 bg-white px-3 py-1.5 text-sm font-medium text-surface-700 hover:bg-surface-50"
        >
          SQL 가져오기
        </Link>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          title="infra 페이지 없음"
          description="아직 생성된 infra-runbook 페이지가 없습니다."
        />
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section
              key={g.companyCd}
              className="rounded-lg border border-surface-200 bg-white"
              aria-labelledby={`company-${g.companyCd}`}
            >
              <header className="flex items-baseline justify-between gap-3 border-b border-surface-200 px-4 py-3">
                <h2
                  id={`company-${g.companyCd}`}
                  className="text-lg font-semibold text-surface-900"
                >
                  {g.companyCd}
                </h2>
                <span className="text-xs text-surface-500">{g.systems.length}개 시스템</span>
              </header>
              <ul className="divide-y divide-surface-200">
                {g.systems.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/wiki/${s.id ? '' : ''}${session.workspaceId}/${s.route_key ?? s.slug}`}
                      className="block px-4 py-3 hover:bg-surface-50"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-surface-900">{s.title}</span>
                        {s.env_type && (
                          <Badge variant="secondary">env/{s.env_type}</Badge>
                        )}
                        {s.connect_cd && (
                          <Badge variant="secondary">{s.connect_cd}</Badge>
                        )}
                      </div>
                      {s.domain_addr && (
                        <p className="mt-1 text-xs font-mono text-surface-600 break-all">
                          {s.domain_addr}
                        </p>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
