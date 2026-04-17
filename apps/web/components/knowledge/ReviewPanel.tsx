'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, XCircle, Send, Clock } from 'lucide-react';

type PublishStatus = 'draft' | 'review' | 'published' | 'archived';

interface ReviewPanelProps {
  pageId: string;
  publishStatus: PublishStatus;
  canReview: boolean; // has KNOWLEDGE_REVIEW permission
  canEdit: boolean;   // has KNOWLEDGE_UPDATE permission
}

const STATUS_LABELS: Record<PublishStatus, string> = {
  draft: 'Draft',
  review: 'In Review',
  published: 'Published',
  archived: 'Archived',
};

const STATUS_VARIANTS: Record<PublishStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  review: 'default',
  published: 'outline',
  archived: 'destructive',
};

export function ReviewPanel({ pageId, publishStatus, canReview, canEdit }: ReviewPanelProps) {
  const t = useTranslations('Knowledge.ReviewPanel');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const postReview = async (action: 'submit' | 'approve' | 'reject') => {
    setError(null);
    setSuccess(null);

    if (action === 'reject' && !comment.trim()) {
      setError('A comment is required when rejecting');
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch(`/api/knowledge/${pageId}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, comment: comment || undefined }),
        });

        const data = await res.json() as { error?: string; publishStatus?: string };

        if (!res.ok) {
          setError(data.error ?? 'Action failed');
          return;
        }

        const messages: Record<string, string> = {
          submit: 'Submitted for review',
          approve: 'Page approved and published',
          reject: 'Page rejected and returned to draft',
        };
        setSuccess(messages[action] ?? 'Done');
        setComment('');
        router.refresh();
      } catch {
        setError('Network error — please try again');
      }
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Publish Status</CardTitle>
          <Badge variant={STATUS_VARIANTS[publishStatus]}>{STATUS_LABELS[publishStatus]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {/* Submit for review (editor action) */}
        {publishStatus === 'draft' && canEdit && (
          <Button
            className="w-full"
            onClick={() => postReview('submit')}
            disabled={isPending}
          >
            <Send className="h-4 w-4 mr-2" />
            Submit for Review
          </Button>
        )}

        {/* Review actions (reviewer-only) */}
        {publishStatus === 'review' && canReview && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-surface-500">
              <Clock className="h-4 w-4" />
              This page is awaiting review
            </div>

            <div className="space-y-2">
              <Label htmlFor="review-comment">{t('comment')}</Label>
              <Textarea
                id="review-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Add a comment (required for rejection)"
                rows={3}
              />
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => postReview('approve')}
                disabled={isPending}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-danger text-danger hover:bg-danger-subtle"
                onClick={() => postReview('reject')}
                disabled={isPending}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
            </div>
          </div>
        )}

        {publishStatus === 'published' && (
          <p className="text-sm text-surface-500">
            This page is published. Edit it to create a new draft version.
          </p>
        )}

        {publishStatus === 'archived' && (
          <p className="text-sm text-surface-500">This page is archived.</p>
        )}
      </CardContent>
    </Card>
  );
}
