'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type {
  CreateNoticeInput,
  NoticeSensitivity,
} from '@jarvis/shared/validation';

const NoticeEditor = dynamic(
  () =>
    import('../../_components/NoticeEditor').then((m) => m.NoticeEditor),
  { ssr: false },
);

interface EditNoticeClientShellProps {
  noticeId: string;
  initialData: {
    title: string;
    bodyMd: string;
    sensitivity: NoticeSensitivity;
    pinned: boolean;
    publishedAt: string | null;
    expiresAt: string | null;
  };
}

export default function EditNoticeClientShell({
  noticeId,
  initialData,
}: EditNoticeClientShellProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(data: CreateNoticeInput) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notices/${noticeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? 'Failed to update notice');
        return;
      }
      router.push(`/notices/${noticeId}`);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <NoticeEditor
        initialData={initialData}
        onSubmit={handleSubmit}
        loading={loading}
      />
    </div>
  );
}
