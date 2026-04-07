import { headers } from 'next/headers';
import { db } from '@jarvis/db/client';
import { reviewRequest, user, knowledgePage } from '@jarvis/db/schema';
import { getSession } from '@jarvis/auth/session';
import { eq, and } from 'drizzle-orm';
import { Badge }  from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import Link       from 'next/link';

export default async function ReviewQueuePage() {
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
        <h1 className="text-2xl font-bold tracking-tight">Review Queue</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Pending knowledge page review requests — {pending.length} awaiting action.
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="border rounded-md p-8 text-center text-muted-foreground">
          No pending reviews. Queue is clear.
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
                  {item.pageTitle ?? 'Untitled'}
                </Link>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Requested by {item.requesterName ?? 'Unknown'}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0">PENDING</Badge>
              <div className="flex gap-2 shrink-0">
                <form action={`/api/review/${item.id}/approve`} method="POST">
                  <Button type="submit" size="sm" variant="default">Approve</Button>
                </form>
                <form action={`/api/review/${item.id}/reject`} method="POST">
                  <Button type="submit" size="sm" variant="secondary">Reject</Button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
