import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { getSession } from '@jarvis/auth/session';
import { getAuditLogs } from '@/lib/queries/admin';
import { AuditTable } from '@/components/admin/AuditTable';
import { PageHeader } from '@/components/patterns/PageHeader';

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const t = await getTranslations('Admin.Audit');
  const headersList = await headers();
  const session     = await getSession(headersList.get('x-session-id') ?? '');
  const params      = await searchParams;

  const { data, meta } = await getAuditLogs(session!.workspaceId, {
    userId:       params.userId,
    action:       params.action,
    resourceType: params.resourceType,
    dateFrom:     params.dateFrom,
    dateTo:       params.dateTo,
    page:         params.page ? Number(params.page) : 1,
    limit:        50,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        accent="AD"
        eyebrow="Admin · Audit"
        title={t('title')}
        description={t('description')}
      />
      <AuditTable initialData={data} meta={{ ...meta, limit: meta.limit ?? 50 }} />
    </div>
  );
}
