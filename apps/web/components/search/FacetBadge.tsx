'use client';

import { cn } from '@/lib/utils';

interface FacetBadgeProps {
  label: string;
  count: number;
  active?: boolean;
  onClick?: () => void;
}

export function FacetBadge({ label, count, active = false, onClick }: FacetBadgeProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors',
        active
          ? 'bg-isu-500 text-white shadow-[0_1px_2px_rgba(28,77,167,0.35)]'
          : 'bg-surface-50 text-surface-700 ring-1 ring-inset ring-surface-200 hover:bg-surface-100 hover:text-surface-900',
      )}
    >
      <span className="truncate">{label}</span>
      <span
        className={cn(
          'text-display inline-flex min-w-[1.25rem] justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums',
          active ? 'bg-white/20 text-white' : 'bg-white text-surface-500 ring-1 ring-inset ring-surface-200',
        )}
      >
        {count}
      </span>
    </button>
  );
}
