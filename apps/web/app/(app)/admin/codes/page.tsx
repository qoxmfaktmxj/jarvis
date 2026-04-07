'use client';

import { useState, useEffect, useCallback } from 'react';
import { CodeTable } from '@/components/admin/CodeTable';
import type { CodeGroup } from '@/lib/queries/admin';

export default function AdminCodesPage() {
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
        <h1 className="text-2xl font-bold tracking-tight">Code Master</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage system code groups and values.</p>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <CodeTable initialGroups={groups} onRefresh={fetchGroups} />
      )}
    </div>
  );
}
