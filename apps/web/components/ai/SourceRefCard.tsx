// apps/web/components/ai/SourceRefCard.tsx
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SourceRef } from '@jarvis/ai/types';

interface SourceRefCardProps {
  source: SourceRef;
  index: number;
}

function confidenceLabel(score: number): { label: string; variant: 'default' | 'secondary' | 'outline' } {
  if (score >= 0.85) return { label: '높음', variant: 'default' };
  if (score >= 0.65) return { label: '보통', variant: 'secondary' };
  return { label: '낮음', variant: 'outline' };
}

export function SourceRefCard({ source, index }: SourceRefCardProps) {
  const { label, variant } = confidenceLabel(source.confidence);

  return (
    <Card className="hover:bg-muted/50 transition-colors">
      <CardContent className="p-3 flex gap-3 items-start">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={source.url}
              className="text-sm font-medium text-primary hover:underline truncate"
            >
              {source.title}
            </Link>
            <Badge variant={variant} className="text-xs shrink-0">
              {label}
            </Badge>
          </div>
          {source.excerpt && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {source.excerpt}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
