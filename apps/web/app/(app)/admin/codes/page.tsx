'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { CodeTable } from '@/components/admin/CodeTable';
import type { CodeGroup } from '@/lib/queries/admin';

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t('description')}</p>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <CodeTable initialGroups={groups} onRefresh={fetchGroups} />
      )}
    </div>
  );
}
