'use client';

import { Badge } from '@/components/ui/badge';
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
        'flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-muted/80',
      )}
    >
      <span>{label}</span>
      <Badge
        variant={active ? 'secondary' : 'outline'}
        className="h-4 min-w-4 px-1 text-xs"
      >
        {count}
      </Badge>
    </button>
  );
}
