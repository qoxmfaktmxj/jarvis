import { forbidden } from 'next/navigation';
import Link from 'next/link';
import { sql } from 'drizzle-orm';
import { db } from '@jarvis/db/client';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { requirePageSession } from '@/lib/server/page-auth';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/patterns/EmptyState';
import { PageShell } from '@/components/patterns/PageShell';

export const dynamic = 'force-dynamic';

/**
 * Company Infra Dashboard — lists all `domain=infra` pages in the current
 * workspace grouped by `infra.companyCd`. Clicking a system opens the
 * wiki viewer at the page's `routeKey`.
 *
 * Query path: direct `wiki_page_index` projection (no API route needed).
 * 2026-05-11: sensitivity 컬럼 제거 (D4=A). KNOWLEDGE_READ + workspaceId 만으로 격리.
 */
type InfraRow = {
  id: string;
  route_key: string | null;
  title: string;
  slug: string;
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
  _userPermissions: string[],
): Promise<CompanyGroup[]> {
  const rows = await db.execute<InfraRow>(sql`
    SELECT
      wpi.id,
      wpi.route_key,
      wpi.title,
      wpi.slug,
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
    <PageShell
      title="인프라 Runbook"
      actions={
        <Link
          href="/infra/import"
          className="inline-flex shrink-0 items-center rounded-md border border-(--border-default) bg-(--bg-page) px-3 py-1.5 text-sm font-medium text-(--fg-secondary) hover:bg-(--bg-surface)"
        >
          SQL 가져오기
        </Link>
      }
    >
      {groups.length === 0 ? (
        <EmptyState
          title="infra 페이지 없음"
          description="아직 생성된 infra-runbook 페이지가 없습니다."
        />
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <section
              key={g.companyCd}
              className="rounded-lg border border-(--border-default) bg-(--bg-surface)"
              aria-labelledby={`company-${g.companyCd}`}
            >
              <header className="flex items-baseline justify-between gap-3 border-b border-(--border-default) px-4 py-3">
                <h2
                  id={`company-${g.companyCd}`}
                  className="text-lg font-semibold text-(--fg-primary)"
                >
                  {g.companyCd}
                </h2>
                <span className="text-xs text-(--fg-secondary)">{g.systems.length}개 시스템</span>
              </header>
              <ul className="divide-y divide-(--border-default)">
                {g.systems.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/wiki/${s.id ? '' : ''}${session.workspaceId}/${s.route_key ?? s.slug}`}
                      className="block px-4 py-3 hover:bg-(--bg-page)"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-(--fg-primary)">{s.title}</span>
                        {s.env_type && (
                          <Badge variant="secondary">env/{s.env_type}</Badge>
                        )}
                        {s.connect_cd && (
                          <Badge variant="secondary">{s.connect_cd}</Badge>
                        )}
                      </div>
                      {s.domain_addr && (
                        <p className="mt-1 text-xs font-mono text-(--fg-secondary) break-all">
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
    </PageShell>
  );
}
