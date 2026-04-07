'use client';

import { useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label }  from '@/components/ui/label';

type MenuItem = {
  id:           string;
  label:        string;
  routePath:    string | null;
  sortOrder:    number;
  isVisible:    boolean;
  requiredRole: string | null;
  parentId:     string | null;
};

const ROLE_OPTIONS = ['', 'ADMIN', 'MANAGER', 'DEVELOPER', 'HR', 'VIEWER'];

type Props = { initialItems: MenuItem[] };

export function MenuEditor({ initialItems }: Props) {
  const [items, setItems]   = useState(() =>
    [...initialItems].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const move = (index: number, dir: -1 | 1) => {
    const next = [...items];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    const tmp = next[index]!;
    next[index] = next[target]!;
    next[target] = tmp;
    // Re-assign sortOrder
    next.forEach((item, i) => { item.sortOrder = i; });
    setItems(next);
  };

  const toggle = (id: string) => {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, isVisible: !item.isVisible } : item));
  };

  const setRole = (id: string, role: string) => {
    setItems((prev) => prev.map((item) => item.id === id ? { ...item, requiredRole: role || null } : item));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/admin/menus', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(items.map(({ id, sortOrder, isVisible, requiredRole }) => ({
          id, sortOrder, isVisible, requiredRole,
        }))),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-md divide-y">
        {items.map((item, i) => (
          <div key={item.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex flex-col gap-0.5">
              <button
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <button
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.routePath ?? '—'}</p>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor={`visible-${item.id}`} className="text-xs">Visible</Label>
                <input
                  id={`visible-${item.id}`}
                  type="checkbox"
                  checked={item.isVisible}
                  onChange={() => toggle(item.id)}
                  className="h-4 w-4 rounded border"
                />
              </div>

              <Select
                value={item.requiredRole ?? ''}
                onValueChange={(v) => setRole(item.id, v)}
              >
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Any role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>{r || '— Any role —'}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save All Changes'}
        </Button>
      </div>
    </div>
  );
}
