import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { db } from '@jarvis/db/client';
import { wikiPageIndex } from '@jarvis/db/schema/wiki-page-index';
import { eq, and, desc, sql } from 'drizzle-orm';
import type { WikiPageMeta } from '@/components/WikiPageView';
import { PageHeader } from '@/components/patterns/PageHeader';
import { WikiIndexSearch } from './_components/WikiIndexSearch';
import { WikiIndexShell } from './_components/WikiIndexShell';
import { DEFAULT_PAGE_SIZE } from "@jarvis/shared/constants/pagination";

export const dynamic = 'force-dynamic';

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

export default async function WikiHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');
  const t = await getTranslations('Wiki');

  const workspaceId = session.workspaceId;

  const params = await searchParams;
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const parsedPage = Number.parseInt(rawPage ?? '1', 10);
  const requestedPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  // Build conditions — RBAC enforced via requirePageSession above; row-level
  // sensitivity isolation removed in step 2A (2026-05-11).
  const whereClause = and(
    eq(wikiPageIndex.workspaceId, workspaceId),
    eq(wikiPageIndex.publishedStatus, 'published'),
  );

  const countRows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(wikiPageIndex)
    .where(whereClause);

  const total = countRows[0]?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const rows = await db
    .select({
      slug: wikiPageIndex.slug,
      routeKey: wikiPageIndex.routeKey,
      title: wikiPageIndex.title,
      frontmatter: wikiPageIndex.frontmatter,
      updatedAt: wikiPageIndex.updatedAt,
    })
    .from(wikiPageIndex)
    .where(whereClause)
    .orderBy(desc(wikiPageIndex.updatedAt))
    .limit(PAGE_SIZE)
    .offset(offset);

  const pages: WikiPageMeta[] = rows.map((row) => {
    const fmTags = (row.frontmatter as { tags?: unknown } | undefined)?.tags;
    const tags =
      Array.isArray(fmTags) && fmTags.every((t) => typeof t === 'string')
        ? (fmTags as string[])
        : [];
    return {
      slug: row.routeKey ?? row.slug,
      title: row.title,
      tags,
      updatedAt: row.updatedAt.toISOString(),
      workspaceId,
    };
  });

  return (
    <WikiIndexShell workspaceId={workspaceId}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <PageHeader title={t('title')} />

        <WikiIndexSearch
          pages={pages}
          workspaceId={workspaceId}
          total={total}
          currentPage={currentPage}
          totalPages={totalPages}
        />
      </div>
    </WikiIndexShell>
  );
}
