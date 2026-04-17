'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { OrgTree } from '@/components/admin/OrgTree';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns/PageHeader';
import type { OrgNode } from '@/lib/queries/admin';

export default function AdminOrgsPage() {
  const t = useTranslations('Admin.Organizations');
  const [tree, setTree]       = useState<OrgNode[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/admin/organizations');
    const json = await res.json();
    setTree(json.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTree(); }, [fetchTree]);

  const handleAddRoot = async () => {
    const code = prompt('Enter org code:');
    const name = prompt('Enter org name:');
    if (!code || !name) return;
    await fetch('/api/admin/organizations', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code, name, parentId: null }),
    });
    fetchTree();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        accent="AD"
        eyebrow="Admin · Organizations"
        title={t('title')}
        description={t('description')}
        meta={<Button onClick={handleAddRoot}>{t('addRoot')}</Button>}
      />
      {loading ? (
        <p className="text-sm text-surface-500">Loading...</p>
      ) : (
        <OrgTree initialTree={tree} onRefresh={fetchTree} />
      )}
    </div>
  );
}
