import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requirePageSession } from '@/lib/server/page-auth';
import { hasPermission } from '@jarvis/auth/rbac';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePage } from '@/lib/queries/knowledge';
import { PageViewer } from '@/components/knowledge/PageViewer';
import { PageMetaSidebar } from '@/components/knowledge/PageMetaSidebar';
import { PageShell } from '@/components/patterns/PageShell';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ pageId: string }> };

export default async function KnowledgePageView({ params }: Props) {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');
  const t = await getTranslations('Knowledge');

  const { pageId } = await params;
  const page = await getKnowledgePage(pageId, session.workspaceId, session.permissions ?? []);
  if (!page) notFound();

  const canEdit = hasPermission(session, PERMISSIONS.KNOWLEDGE_ADMIN);
  const mdxContent = page.currentVersion?.mdxContent ?? '';

  return (
    <PageShell title={page.title}>
      {/* B4 Phase 1: Legacy route deprecation banner */}
      <div className="rounded-md border border-(--color-warning) bg-(--color-warning-subtle) px-4 py-3 text-sm text-(--color-warning-strong) dark:border-(--color-warning) dark:bg-(--color-warning) dark:text-(--color-warning-subtle)">
        <p>
          {t('deprecationBanner')}{' '}
          <Link href="/wiki" className="font-medium underline hover:text-(--color-warning-strong) dark:hover:text-(--color-warning-subtle)">
            {t('deprecationLink')}
          </Link>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_260px]">
        <article className="min-w-0">
          <PageViewer mdxContent={mdxContent} />
        </article>

        <PageMetaSidebar page={page} canEdit={canEdit} />
      </div>
    </PageShell>
  );
}
