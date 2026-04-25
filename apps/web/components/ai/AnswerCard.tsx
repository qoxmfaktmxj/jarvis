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
      <Icon className="h-3.5 w-3.5 text-[--fg-muted]" aria-hidden />
      <span className="text-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[--fg-secondary]">
        {label}
      </span>
      {typeof count === 'number' && count > 0 ? (
        <span className="text-display text-[11px] font-semibold tabular-nums text-[--fg-muted]">
          {count}
        </span>
      ) : null}
      <span className="h-px flex-1 bg-[--border-default]" aria-hidden />
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
      ? { label: '높은 신뢰도', dot: 'bg-[--status-success-fg]', text: 'text-[--status-success-fg]' }
      : avg >= 0.65
        ? { label: '보통 신뢰도', dot: 'bg-[--brand-primary]', text: 'text-[--brand-primary-text]' }
        : { label: '낮은 신뢰도', dot: 'bg-warning', text: 'text-warning' };

  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${tone.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden />
      <Shield className="h-3 w-3" aria-hidden />
      {tone.label}
      <span className="tabular-nums text-[--fg-muted]">· {pct}%</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Answer body — inline citations preserved.
// Supports two citation formats:
//   [source:N]   — legacy 1-based index format (backward compat)
//   [[slug]]     — Phase B3/B4 agent format (matches wiki-page SourceRef by slug)
// ---------------------------------------------------------------------------
function AnswerBody({ text, sources }: { text: string; sources: SourceRef[] }) {
  // Build slug → sourceNumber map from wiki-page sources for [[slug]] resolution.
  const slugToIndex = new Map<string, number>();
  sources.forEach((s, i) => {
    if (s.kind === 'wiki-page') {
      slugToIndex.set(s.slug, i + 1); // 1-based to match ClaimBadge
    }
  });

  // Split on both legacy [source:N] and wikilink [[slug]] citation patterns.
  const parts = text.split(/(\[source:\d+\]|\[\[[^\]]+\]\])/g);

  return (
    <div className="prose prose-sm max-w-none text-sm leading-relaxed text-[--fg-primary]">
      {parts.map((part, index) => {
        // Legacy [source:N] format.
        const legacyMatch = part.match(/^\[source:(\d+)\]$/);
        if (legacyMatch?.[1]) {
          return (
            <ClaimBadge
              key={index}
              sourceNumber={parseInt(legacyMatch[1], 10)}
              sources={sources}
            />
          );
        }
        // [[slug]] wikilink format — resolve to wiki-page source by slug.
        const wikilinkMatch = part.match(/^\[\[([^\]]+)\]\]$/);
        if (wikilinkMatch?.[1]) {
          const slug = wikilinkMatch[1];
          const sourceNumber = slugToIndex.get(slug);
          if (sourceNumber !== undefined) {
            return (
              <ClaimBadge
                key={index}
                sourceNumber={sourceNumber}
                sources={sources}
              />
            );
          }
          // Slug not found in sources — render as plain wikilink text.
          return (
            <Link
              key={index}
              href={`/wiki/default/${encodeURIComponent(slug)}`}
              className="text-[--brand-primary-text] underline decoration-[--brand-primary-bg] underline-offset-2 hover:decoration-[--brand-primary]"
            >
              {slug}
            </Link>
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
      <ul className="divide-y divide-[--border-soft]">
        {sources.map((s, i) => (
          <li key={`${s.pageId}-${i}`}>
            <Link
              href={s.url}
              className="group flex items-center gap-3 py-2 transition-colors duration-150 hover:bg-[--bg-surface] -mx-2 px-2 rounded-md"
            >
              <span className="text-display w-5 shrink-0 text-center text-[11px] font-semibold tabular-nums text-[--fg-muted]">
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="flex-1 truncate text-sm text-[--fg-primary] group-hover:text-[--brand-primary-text]">
                {s.title}
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[--border-default] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[--brand-primary]" aria-hidden />
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
              <span className="text-[--fg-primary] group-hover:text-[--brand-primary-text]">{label}</span>
              <span className="text-display text-[10px] uppercase tracking-wide text-[--fg-muted]">
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
                  className="group inline-flex items-center gap-2 rounded-md border border-[--border-default] bg-card px-2.5 py-1 text-xs transition-colors duration-150 hover:border-[--brand-primary] hover:bg-[--brand-primary-bg]"
                >
                  {inner}
                </Link>
              </li>
            );
          }
          return (
            <li
              key={`${s.entryId}-${i}`}
              className="inline-flex items-center gap-2 rounded-md border border-[--border-default] bg-[--bg-surface] px-2.5 py-1 text-xs"
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
    resolved: 'bg-[--status-done-fg]',
    workaround: 'bg-[--brand-primary]',
    escalated: 'bg-warning',
    no_fix: 'bg-danger',
    info_only: 'bg-[--fg-muted]',
  };

  const visible = sources.slice(0, 3);

  return (
    <div>
      <SectionHeader icon={Briefcase} label="유사 사례" count={sources.length} />
      <ul className="divide-y divide-[--border-soft]">
        {visible.map((s, i) => (
          <li key={`${s.caseId}-${i}`} className="py-2">
            <div className="mb-1 flex items-start justify-between gap-3">
              <p className="flex-1 truncate text-sm font-medium text-[--fg-primary]">
                {s.title}
              </p>
              {s.result ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-[--fg-secondary]">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${resultTone[s.result] ?? 'bg-[--fg-muted]'}`}
                    aria-hidden
                  />
                  {resultLabel[s.result] ?? s.result}
                </span>
              ) : null}
            </div>
            {s.symptom ? (
              <p className="truncate text-xs text-[--fg-secondary]">
                <span className="text-display font-semibold uppercase tracking-wide text-[--fg-muted]">증상</span>{' '}
                {s.symptom}
              </p>
            ) : null}
            {s.action ? (
              <p className="truncate text-xs text-[--fg-secondary]">
                <span className="text-display font-semibold uppercase tracking-wide text-[--fg-muted]">조치</span>{' '}
                {s.action}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {sources.length > 3 ? (
        <p className="mt-1.5 text-xs text-[--fg-muted]">
          외 {sources.length - 3}건 더
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: 위키 페이지 (page-first) — hairline rows
// ---------------------------------------------------------------------------
// Confidence threshold matches ConfidenceInline's "보통 신뢰도" floor:
// medium (>=0.65) and high (>=0.85) sources are surfaced; low (<0.65) hidden.
const WIKI_PAGE_MIN_CONFIDENCE = 0.65;

function WikiPageSection({ sources }: { sources: WikiPageSourceRef[] }) {
  const visible = sources.filter((s) => s.confidence >= WIKI_PAGE_MIN_CONFIDENCE);
  if (visible.length === 0) return null;
  return (
    <div>
      <SectionHeader icon={FileText} label="위키 페이지" count={visible.length} />
      <ul className="divide-y divide-[--border-soft]">
        {visible.map((s, i) => (
          <li key={`${s.pageId}-${i}`}>
            <Link
              href={`/wiki/default/${encodeURIComponent(s.slug)}`}
              className="group flex items-center gap-3 py-2 transition-colors duration-150 hover:bg-[--bg-surface] -mx-2 px-2 rounded-md"
            >
              <span className="flex-1 min-w-0">
                <span className="block truncate text-sm text-[--fg-primary] group-hover:text-[--brand-primary-text]">
                  {s.title}
                </span>
                <span className="block truncate text-[11px] text-[--fg-muted]">
                  {s.path}
                </span>
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[--border-default] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[--brand-primary]" aria-hidden />
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
              className="group inline-flex items-center gap-2 rounded-md border border-[--border-default] bg-card px-2.5 py-1 text-xs transition-colors duration-150 hover:border-[--brand-primary] hover:bg-[--brand-primary-bg]"
            >
              <Network className="h-3 w-3 text-[--fg-muted] group-hover:text-[--brand-primary]" aria-hidden />
              <span className="text-[--fg-primary] group-hover:text-[--brand-primary-text]">{s.nodeLabel}</span>
              {s.communityLabel ? (
                <span className="text-[10px] text-[--fg-muted]">{s.communityLabel}</span>
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
      <Users className="h-3.5 w-3.5 text-[--fg-muted]" aria-hidden />
      <span className="text-display text-[11px] font-semibold uppercase tracking-[0.14em] text-[--fg-secondary]">
        담당 팀
      </span>
      {[...teams].map((team) => (
        <span
          key={team}
          className="inline-flex items-center rounded-md bg-[--bg-surface] px-2 py-0.5 text-xs text-[--fg-primary]"
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
            {i > 0 && <ChevronRight className="h-3 w-3 text-[--border-default]" aria-hidden />}
            <Link
              href={s.url!}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[--brand-primary-text] underline decoration-[--brand-primary-bg] underline-offset-4 transition-colors duration-150 hover:decoration-[--brand-primary]"
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
