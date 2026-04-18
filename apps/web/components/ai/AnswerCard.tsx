// apps/web/components/ai/AnswerCard.tsx
// 구조화된 답변 카드 — flow layout, hairline sections, single-tone accents.
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
// Section header — uniform across all source types
// ---------------------------------------------------------------------------
function SectionHeader({
  icon: Icon,
  label,
  count,
}: {
  icon: typeof FileText;
  label: string;
  count?: number;
}) {
  return (
    <div className="mb-2.5 flex items-baseline gap-2">
      <Icon className="h-3.5 w-3.5 text-surface-400" aria-hidden />
      <span className="text-display text-[11px] font-semibold uppercase tracking-[0.14em] text-surface-500">
        {label}
      </span>
      {typeof count === 'number' && count > 0 ? (
        <span className="text-display text-[11px] font-semibold tabular-nums text-surface-400">
          {count}
        </span>
      ) : null}
      <span className="h-px flex-1 bg-surface-200" aria-hidden />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confidence inline marker
// ---------------------------------------------------------------------------
function ConfidenceInline({ sources }: { sources: SourceRef[] }) {
  const withConf = sources.filter(
    (s): s is TextSourceRef | GraphSourceRef | CaseSourceRef =>
      'confidence' in s && typeof s.confidence === 'number',
  );
  if (withConf.length === 0) return null;

  const avg = withConf.reduce((sum, s) => sum + s.confidence, 0) / withConf.length;
  const pct = Math.round(avg * 100);

  const tone =
    avg >= 0.85
      ? { label: '높은 신뢰도', dot: 'bg-lime-500', text: 'text-lime-700' }
      : avg >= 0.65
        ? { label: '보통 신뢰도', dot: 'bg-isu-400', text: 'text-isu-700' }
        : { label: '낮은 신뢰도', dot: 'bg-warning', text: 'text-warning' };

  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${tone.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
      <Shield className="h-3 w-3" aria-hidden />
      {tone.label}
      <span className="tabular-nums text-surface-400">· {pct}%</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Answer body — inline citations preserved
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
// Section: 근거 문서 (Text sources) — hairline rows
// ---------------------------------------------------------------------------
function DocumentSection({ sources }: { sources: TextSourceRef[] }) {
  if (sources.length === 0) return null;
  return (
    <div>
      <SectionHeader icon={FileText} label="근거 문서" count={sources.length} />
      <ul className="divide-y divide-surface-100">
        {sources.map((s, i) => (
          <li key={`${s.pageId}-${i}`}>
            <Link
              href={s.url}
              className="group flex items-center gap-3 py-2 transition-colors duration-150 hover:bg-surface-50 -mx-2 px-2 rounded-md"
            >
              <span className="text-display w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums text-surface-400">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="flex-1 truncate text-sm text-surface-800 group-hover:text-isu-700">
                {s.title}
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-surface-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-isu-500" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: 관련 시스템 (Directory sources) — chip row
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
    <div>
      <SectionHeader icon={ExternalLink} label="관련 시스템" count={sources.length} />
      <ul className="flex flex-wrap gap-1.5">
        {sources.map((s, i) => {
          const label = s.nameKo ?? s.name;
          const type = typeLabel[s.entryType] ?? s.entryType;
          const inner = (
            <>
              <span className="text-surface-800 group-hover:text-isu-700">{label}</span>
              <span className="text-display text-[10px] uppercase tracking-wide text-surface-400">
                {type}
              </span>
            </>
          );
          if (s.url) {
            return (
              <li key={`${s.entryId}-${i}`}>
                <Link
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 rounded-md border border-surface-200 bg-card px-2.5 py-1 text-xs transition-colors duration-150 hover:border-isu-300 hover:bg-isu-50"
                >
                  {inner}
                </Link>
              </li>
            );
          }
          return (
            <li
              key={`${s.entryId}-${i}`}
              className="inline-flex items-center gap-2 rounded-md border border-surface-200 bg-surface-50 px-2.5 py-1 text-xs"
            >
              {inner}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: 유사 사례 (Case sources) — hairline rows, monochrome
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

  const resultTone: Record<string, string> = {
    resolved: 'bg-lime-500',
    workaround: 'bg-isu-400',
    escalated: 'bg-warning',
    no_fix: 'bg-danger',
    info_only: 'bg-surface-400',
  };

  const visible = sources.slice(0, 3);

  return (
    <div>
      <SectionHeader icon={Briefcase} label="유사 사례" count={sources.length} />
      <ul className="divide-y divide-surface-100">
        {visible.map((s, i) => (
          <li key={`${s.caseId}-${i}`} className="py-2">
            <div className="mb-1 flex items-start justify-between gap-3">
              <p className="flex-1 truncate text-sm font-medium text-surface-800">
                {s.title}
              </p>
              {s.result ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-surface-600">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${resultTone[s.result] ?? 'bg-surface-400'}`}
                    aria-hidden
                  />
                  {resultLabel[s.result] ?? s.result}
                </span>
              ) : null}
            </div>
            {s.symptom ? (
              <p className="truncate text-xs text-surface-500">
                <span className="text-display font-semibold uppercase tracking-wide text-surface-400">증상</span>{' '}
                {s.symptom}
              </p>
            ) : null}
            {s.action ? (
              <p className="truncate text-xs text-surface-500">
                <span className="text-display font-semibold uppercase tracking-wide text-surface-400">조치</span>{' '}
                {s.action}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {sources.length > 3 ? (
        <p className="mt-1.5 text-xs text-surface-400">
          외 {sources.length - 3}건 더
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: 위키 페이지 (page-first) — hairline rows
// ---------------------------------------------------------------------------
function WikiPageSection({ sources }: { sources: WikiPageSourceRef[] }) {
  if (sources.length === 0) return null;
  return (
    <div>
      <SectionHeader icon={FileText} label="위키 페이지" count={sources.length} />
      <ul className="divide-y divide-surface-100">
        {sources.map((s, i) => (
          <li key={`${s.pageId}-${i}`}>
            <Link
              href={`/wiki/default/${encodeURIComponent(s.slug)}`}
              className="group flex items-center gap-3 py-2 transition-colors duration-150 hover:bg-surface-50 -mx-2 px-2 rounded-md"
            >
              <span className="text-display text-[10px] font-semibold tabular-nums text-surface-400">
                {s.citation}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-sm text-surface-800 group-hover:text-isu-700">
                  {s.title}
                </span>
                <span className="block truncate text-[11px] text-surface-400">
                  {s.path}
                </span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-surface-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-isu-500" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: 지식 그래프 (Graph sources)
// ---------------------------------------------------------------------------
function GraphSection({ sources }: { sources: GraphSourceRef[] }) {
  if (sources.length === 0) return null;
  return (
    <div>
      <SectionHeader icon={Network} label="지식 그래프" count={sources.length} />
      <ul className="flex flex-wrap gap-1.5">
        {sources.map((s, i) => (
          <li key={`${s.nodeId}-${i}`}>
            <Link
              href={s.url}
              className="group inline-flex items-center gap-2 rounded-md border border-surface-200 bg-card px-2.5 py-1 text-xs transition-colors duration-150 hover:border-isu-300 hover:bg-isu-50"
            >
              <Network className="h-3 w-3 text-surface-400 group-hover:text-isu-500" aria-hidden />
              <span className="text-surface-800 group-hover:text-isu-700">{s.nodeLabel}</span>
              {s.communityLabel ? (
                <span className="text-[10px] text-surface-400">{s.communityLabel}</span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
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
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Users className="h-3.5 w-3.5 text-surface-400" aria-hidden />
      <span className="text-display text-[11px] font-semibold uppercase tracking-[0.14em] text-surface-500">
        담당 팀
      </span>
      {[...teams].map((team) => (
        <span
          key={team}
          className="inline-flex items-center rounded-md bg-surface-100 px-2 py-0.5 text-xs text-surface-700"
        >
          {team}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: 다음 행동 — breadcrumb-style chain
// ---------------------------------------------------------------------------
function NextActionSection({ sources }: { sources: DirectorySourceRef[] }) {
  const actionable = sources.filter((s) => s.url);
  if (actionable.length === 0) return null;

  return (
    <div>
      <SectionHeader icon={ArrowRight} label="다음 행동" />
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
        {actionable.slice(0, 3).map((s, i) => (
          <span key={s.entryId} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3 w-3 text-surface-300" aria-hidden />}
            <Link
              href={s.url!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-isu-700 underline decoration-isu-200 underline-offset-4 transition-colors duration-150 hover:decoration-isu-500"
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
// Main Component — flow layout, no Card chrome
// ---------------------------------------------------------------------------
export function AnswerCard({ answer, sources }: AnswerCardProps) {
  const { text, graph, cases, directory, wikiPages } = categorizeSources(sources);
  const hasSections =
    text.length > 0 ||
    graph.length > 0 ||
    cases.length > 0 ||
    directory.length > 0 ||
    wikiPages.length > 0;

  if (!hasSections) {
    return <AnswerBody text={answer} sources={sources} />;
  }

  return (
    <div className="space-y-5">
      {/* Answer body + confidence */}
      <div className="space-y-2">
        <AnswerBody text={answer} sources={sources} />
        <ConfidenceInline sources={sources} />
      </div>

      {/* Evidence sections in consistent flow */}
      <div className="space-y-5">
        <DocumentSection sources={text} />
        <WikiPageSection sources={wikiPages} />
        <GraphSection sources={graph} />
        <CaseSection sources={cases} />
        <DirectorySection sources={directory} />
        <NextActionSection sources={directory} />
        <OwnerTeamSection sources={sources} />
      </div>
    </div>
  );
}
