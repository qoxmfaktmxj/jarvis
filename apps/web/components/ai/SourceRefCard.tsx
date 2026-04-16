// apps/web/components/ai/SourceRefCard.tsx
// 5종 SourceRef (text | graph | case | directory | wiki-page) 렌더러
import Link from 'next/link';
import { Network, Briefcase, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type {
  SourceRef,
  TextSourceRef,
  GraphSourceRef,
  CaseSourceRef,
  DirectorySourceRef,
  WikiPageSourceRef,
} from '@jarvis/ai/types';

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
  if (source.kind === 'graph') return <GraphSourceCard source={source} index={index} />;
  if (source.kind === 'case') return <CaseSourceCard source={source} index={index} />;
  if (source.kind === 'directory') return <DirectorySourceCard source={source} index={index} />;
  if (source.kind === 'wiki-page') return <WikiPageSourceCard source={source} index={index} />;
  return <TextSourceCard source={source} index={index} />;
}

// ---------------------------------------------------------------------------
// Wiki Page (Phase-W2 T2 page-first navigation)
// ---------------------------------------------------------------------------
function WikiPageSourceCard({ source, index }: { source: WikiPageSourceRef; index: number }) {
  const { label, variant } = confidenceLabel(source.confidence);
  // Wiki URL convention: `/wiki/{workspaceId}/{slug}`
  const href = `/wiki/default/${encodeURIComponent(source.slug)}`;
  return (
    <Card className="border-indigo-200 bg-indigo-50/30 hover:bg-indigo-50 transition-colors dark:border-indigo-900 dark:bg-indigo-950/20">
      <CardContent className="p-3 flex gap-3 items-start">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-900 text-xs font-semibold flex items-center justify-center dark:bg-indigo-900 dark:text-indigo-100">
          W{index + 1}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={href} className="text-sm font-medium text-indigo-800 hover:underline truncate dark:text-indigo-200">
              {source.title}
            </Link>
            <Badge variant={variant} className="text-xs shrink-0">{label}</Badge>
            <Badge variant="outline" className="text-xs shrink-0">{source.citation}</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground truncate">{source.path}</p>
          {source.origin === 'expand' && (
            <p className="text-[10px] text-indigo-600 dark:text-indigo-400">↳ 1-hop wikilink</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------
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
            <Link href={source.url} className="text-sm font-medium text-primary hover:underline truncate">
              {source.title}
            </Link>
            <Badge variant={variant} className="text-xs shrink-0">{label}</Badge>
          </div>
          {source.excerpt && (
            <p className="text-xs text-muted-foreground line-clamp-2">{source.excerpt}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Graph
// ---------------------------------------------------------------------------
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
            <Link href={source.url} className="text-sm font-medium text-blue-800 hover:underline truncate dark:text-blue-200">
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
          <p className="text-[10px] text-muted-foreground">Graph: {source.snapshotTitle}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Case (유지보수 사례)
// ---------------------------------------------------------------------------
function CaseSourceCard({ source }: { source: CaseSourceRef; index: number }) {
  const resultLabel: Record<string, string> = {
    resolved: '해결',
    workaround: '우회',
    escalated: '에스컬레이션',
    no_fix: '미해결',
    info_only: '안내',
  };
  return (
    <Card className="border-amber-200 bg-amber-50/30 hover:bg-amber-50 transition-colors dark:border-amber-900 dark:bg-amber-950/20">
      <CardContent className="p-3 flex gap-3 items-start">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-900 text-xs font-semibold flex items-center justify-center dark:bg-amber-900 dark:text-amber-100">
          <Briefcase className="h-3 w-3" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-amber-800 truncate dark:text-amber-200">
              {source.title}
            </span>
            {source.result && (
              <Badge variant="outline" className="text-xs shrink-0 border-amber-300 text-amber-700">
                {resultLabel[source.result] ?? source.result}
              </Badge>
            )}
          </div>
          {source.symptom && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              <span className="font-medium">증상:</span> {source.symptom}
            </p>
          )}
          {source.action && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              <span className="font-medium">조치:</span> {source.action}
            </p>
          )}
          {(source.clusterLabel || source.requestCompany) && (
            <p className="text-[10px] text-muted-foreground">
              {source.clusterLabel && <span>{source.clusterLabel}</span>}
              {source.clusterLabel && source.requestCompany && <span> · </span>}
              {source.requestCompany && <span>{source.requestCompany}</span>}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Directory (바로가기 카드)
// ---------------------------------------------------------------------------
function DirectorySourceCard({ source }: { source: DirectorySourceRef; index: number }) {
  const typeLabel: Record<string, string> = {
    tool: '시스템',
    form: '양식',
    contact: '담당자',
    system_link: '메뉴',
    guide_link: '가이드',
  };
  return (
    <Card className="border-green-200 bg-green-50/30 hover:bg-green-50 transition-colors dark:border-green-900 dark:bg-green-950/20">
      <CardContent className="p-3 flex gap-3 items-start">
        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-900 text-xs font-semibold flex items-center justify-center dark:bg-green-900 dark:text-green-100">
          <ExternalLink className="h-3 w-3" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            {source.url ? (
              <Link
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-green-800 hover:underline truncate dark:text-green-200"
              >
                {source.nameKo ?? source.name}
              </Link>
            ) : (
              <span className="text-sm font-medium text-green-800 truncate dark:text-green-200">
                {source.nameKo ?? source.name}
              </span>
            )}
            <Badge variant="outline" className="text-xs shrink-0 border-green-300 text-green-700">
              {typeLabel[source.entryType] ?? source.entryType}
            </Badge>
          </div>
          {source.ownerTeam && (
            <p className="text-xs text-muted-foreground">담당: {source.ownerTeam}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
