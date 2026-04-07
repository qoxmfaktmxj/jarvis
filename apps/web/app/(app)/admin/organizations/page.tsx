'use client';

import { useState, useEffect, useCallback } from 'react';
import { OrgTree } from '@/components/admin/OrgTree';
import { Button }  from '@/components/ui/button';
import type { OrgNode } from '@/lib/queries/admin';

export default function AdminOrgsPage() {
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Organizations</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage the organizational hierarchy.</p>
        </div>
        <Button onClick={handleAddRoot}>+ Add Root Node</Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : (
        <OrgTree initialTree={tree} onRefresh={fetchTree} />
      )}
    </div>
  );
}
