'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button }  from '@/components/ui/button';
import { Input }   from '@/components/ui/input';
import { cn }      from '@/lib/utils';
import type { OrgNode } from '@/lib/queries/admin';

type NodeProps = {
  node:       OrgNode;
  onSave:     (id: string, name: string) => Promise<void>;
  onDelete:   (id: string) => Promise<void>;
  onAddChild: (parentId: string) => Promise<void>;
  depth?:     number;
};

function OrgNodeRow({ node, onSave, onDelete, onAddChild, depth = 0 }: NodeProps) {
  const [expanded, setExpanded] = useState(true);
  const [editing,  setEditing]  = useState(false);
  const [name,     setName]     = useState(node.name);

  const handleSave = async () => {
    await onSave(node.id, name);
    setEditing(false);
  };

  return (
    <div>
      <div
        className={cn('flex items-center gap-1 py-1 px-2 rounded hover:bg-muted group')}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <button
          className="w-4 h-4 flex items-center justify-center text-muted-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          {node.children.length > 0 ? (
            expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
          ) : (
            <span className="w-3 h-3" />
          )}
        </button>

        {editing ? (
          <>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-6 text-sm py-0 px-2 w-48"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') setEditing(false);
              }}
              autoFocus
            />
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={handleSave}>Save</Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(false)}>Cancel</Button>
          </>
        ) : (
          <>
            <span className="text-sm flex-1">{node.name}</span>
            <span className="text-xs text-muted-foreground mr-2">{node.code}</span>
            <div className="hidden group-hover:flex gap-1">
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditing(true)}>
                <Pencil className="w-3 h-3" />
              </Button>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onAddChild(node.id)}>
                <Plus className="w-3 h-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-destructive"
                onClick={() => onDelete(node.id)}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </>
        )}
      </div>

      {expanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <OrgNodeRow
              key={child.id}
              node={child}
              onSave={onSave}
              onDelete={onDelete}
              onAddChild={onAddChild}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type Props = {
  initialTree: OrgNode[];
  onRefresh:   () => void;
};

export function OrgTree({ initialTree, onRefresh }: Props) {
  const [tree] = useState(initialTree);

  const handleSave = async (id: string, name: string) => {
    await fetch('/api/admin/organizations', {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, name }),
    });
    onRefresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this organization node?')) return;
    const res = await fetch(`/api/admin/organizations?id=${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json();
      alert(json.error ?? 'Delete failed');
      return;
    }
    onRefresh();
  };

  const handleAddChild = async (parentId: string) => {
    const code = prompt('Enter org code (e.g. DEV):');
    const name = prompt('Enter org name:');
    if (!code || !name) return;
    await fetch('/api/admin/organizations', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ code, name, parentId }),
    });
    onRefresh();
  };

  return (
    <div className="border rounded-md p-2">
      {tree.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4">No organizations yet.</p>
      ) : (
        tree.map((node) => (
          <OrgNodeRow
            key={node.id}
            node={node}
            onSave={handleSave}
            onDelete={handleDelete}
            onAddChild={handleAddChild}
          />
        ))
      )}
    </div>
  );
}
