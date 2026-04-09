import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { db } from '@jarvis/db/client';
import { reviewRequest, user, knowledgePage } from '@jarvis/db/schema';
import { getSession } from '@jarvis/auth/session';
import { eq, and } from 'drizzle-orm';
import { Badge }  from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link       from 'next/link';

export default async function ReviewQueuePage() {
  const t = await getTranslations('Admin.ReviewQueue');
  const headersList = await headers();
  const session     = await getSession(headersList.get('x-session-id') ?? '');

  const pending = await db
    .select({
      id:            reviewRequest.id,
      status:        reviewRequest.status,
      createdAt:     reviewRequest.createdAt,
      pageId:        reviewRequest.pageId,
      pageTitle:     knowledgePage.title,
      requesterName: user.name,
    })
    .from(reviewRequest)
    .leftJoin(knowledgePage, eq(knowledgePage.id, reviewRequest.pageId))
    .leftJoin(user,          eq(user.id,          reviewRequest.requesterId))
    .where(
      and(
        eq(reviewRequest.workspaceId, session!.workspaceId),
        eq(reviewRequest.status, 'pending'),
      ),
    )
    .orderBy(reviewRequest.createdAt);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {t('descriptionPending', { count: pending.length })}
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="border rounded-md p-8 text-center text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="border rounded-md divide-y">
          {pending.map((item) => (
            <div key={item.id} className="flex items-center gap-4 px-4 py-3">
              <div className="flex-1 min-w-0">
                <Link
                  href={`/knowledge/${item.pageId}`}
                  className="text-sm font-medium hover:underline truncate block"
                >
                  {item.pageTitle ?? t('untitled')}
                </Link>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t('requestedBy')} {item.requesterName ?? 'Unknown'}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0">{t('pending')}</Badge>
              <div className="flex gap-2 shrink-0">
                <form action={`/api/review/${item.id}/approve`} method="POST">
                  <Button type="submit" size="sm" variant="default">{t('approve')}</Button>
                </form>
                <form action={`/api/review/${item.id}/reject`} method="POST">
                  <Button type="submit" size="sm" variant="secondary">{t('reject')}</Button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
