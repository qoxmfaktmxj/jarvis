'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { RichTextEditor } from '@/components/RichTextEditor/RichTextEditor';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type {
  CreateNoticeInput,
  NoticeSensitivity,
} from '@jarvis/shared/validation';

interface NoticeEditorProps {
  initialData?: Partial<{
    title: string;
    bodyMd: string;
    sensitivity: NoticeSensitivity;
    pinned: boolean;
    publishedAt: string | null;
    expiresAt: string | null;
  }>;
  onSubmit: (data: CreateNoticeInput) => void | Promise<void>;
  loading: boolean;
}

/**
 * Convert ISO timestamp to value usable by `<input type="datetime-local">`.
 * The input expects "YYYY-MM-DDTHH:mm" with no timezone suffix.
 */
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocal(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function NoticeEditor({
  initialData,
  onSubmit,
  loading,
}: NoticeEditorProps) {
  const t = useTranslations('Notices');
  const [title, setTitle] = useState(initialData?.title ?? '');
  const [bodyMd, setBodyMd] = useState(initialData?.bodyMd ?? '');
  const [sensitivity, setSensitivity] = useState<NoticeSensitivity>(
    initialData?.sensitivity ?? 'INTERNAL',
  );
  const [pinned, setPinned] = useState(initialData?.pinned ?? false);
  const [publishedAt, setPublishedAt] = useState(
    toDatetimeLocal(initialData?.publishedAt ?? null),
  );
  const [expiresAt, setExpiresAt] = useState(
    toDatetimeLocal(initialData?.expiresAt ?? null),
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit({
      title: title.trim(),
      bodyMd,
      sensitivity,
      pinned,
      publishedAt: fromDatetimeLocal(publishedAt),
      expiresAt: fromDatetimeLocal(expiresAt),
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4"
      data-testid="notice-editor"
    >
      <div className="space-y-1">
        <Label htmlFor="notice-title">{t('fields.title')}</Label>
        <Input
          id="notice-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={500}
          required
        />
      </div>

      <div className="space-y-1">
        <Label>{t('fields.body')}</Label>
        <RichTextEditor
          value={bodyMd}
          onChange={setBodyMd}
          minHeight="320px"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="notice-sensitivity">{t('sensitivity.label')}</Label>
          <select
            id="notice-sensitivity"
            value={sensitivity}
            onChange={(e) =>
              setSensitivity(e.target.value as NoticeSensitivity)
            }
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="INTERNAL">{t('sensitivity.INTERNAL')}</option>
            <option value="PUBLIC">{t('sensitivity.PUBLIC')}</option>
          </select>
        </div>

        <div className="flex items-end gap-2">
          <input
            id="notice-pinned"
            type="checkbox"
            checked={pinned}
            onChange={(e) => setPinned(e.target.checked)}
            className="h-4 w-4"
          />
          <Label htmlFor="notice-pinned">{t('pinned')}</Label>
        </div>

        <div className="space-y-1">
          <Label htmlFor="notice-published-at">{t('publishedAt')}</Label>
          <Input
            id="notice-published-at"
            type="datetime-local"
            value={publishedAt}
            onChange={(e) => setPublishedAt(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="notice-expires-at">{t('expiresAt')}</Label>
          <Input
            id="notice-expires-at"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={loading || !title.trim() || !bodyMd}>
          {t('actions.save')}
        </Button>
      </div>
    </form>
  );
}
