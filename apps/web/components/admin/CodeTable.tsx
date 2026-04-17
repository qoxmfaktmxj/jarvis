'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge }  from '@/components/ui/badge';
import { Input }  from '@/components/ui/input';
import type { CodeGroup } from '@/lib/queries/admin';

type Props = {
  initialGroups: CodeGroup[];
  onRefresh:     () => void;
};

export function CodeTable({ initialGroups, onRefresh }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(initialGroups.map((g) => g.id)));
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editName,    setEditName]    = useState('');

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });

  const handleAddItem = async (groupId: string) => {
    const code = prompt('Code (e.g. APPROVED):');
    const name = prompt('Name:');
    if (!code || !name) return;
    await fetch('/api/admin/codes', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ groupId, code, name }),
    });
    onRefresh();
  };

  const handleSaveItem = async (id: string) => {
    await fetch('/api/admin/codes', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, name: editName }),
    });
    setEditingItem(null);
    onRefresh();
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Delete this code item?')) return;
    await fetch(`/api/admin/codes?id=${id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <div className="space-y-4">
      {initialGroups.map((group) => (
        <div key={group.id} className="border rounded-md">
          <button
            className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
            onClick={() => toggle(group.id)}
          >
            {expanded.has(group.id) ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="font-medium text-sm">{group.name}</span>
            <Badge variant="outline" className="text-xs">{group.code}</Badge>
            <span className="ml-auto text-xs text-muted-foreground">{group.items.length} items</span>
          </button>

          {expanded.has(group.id) && (
            <div className="border-t divide-y">
              {group.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-6 py-2 group">
                  <span className="text-xs font-mono text-muted-foreground w-32 shrink-0">{item.code}</span>

                  {editingItem === item.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 text-sm flex-1"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveItem(item.id);
                          if (e.key === 'Escape') setEditingItem(null);
                        }}
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary focus target on mount
                        autoFocus
                      />
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => handleSaveItem(item.id)}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingItem(null)}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm flex-1">{item.name}</span>
                      <Badge variant={item.isActive ? 'default' : 'secondary'} className="text-xs">
                        {item.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                      <div className="hidden group-hover:flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() => { setEditingItem(item.id); setEditName(item.name); }}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDeleteItem(item.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              <div className="px-6 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 gap-1"
                  onClick={() => handleAddItem(group.id)}
                >
                  <Plus className="w-3 h-3" /> Add item
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
