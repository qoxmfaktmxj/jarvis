// apps/web/app/(app)/architecture/components/SnapshotSelector.tsx
'use client';

import { useRouter, usePathname } from 'next/navigation';

interface Snapshot {
  id: string;
  title: string;
  createdAt: string;
  buildMode: string;
  buildStatus: 'pending' | 'running' | 'done' | 'error';
}

function statusEmoji(status: string): string {
  switch (status) {
    case 'done':    return '✓';
    case 'running': return '⟳';
    case 'pending': return '◦';
    case 'error':   return '✕';
    default:        return '•';
  }
}

interface SnapshotSelectorProps {
  snapshots: Snapshot[];
  currentId: string;
}

export function SnapshotSelector({
  snapshots,
  currentId,
}: SnapshotSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <select
      value={currentId}
      onChange={(e) => router.push(`${pathname}?snapshot=${e.target.value}`)}
      className="border rounded px-3 py-1.5 text-sm"
    >
      {snapshots.map((s) => (
        <option key={s.id} value={s.id}>
          {statusEmoji(s.buildStatus)} {s.title} ({new Date(s.createdAt).toLocaleDateString()})
        </option>
      ))}
    </select>
  );
}
