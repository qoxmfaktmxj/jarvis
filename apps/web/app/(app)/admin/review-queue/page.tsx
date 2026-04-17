import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { db } from '@jarvis/db/client';
import { reviewRequest, user, knowledgePage } from '@jarvis/db/schema';
import { getSession } from '@jarvis/auth/session';
import { REVIEW_KINDS, type ReviewKind } from '@jarvis/shared/constants';
import { and, desc, eq, sql } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { FilterBar } from './_components/FilterBar';
import { ApprovalDialog } from './_components/ApprovalDialog';
import { Pagination } from './_components/Pagination';
import { PageHeader } from '@/components/patterns/PageHeader';
import { DataTableShell } from '@/components/patterns/DataTableShell';
import { EmptyState } from '@/components/patterns/EmptyState';

const STATUS_VALUES = ['pending', 'approved', 'rejected', 'deferred', 'all'] as const;
type StatusValue = (typeof STATUS_VALUES)[number];
type KindValue = ReviewKind | 'all';

const PAGE_SIZE = 20;

interface ReviewQueuePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function pickStatus(raw: string | undefined): StatusValue {
  if (raw && (STATUS_VALUES as readonly string[]).includes(raw)) {
    return raw as StatusValue;
  }
  return 'pending';
}

function pickKind(raw: string | undefined): KindValue {
  if (raw && (REVIEW_KINDS as readonly string[]).includes(raw)) {
    return raw as ReviewKind;
  }
  return 'all';
}

function pickPage(raw: string | undefined): number {
  const n = raw ? Number.parseInt(raw, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default async function ReviewQueuePage({ searchParams }: ReviewQueuePageProps) {
  const t = await getTranslations('Admin.ReviewQueue');
  const headersList = await headers();
  const session = await getSession(headersList.get('x-session-id') ?? '');

  const sp = await searchParams;
  const status = pickStatus(typeof sp.status === 'string' ? sp.status : undefined);
  const kind = pickKind(typeof sp.kind === 'string' ? sp.kind : undefined);
  const page = pickPage(typeof sp.page === 'string' ? sp.page : undefined);

  if (!session) throw new Error("unauthenticated");
  const workspaceId = session.workspaceId;

  const baseFilters = [eq(reviewRequest.workspaceId, workspaceId)];
  if (status !== 'all') baseFilters.push(eq(reviewRequest.status, status));
  if (kind !== 'all') baseFilters.push(eq(reviewRequest.kind, kind));
  const where = and(...baseFilters);

  const totalRows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(reviewRequest)
    .where(where);
  const total = totalRows[0]?.total ?? 0;

  const items = await db
    .select({
      id: reviewRequest.id,
      status: reviewRequest.status,
      kind: reviewRequest.kind,
      createdAt: reviewRequest.createdAt,
      pageId: reviewRequest.pageId,
      pageTitle: knowledgePage.title,
      requesterName: user.name,
    })
    .from(reviewRequest)
    .leftJoin(knowledgePage, eq(knowledgePage.id, reviewRequest.pageId))
    .leftJoin(user, eq(user.id, reviewRequest.requesterId))
    .where(where)
    .orderBy(desc(reviewRequest.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <PageHeader
        accent="AD"
        eyebrow="Admin · Review Queue"
        title={t('title')}
        description={t('descriptionPending', { count: total })}
      />

      <DataTableShell
        rowCount={items.length}
        filters={<FilterBar status={status} kind={kind} />}
        empty={<EmptyState title={t('empty')} />}
        pagination={totalPages > 1 ? <Pagination page={page} totalPages={totalPages} /> : undefined}
      >
        <ul className="divide-y divide-surface-200">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/knowledge/${item.pageId}`}
                  className="block truncate text-sm font-medium text-surface-900 hover:underline"
                >
                  {item.pageTitle ?? t('untitled')}
                </Link>
                <p className="mt-0.5 text-xs text-surface-500">
                  {t('requestedBy')} {item.requesterName ?? 'Unknown'}
                </p>
              </div>
              {item.kind ? (
                <Badge variant="secondary" className="shrink-0">
                  {item.kind}
                </Badge>
              ) : null}
              <Badge variant="outline" className="shrink-0">
                {t(`statusFilter.${item.status as StatusValue}` as never)}
              </Badge>
              {item.status === 'pending' ? (
                <div className="flex shrink-0 gap-2">
                  <ApprovalDialog
                    item={{
                      id: item.id,
                      pageTitle: item.pageTitle,
                      status: item.status,
                      kind: item.kind,
                      requesterName: item.requesterName,
                    }}
                    action="approve"
                  >
                    <Button type="button" size="sm" variant="default">
                      {t('approve')}
                    </Button>
                  </ApprovalDialog>
                  <ApprovalDialog
                    item={{
                      id: item.id,
                      pageTitle: item.pageTitle,
                      status: item.status,
                      kind: item.kind,
                      requesterName: item.requesterName,
                    }}
                    action="reject"
                  >
                    <Button type="button" size="sm" variant="secondary">
                      {t('reject')}
                    </Button>
                  </ApprovalDialog>
                  <ApprovalDialog
                    item={{
                      id: item.id,
                      pageTitle: item.pageTitle,
                      status: item.status,
                      kind: item.kind,
                      requesterName: item.requesterName,
                    }}
                    action="defer"
                  >
                    <Button type="button" size="sm" variant="outline">
                      {t('defer')}
                    </Button>
                  </ApprovalDialog>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </DataTableShell>
    </div>
  );
}
