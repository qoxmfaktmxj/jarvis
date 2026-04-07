import { headers } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { getAuditLogs } from '@/lib/queries/admin';
import { AuditTable } from '@/components/admin/AuditTable';

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Immutable record of all admin and data-change actions.
        </p>
      </div>
      <AuditTable initialData={data} meta={{ ...meta, limit: meta.limit ?? 50 }} />
    </div>
  );
}
