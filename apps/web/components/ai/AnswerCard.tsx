// apps/web/components/ai/AnswerCard.tsx
// 구조화된 답변 카드 — 4종 SourceRef 별 섹션 자동 분리
'use client';

import Link from 'next/link';
import {
  FileText,
  Network,
  Briefcase,
  ExternalLink,
  ChevronRight,
  Shield,
  Users,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type {
  SourceRef,
  TextSourceRef,
  GraphSourceRef,
  CaseSourceRef,
  DirectorySourceRef,
  WikiPageSourceRef,
} from '@jarvis/ai/types';
import { ClaimBadge } from './ClaimBadge';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface AnswerCardProps {
  answer: string;
  sources: SourceRef[];
}

// ---------------------------------------------------------------------------
// Source categorization
// ---------------------------------------------------------------------------
function categorizeSources(sources: SourceRef[]) {
  const text: TextSourceRef[] = [];
  const graph: GraphSourceRef[] = [];
  const cases: CaseSourceRef[] = [];
  const directory: DirectorySourceRef[] = [];
  const wikiPages: WikiPageSourceRef[] = [];

  for (const s of sources) {
    switch (s.kind) {
      case 'text':
        text.push(s);
        break;
      case 'graph':
        graph.push(s);
        break;
      case 'case':
        cases.push(s);
        break;
      case 'directory':
        directory.push(s);
        break;
      case 'wiki-page':
        wikiPages.push(s);
        break;
      // 'chunk' sources are citation-only; no dedicated section needed
    }
  }

  return { text, graph, cases, directory, wikiPages };
}

// ---------------------------------------------------------------------------
// Confidence display
// ---------------------------------------------------------------------------
function ConfidenceBadge({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) return null;

  // Average confidence across all sources that have it
  const withConf = sources.filter(
    (s): s is TextSourceRef | GraphSourceRef | CaseSourceRef =>
      'confidence' in s && typeof s.confidence === 'number',
  );
  if (withConf.length === 0) return null;

  const avg = withConf.reduce((sum, s) => sum + s.confidence, 0) / withConf.length;

  if (avg >= 0.85) {
    return (
      <Badge variant="default" className="gap-1 text-xs">
        <Shield className="h-3 w-3" /> 높은 신뢰도
      </Badge>
    );
  }
  if (avg >= 0.65) {
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <Shield className="h-3 w-3" /> 보통 신뢰도
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-xs">
      <Shield className="h-3 w-3" /> 낮은 신뢰도
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Answer text with inline source references
// ---------------------------------------------------------------------------
function AnswerBody({ text, sources }: { text: string; sources: SourceRef[] }) {
  const parts = text.split(/(\[source:\d+\])/g);

  return (
    <div className="prose prose-sm max-w-none text-sm leading-relaxed text-surface-800">
      {parts.map((part, index) => {
        const match = part.match(/^\[source:(\d+)\]$/);
        if (match?.[1]) {
          return (
            <ClaimBadge
              key={index}
              sourceNumber={parseInt(match[1], 10)}
              sources={sources}
            />
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: 근거 문서 (Text sources)
// ---------------------------------------------------------------------------
function DocumentSection({ sources }: { sources: TextSourceRef[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold text-surface-700">근거 문서</span>
      </div>
      <div className="space-y-1">
        {sources.map((s, i) => (
          <Link
            key={`${s.pageId}-${i}`}
            href={s.url}
            className="flex items-center gap-2 rounded-lg border bg-surface-50 px-3 py-2 text-sm transition hover:bg-surface-100"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
              {i + 1}
            </span>
            <span className="flex-1 truncate text-surface-700">{s.title}</span>
            <ChevronRight className="h-3 w-3 text-surface-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: 관련 시스템/바로가기 (Directory sources)
// ---------------------------------------------------------------------------
function DirectorySection({ sources }: { sources: DirectorySourceRef[] }) {
  if (sources.length === 0) return null;

  const typeLabel: Record<string, string> = {
    tool: '시스템',
    form: '양식',
    contact: '담당자',
    system_link: '메뉴',
    guide_link: '가이드',
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ExternalLink className="h-3.5 w-3.5 text-green-600" />
        <span className="text-xs font-semibold text-surface-700">관련 시스템</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {sources.map((s, i) => {
          const label = s.nameKo ?? s.name;
          const type = typeLabel[s.entryType] ?? s.entryType;
          if (s.url) {
            return (
              <Link
                key={`${s.entryId}-${i}`}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50/50 px-3 py-1.5 text-sm text-green-800 transition hover:bg-green-100"
              >
                <ExternalLink className="h-3 w-3" />
                {label}
                <Badge variant="outline" className="ml-1 border-green-300 text-[10px] text-green-600">
                  {type}
                </Badge>
              </Link>
            );
          }
          return (
            <span
              key={`${s.entryId}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50/50 px-3 py-1.5 text-sm text-green-800"
            >
              {label}
              <Badge variant="outline" className="ml-1 border-green-300 text-[10px] text-green-600">
                {type}
              </Badge>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: 유사 사례 (Case sources)
// ---------------------------------------------------------------------------
function CaseSection({ sources }: { sources: CaseSourceRef[] }) {
  if (sources.length === 0) return null;

  const resultLabel: Record<string, string> = {
    resolved: '해결',
    workaround: '우회',
    escalated: '에스컬레이션',
    no_fix: '미해결',
    info_only: '안내',
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Briefcase className="h-3.5 w-3.5 text-amber-600" />
        <span className="text-xs font-semibold text-surface-700">
          유사 사례 ({sources.length}건)
        </span>
      </div>
      <div className="space-y-1.5">
        {sources.slice(0, 3).map((s, i) => (
          <div
            key={`${s.caseId}-${i}`}
            className="rounded-lg border border-amber-200 bg-amber-50/30 px-3 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-amber-900 line-clamp-1">
                {s.title}
              </span>
              {s.result && (
                <Badge
                  variant="outline"
                  className="shrink-0 border-amber-300 text-[10px] text-amber-700"
                >
                  {resultLabel[s.result] ?? s.result}
                </Badge>
              )}
            </div>
            {s.symptom && (
              <p className="mt-1 text-xs text-surface-600 line-clamp-1">
                <span className="font-medium">증상:</span> {s.symptom}
              </p>
            )}
            {s.action && (
              <p className="text-xs text-surface-600 line-clamp-1">
                <span className="font-medium">조치:</span> {s.action}
              </p>
            )}
          </div>
        ))}
        {sources.length > 3 && (
          <p className="text-xs text-muted-foreground">
            외 {sources.length - 3}건 유사 사례
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: 위키 페이지 (page-first navigation sources)
// ---------------------------------------------------------------------------
function WikiPageSection({ sources }: { sources: WikiPageSourceRef[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-isu-600" />
        <span className="text-xs font-semibold text-surface-700">위키 페이지</span>
      </div>
      <div className="space-y-1">
        {sources.map((s, i) => (
          <Link
            key={`${s.pageId}-${i}`}
            href={`/wiki/default/${encodeURIComponent(s.slug)}`}
            className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-isu-700 hover:bg-isu-50 transition-colors"
          >
            <Badge variant="outline" className="text-[10px] shrink-0">{s.citation}</Badge>
            <span className="truncate">{s.title}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: 그래프 컨텍스트 (Graph sources)
// ---------------------------------------------------------------------------
function GraphSection({ sources }: { sources: GraphSourceRef[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Network className="h-3.5 w-3.5 text-blue-600" />
        <span className="text-xs font-semibold text-surface-700">지식 그래프</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {sources.map((s, i) => (
          <Link
            key={`${s.nodeId}-${i}`}
            href={s.url}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-1.5 text-sm text-blue-800 transition hover:bg-blue-100"
          >
            <Network className="h-3 w-3" />
            {s.nodeLabel}
            {s.communityLabel && (
              <span className="text-[10px] text-blue-500">{s.communityLabel}</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: 담당 팀
// ---------------------------------------------------------------------------
function OwnerTeamSection({ sources }: { sources: SourceRef[] }) {
  const teams = new Set<string>();

  for (const s of sources) {
    if (s.kind === 'directory' && s.ownerTeam) teams.add(s.ownerTeam);
  }

  if (teams.size === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <Users className="h-3.5 w-3.5 text-surface-500" />
      <span className="text-xs font-semibold text-surface-700">담당 팀</span>
      <div className="flex gap-1.5">
        {[...teams].map((team) => (
          <Badge key={team} variant="secondary" className="text-xs">
            {team}
          </Badge>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: 다음 행동 (extract from directory entries)
// ---------------------------------------------------------------------------
function NextActionSection({ sources }: { sources: DirectorySourceRef[] }) {
  const actionable = sources.filter((s) => s.url);
  if (actionable.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <ArrowRight className="h-3.5 w-3.5 text-isu-600" />
        <span className="text-xs font-semibold text-surface-700">다음 행동</span>
      </div>
      <div className="flex items-center gap-2 text-sm text-surface-700">
        {actionable.slice(0, 3).map((s, i) => (
          <span key={s.entryId} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-surface-400" />}
            <Link
              href={s.url!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-isu-700 underline decoration-isu-300 underline-offset-2 hover:decoration-isu-500"
            >
              {s.nameKo ?? s.name}
            </Link>
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export function AnswerCard({ answer, sources }: AnswerCardProps) {
  const { text, graph, cases, directory, wikiPages } = categorizeSources(sources);
  const hasSections = text.length > 0 || graph.length > 0 || cases.length > 0 || directory.length > 0 || wikiPages.length > 0;

  if (!hasSections) {
    // No sources — just render the answer text
    return (
      <div className="space-y-2">
        <AnswerBody text={answer} sources={sources} />
      </div>
    );
  }

  return (
    <Card className="overflow-hidden border-surface-200">
      {/* Answer body */}
      <CardHeader className="space-y-3 pb-3">
        <AnswerBody text={answer} sources={sources} />
        <ConfidenceBadge sources={sources} />
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        {/* 근거 문서 */}
        {text.length > 0 && (
          <>
            <Separator />
            <DocumentSection sources={text} />
          </>
        )}

        {/* 관련 시스템 */}
        {directory.length > 0 && (
          <>
            <Separator />
            <DirectorySection sources={directory} />
          </>
        )}

        {/* 유사 사례 */}
        {cases.length > 0 && (
          <>
            <Separator />
            <CaseSection sources={cases} />
          </>
        )}

        {/* 위키 페이지 (page-first) */}
        {wikiPages.length > 0 && (
          <>
            <Separator />
            <WikiPageSection sources={wikiPages} />
          </>
        )}

        {/* 지식 그래프 */}
        {graph.length > 0 && (
          <>
            <Separator />
            <GraphSection sources={graph} />
          </>
        )}

        {/* 다음 행동 */}
        {directory.length > 0 && (
          <>
            <Separator />
            <NextActionSection sources={directory} />
          </>
        )}

        {/* 담당 팀 */}
        <OwnerTeamSection sources={sources} />
      </CardContent>
    </Card>
  );
}
