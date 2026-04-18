import { getTranslations } from 'next-intl/server';
import { BookOpen } from 'lucide-react';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { db } from '@jarvis/db/client';
import { wikiPageIndex } from '@jarvis/db/schema/wiki-page-index';
import { eq, and, desc, isNull, inArray, or, sql } from 'drizzle-orm';
import { resolveAllowedWikiSensitivities } from '@jarvis/auth/rbac';
import { mapDbSensitivity } from '@/components/WikiPageView';
import type { WikiPageMeta } from '@/components/WikiPageView';
import { PageHeader } from '@/components/patterns/PageHeader';
import { isoWeekNumber } from '@/lib/date-utils';
import { WikiIndexSearch } from './_components/WikiIndexSearch';

export const dynamic = 'force-dynamic';
export const metadata = { title: '위키' };

const PAGE_SIZE = 20;

export default async function WikiHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');
  const t = await getTranslations('Wiki');

  const workspaceId = session.workspaceId;
  const perms = session.permissions ?? [];
  const allowedSensitivities = resolveAllowedWikiSensitivities(perms);

  const params = await searchParams;
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const parsedPage = Number.parseInt(rawPage ?? '1', 10);
  const requestedPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  // No access at all
  if (allowedSensitivities.length === 0) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-7 w-7" /> {t('title')}
          </h1>
        </div>
        <p className="text-sm text-surface-400 italic">{t('accessDenied')}</p>
      </div>
    );
  }

  // Build conditions
  const conditions = [
    eq(wikiPageIndex.workspaceId, workspaceId),
    eq(wikiPageIndex.publishedStatus, 'published'),
    inArray(wikiPageIndex.sensitivity, allowedSensitivities),
  ];

  // requiredPermission filter: page is visible if requiredPermission IS NULL
  // or the caller has that permission or ADMIN_ALL
  if (!perms.includes(PERMISSIONS.ADMIN_ALL)) {
    conditions.push(
      or(
        isNull(wikiPageIndex.requiredPermission),
        inArray(wikiPageIndex.requiredPermission, perms.length > 0 ? perms : ['__none__']),
      )!,
    );
  }

  const whereClause = and(...conditions);

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
      sensitivity: wikiPageIndex.sensitivity,
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
      sensitivity: mapDbSensitivity(row.sensitivity),
      tags,
      updatedAt: row.updatedAt.toISOString(),
      workspaceId,
    };
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PageHeader
        stamp={`W${isoWeekNumber(new Date())}`}
        kicker="Wiki"
        title={t('title')}
      />

      <WikiIndexSearch
        pages={pages}
        workspaceId={workspaceId}
        total={total}
        currentPage={currentPage}
        totalPages={totalPages}
      />
    </div>
  );
}
