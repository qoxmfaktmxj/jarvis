import { notFound } from 'next/navigation';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePage } from '@/lib/queries/knowledge';
import { PageEditor } from '@/components/knowledge/PageEditor';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ pageId: string }> };

export default async function EditKnowledgePage({ params }: Props) {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_UPDATE, '/knowledge');

  const { pageId } = await params;
  const page = await getKnowledgePage(pageId, session.workspaceId);
  if (!page) notFound();

  const frontmatter = (page.currentVersion?.frontmatter ?? {}) as Record<string, unknown>;
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags as string[] : [];

  return (
    <PageEditor
      mode="edit"
      pageId={pageId}
      initialValues={{
        title: page.title,
        slug: page.slug,
        pageType: page.pageType,
        sensitivity: page.sensitivity ?? 'INTERNAL',
        mdxContent: page.currentVersion?.mdxContent ?? '',
        tags,
        summary: page.summary ?? '',
      }}
    />
  );
}
