import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { PageEditor } from '@/components/knowledge/PageEditor';

export const dynamic = 'force-dynamic';

export default async function NewKnowledgePage() {
  await requirePageSession(PERMISSIONS.KNOWLEDGE_CREATE, '/knowledge');

  return <PageEditor mode="create" />;
}
