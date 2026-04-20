// apps/web/components/ai/SourceRefCard.tsx
// 5종 SourceRef (text | graph | case | directory | wiki-page) — flow row renderer.
// Hairline rows with a left-edge kind marker instead of full card chrome.
import Link from 'next/link';
import { FileText, Network, Briefcase, ExternalLink, BookOpen, ChevronRight } from 'lucide-react';
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
  workspaceId: string;
}

function confidenceTone(score: number): { label: string; dot: string; text: string } {
  if (score >= 0.85) return { label: '높음', dot: 'bg-lime-500', text: 'text-lime-700' };
  if (score >= 0.65) return { label: '보통', dot: 'bg-isu-400', text: 'text-isu-700' };
  return { label: '낮음', dot: 'bg-surface-400', text: 'text-surface-500' };
}

// ─────────────────────────────────────────────────────────────
// Shared row primitive — uniform hairline layout across all kinds.
// Kind is shown as a 1-letter prefix + icon on the left; color is the
// accent. Confidence (where available) is a small dot+label on the right.
// ─────────────────────────────────────────────────────────────
function SourceRow({
  index,
  kindLetter,
  icon: Icon,
  accentText,
  title,
  href,
  meta,
  subMeta,
  confidence,
  external,
}: {
  index: number;
  kindLetter: string | null;
  icon: typeof FileText;
  accentText: string;
  title: React.ReactNode;
  href?: string | null;
  meta?: React.ReactNode;
  subMeta?: React.ReactNode;
  confidence?: number;
  external?: boolean;
}) {
  const label = kindLetter ? `${kindLetter}${index + 1}` : String(index + 1).padStart(2, '0');

  const body = (
    <>
      <span className="text-display w-8 shrink-0 text-center text-[11px] font-semibold tabular-nums text-surface-400">
        {label}
      </span>
      <Icon className={`h-3.5 w-3.5 shrink-0 ${accentText} opacity-70`} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className={`truncate text-sm font-medium ${href ? `${accentText} group-hover:underline decoration-current decoration-1 underline-offset-4` : 'text-surface-800'}`}>
            {title}
          </p>
          {typeof confidence === 'number' ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px]">
              <span className={`h-1.5 w-1.5 rounded-full ${confidenceTone(confidence).dot}`} aria-hidden />
              <span className={confidenceTone(confidence).text}>
                {confidenceTone(confidence).label}
              </span>
            </span>
          ) : null}
        </div>
        {meta ? <p className="truncate text-xs text-surface-500">{meta}</p> : null}
        {subMeta ? <p className="truncate text-[11px] text-surface-400">{subMeta}</p> : null}
      </div>
      {href ? (
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-surface-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-isu-500" aria-hidden />
      ) : null}
    </>
  );

  const baseCls =
    'group -mx-2 flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors duration-150';

  if (href) {
    return (
      <Link
        href={href}
        className={`${baseCls} hover:bg-surface-50`}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {body}
      </Link>
    );
  }
  return <div className={baseCls}>{body}</div>;
}

// ─────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────
export function SourceRefCard({ source, index, workspaceId }: SourceRefCardProps) {
  if (source.kind === 'graph') return <GraphSourceRow source={source} index={index} />;
  if (source.kind === 'case') return <CaseSourceRow source={source} index={index} />;
  if (source.kind === 'directory') return <DirectorySourceRow source={source} index={index} />;
  if (source.kind === 'wiki-page') return <WikiPageSourceRow source={source} index={index} workspaceId={workspaceId} />;
  return <TextSourceRow source={source} index={index} />;
}

// ─────────────────────────────────────────────────────────────
// Text
// ─────────────────────────────────────────────────────────────
function TextSourceRow({ source, index }: { source: TextSourceRef; index: number }) {
  return (
    <SourceRow
      index={index}
      kindLetter={null}
      icon={FileText}
      accentText="text-isu-700"
      title={source.title}
      href={source.url}
      meta={source.excerpt}
      confidence={source.confidence}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Graph
// ─────────────────────────────────────────────────────────────
function GraphSourceRow({ source, index }: { source: GraphSourceRef; index: number }) {
  const metaParts: string[] = [];
  if (source.sourceFile) metaParts.push(source.sourceFile);
  if (source.communityLabel) metaParts.push(`Community · ${source.communityLabel}`);
  if (source.relationPath?.length) metaParts.push(source.relationPath.join(' → '));

  return (
    <SourceRow
      index={index}
      kindLetter="G"
      icon={Network}
      accentText="text-isu-700"
      title={source.nodeLabel}
      href={source.url}
      meta={metaParts.join(' · ') || undefined}
      subMeta={`Graph · ${source.snapshotTitle}`}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Case
// ─────────────────────────────────────────────────────────────
function CaseSourceRow({ source, index }: { source: CaseSourceRef; index: number }) {
  const resultLabel: Record<string, string> = {
    resolved: '해결',
    workaround: '우회',
    escalated: '에스컬레이션',
    no_fix: '미해결',
    info_only: '안내',
  };
  const metaParts: string[] = [];
  if (source.symptom) metaParts.push(`증상 · ${source.symptom}`);
  if (source.action) metaParts.push(`조치 · ${source.action}`);
  const subParts: string[] = [];
  if (source.result) subParts.push(resultLabel[source.result] ?? source.result);
  if (source.clusterLabel) subParts.push(source.clusterLabel);
  if (source.requestCompany) subParts.push(source.requestCompany);

  return (
    <SourceRow
      index={index}
      kindLetter="C"
      icon={Briefcase}
      accentText="text-surface-800"
      title={source.title}
      meta={metaParts.join(' · ') || undefined}
      subMeta={subParts.join(' · ') || undefined}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Directory
// ─────────────────────────────────────────────────────────────
function DirectorySourceRow({ source, index }: { source: DirectorySourceRef; index: number }) {
  const typeLabel: Record<string, string> = {
    tool: '시스템',
    form: '양식',
    contact: '담당자',
    system_link: '메뉴',
    guide_link: '가이드',
  };
  const kindText = typeLabel[source.entryType] ?? source.entryType;
  const sub = source.ownerTeam ? `${kindText} · 담당 ${source.ownerTeam}` : kindText;
  return (
    <SourceRow
      index={index}
      kindLetter="D"
      icon={ExternalLink}
      accentText="text-surface-800"
      title={source.nameKo ?? source.name}
      href={source.url ?? null}
      external={!!source.url}
      subMeta={sub}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Wiki Page
// ─────────────────────────────────────────────────────────────

/** source.path (repo-relative, e.g. "auto/entities/MindVault.md") → URL routeKey.
 *  Strips optional "wiki/<workspaceId>/" prefix and removes .md/.mdx extension.
 */
function pathToRouteKey(filePath: string, workspaceId: string): string {
  const wsPrefix = 'wiki/' + workspaceId + '/';
  let key = filePath.startsWith(wsPrefix) ? filePath.slice(wsPrefix.length) : filePath;
  key = key.replace(/.mdx?$/, '');
  return key;
}

function WikiPageSourceRow({
  source,
  index,
  workspaceId,
}: {
  source: WikiPageSourceRef;
  index: number;
  workspaceId: string;
}) {
  const routeKey = pathToRouteKey(source.path, workspaceId);
  const href = '/wiki/' + workspaceId + '/' + routeKey;
  const sub =
    source.origin === 'expand'
      ? `${source.citation} · ${source.path} · ↳ 1-hop`
      : `${source.citation} · ${source.path}`;
  return (
    <SourceRow
      index={index}
      kindLetter="W"
      icon={BookOpen}
      accentText="text-lime-700"
      title={source.title}
      href={href}
      subMeta={sub}
      confidence={source.confidence}
    />
  );
}