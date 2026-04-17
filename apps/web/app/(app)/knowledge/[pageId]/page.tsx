import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { canAccessKnowledgeSensitivity, hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePage } from '@/lib/queries/knowledge';
import { PageViewer } from '@/components/knowledge/PageViewer';
import { PageMetaSidebar } from '@/components/knowledge/PageMetaSidebar';
import { PageHeader } from '@/components/patterns/PageHeader';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ pageId: string }> };

export default async function KnowledgePageView({ params }: Props) {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');
  const t = await getTranslations('Knowledge');

  const { pageId } = await params;
  const page = await getKnowledgePage(pageId, session.workspaceId, session.permissions ?? []);
  if (!page) notFound();

  if (!canAccessKnowledgeSensitivity(session, page.sensitivity ?? 'INTERNAL')) {
    notFound();
  }

  const canEdit = hasPermission(session, PERMISSIONS.KNOWLEDGE_UPDATE);
  const mdxContent = page.currentVersion?.mdxContent ?? '';

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* B4 Phase 1: Legacy route deprecation banner */}
      <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-200">
        <p>
          {t('deprecationBanner')}{' '}
          <Link href="/wiki" className="font-medium underline hover:text-amber-900 dark:hover:text-amber-100">
            {t('deprecationLink')}
          </Link>
        </p>
      </div>

      <PageHeader
        eyebrow="Knowledge"
        title={page.title}
        description={page.summary ?? undefined}
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_260px]">
        <article className="min-w-0">
          <PageViewer mdxContent={mdxContent} />
        </article>

        <PageMetaSidebar page={page} canEdit={canEdit} />
      </div>
    </div>
  );
}
