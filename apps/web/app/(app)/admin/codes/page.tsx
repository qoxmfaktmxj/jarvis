'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { CodeTable } from '@/components/admin/CodeTable';
import type { CodeGroup } from '@/lib/queries/admin';
import { PageHeader } from '@/components/patterns/PageHeader';

export default function AdminCodesPage() {
  const t = useTranslations('Admin.Codes');
  const [groups, setGroups]   = useState<CodeGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    const res  = await fetch('/api/admin/codes');
    const json = await res.json();
    setGroups(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  return (
    <div className="space-y-6">
      <PageHeader

        eyebrow="Admin · Codes"
        title={t('title')}
        description={t('description')}
      />
      {loading ? (
        <p className="text-sm text-surface-500">Loading...</p>
      ) : (
        <CodeTable initialGroups={groups} onRefresh={fetchGroups} />
      )}
    </div>
  );
}
