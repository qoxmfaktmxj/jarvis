import { getTranslations } from 'next-intl/server';
import { BookOpen } from 'lucide-react';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { db } from '@jarvis/db/client';
import { wikiPageIndex } from '@jarvis/db/schema/wiki-page-index';
import { eq, and, desc, isNull, inArray, or } from 'drizzle-orm';
import { resolveAllowedWikiSensitivities } from '@jarvis/auth/rbac';
import { mapDbSensitivity } from '@/components/WikiPageView';
import type { WikiPageMeta } from '@/components/WikiPageView';
import { WikiIndexSearch } from './_components/WikiIndexSearch';

export const dynamic = 'force-dynamic';
export const metadata = { title: '위키' };

export default async function WikiHomePage() {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');
  const t = await getTranslations('Wiki');

  const workspaceId = session.workspaceId;
  const perms = session.permissions ?? [];
  const allowedSensitivities = resolveAllowedWikiSensitivities(perms);

  // No access at all
  if (allowedSensitivities.length === 0) {
    return (
      <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-7 w-7" /> {t('title')}
          </h1>
        </div>
        <p className="text-sm text-gray-400 italic">{t('accessDenied')}</p>
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
    .where(and(...conditions))
    .orderBy(desc(wikiPageIndex.updatedAt))
    .limit(50);

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
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-8">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BookOpen className="h-7 w-7" /> {t('title')}
        </h1>
      </div>

      <WikiIndexSearch pages={pages} workspaceId={workspaceId} />
    </div>
  );
}
