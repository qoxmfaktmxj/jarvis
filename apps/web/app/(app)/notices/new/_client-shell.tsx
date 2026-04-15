'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CreateNoticeInput } from '@jarvis/shared/validation';

// Tiptap relies on browser-only APIs; ssr:false is valid here because this is
// a Client Component.
const NoticeEditor = dynamic(
  () =>
    import('../_components/NoticeEditor').then((m) => m.NoticeEditor),
  { ssr: false },
);

export default function NewNoticeClientShell() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(data: CreateNoticeInput) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/notices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? 'Failed to create notice');
        return;
      }
      const json = (await res.json()) as { notice: { id: string } };
      router.push(`/notices/${json.notice.id}`);
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
      <NoticeEditor onSubmit={handleSubmit} loading={loading} />
    </div>
  );
}
