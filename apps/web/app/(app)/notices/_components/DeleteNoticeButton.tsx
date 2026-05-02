'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface DeleteNoticeButtonProps {
  noticeId: string;
}

export function DeleteNoticeButton({ noticeId }: DeleteNoticeButtonProps) {
  const t = useTranslations('Notices');
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (typeof window !== 'undefined' && !window.confirm(t('deleteConfirm'))) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/notices/${noticeId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast({
          variant: 'destructive',
          title: '삭제 실패',
          description: body?.error ?? 'Failed to delete',
        });
        return;
      }
      router.push('/notices');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleDelete}
      disabled={loading}
      className="border-destructive/40 text-destructive hover:bg-destructive/10"
      data-testid="notice-delete-button"
    >
      {t('delete')}
    </Button>
  );
}
