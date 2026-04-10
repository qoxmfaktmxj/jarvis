// apps/web/components/ai/SourceRefCard.tsx
import Link from 'next/link';
import { Network } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { SourceRef, TextSourceRef, GraphSourceRef } from '@jarvis/ai/types';

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
  if (source.kind === 'graph') {
    return <GraphSourceCard source={source} index={index} />;
  }
  return <TextSourceCard source={source} index={index} />;
}

function TextSourceCard({ source, index }: { source: TextSourceRef; index: number }) {
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

function GraphSourceCard({ source, index }: { source: GraphSourceRef; index: number }) {
  return (
    <Card className="border-blue-200 bg-blue-50/30 hover:bg-blue-50 transition-colors dark:border-blue-900 dark:bg-blue-950/20">
      <CardContent className="p-3 flex gap-3 items-start">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-900 text-xs font-semibold flex items-center justify-center dark:bg-blue-900 dark:text-blue-100">
          G{index + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Network className="h-3 w-3 text-blue-600 dark:text-blue-400 shrink-0" />
            <Link
              href={source.url}
              className="text-sm font-medium text-blue-800 hover:underline truncate dark:text-blue-200"
            >
              {source.nodeLabel}
            </Link>
          </div>
          {(source.sourceFile || source.communityLabel) && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {source.sourceFile && <span>{source.sourceFile}</span>}
              {source.sourceFile && source.communityLabel && <span> · </span>}
              {source.communityLabel && <span>Community: {source.communityLabel}</span>}
            </p>
          )}
          {source.relationPath && source.relationPath.length > 0 && (
            <p className="text-xs text-blue-700 dark:text-blue-300 line-clamp-1">
              {source.relationPath.join(' → ')}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground">
            Graph: {source.snapshotTitle}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
