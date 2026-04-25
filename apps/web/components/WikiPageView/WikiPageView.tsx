'use client';

import { Fragment, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';
import { Calendar, Pencil, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Capy } from '@/components/layout/Capy';
import { cn } from '@/lib/utils';
import { InfraRunbookHeader } from './InfraRunbookHeader';
import type { WikiPage } from './types';

const WIKILINK_PATTERN = /\[\[([^\]]+)\]\]/g;

const SENSITIVITY_STYLES: Record<
  WikiPage['sensitivity'],
  { chip: string; bar: string; label: string }
> = {
  public: {
    chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    bar: 'from-emerald-500/70 to-emerald-500/0',
    label: 'Public',
  },
  internal: {
    chip: 'bg-[--brand-primary-bg] text-[--brand-primary-text] ring-[--brand-primary-bg]',
    bar: 'from-[--brand-primary]/70 to-[--brand-primary]/0',
    label: 'Internal',
  },
  restricted: {
    chip: 'bg-amber-50 text-amber-800 ring-amber-600/25',
    bar: 'from-amber-500/70 to-amber-500/0',
    label: 'Restricted',
  },
  secret: {
    chip: 'bg-red-50 text-red-700 ring-red-600/25',
    bar: 'from-red-500/70 to-red-500/0',
    label: 'Secret',
  },
};

type WikiPageViewProps = {
  page: WikiPage;
  onWikiLinkClick: (slug: string) => void;
  orphanSlugs?: readonly string[];
};

function extractWikilinkTarget(inner: string): string {
  let rest = inner.trim();
  const pipeIdx = rest.indexOf('|');
  if (pipeIdx !== -1) rest = rest.slice(0, pipeIdx).trim();
  const hashIdx = rest.indexOf('#');
  if (hashIdx !== -1) rest = rest.slice(0, hashIdx).trim();
  return rest;
}

function renderWithWikilinks(
  text: string,
  onWikiLinkClick: (slug: string) => void,
  orphanSet: ReadonlySet<string>,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  WIKILINK_PATTERN.lastIndex = 0;
  while ((match = WIKILINK_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <Fragment key={`t-${key++}`}>{text.slice(lastIndex, match.index)}</Fragment>,
      );
    }
    const inner = (match[1] ?? '').trim();
    const target = extractWikilinkTarget(inner);
    const isOrphan = orphanSet.has(target);
    const label = inner;
    nodes.push(
      <button
        key={`l-${key++}`}
        type="button"
        onClick={() => onWikiLinkClick(target)}
        data-orphan={isOrphan ? 'true' : undefined}
        aria-label={isOrphan ? `${target} (orphan)` : target}
        className={
          isOrphan
            ? 'orphan-slug font-medium text-[--color-red-500] decoration-[--color-red-200]/60 decoration-dashed underline underline-offset-[3px] hover:text-[--color-red-500]'
            : 'font-medium text-[--brand-primary-text] decoration-[--border-focus]/40 underline underline-offset-[3px] hover:text-[--brand-primary-text] hover:decoration-[--border-focus]'
        }
        title={isOrphan ? target : undefined}
      >
        {label}
      </button>,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(<Fragment key={`t-${key++}`}>{text.slice(lastIndex)}</Fragment>);
  }
  return nodes;
}

function processChildren(
  children: ReactNode,
  onWikiLinkClick: (slug: string) => void,
  orphanSet: ReadonlySet<string>,
): ReactNode {
  if (typeof children === 'string') {
    return renderWithWikilinks(children, onWikiLinkClick, orphanSet);
  }
  if (Array.isArray(children)) {
    return children.map((child, idx) => {
      if (typeof child === 'string') {
        return (
          <Fragment key={idx}>
            {renderWithWikilinks(child, onWikiLinkClick, orphanSet)}
          </Fragment>
        );
      }
      return <Fragment key={idx}>{child}</Fragment>;
    });
  }
  return children;
}

export function WikiPageView({
  page,
  onWikiLinkClick,
  orphanSlugs,
}: WikiPageViewProps) {
  const orphanSet: ReadonlySet<string> = orphanSlugs
    ? new Set(orphanSlugs)
    : new Set();
  const t = useTranslations('Wiki');
  const showEdit = page.slug.startsWith('manual/') && page.sensitivity !== 'secret';
  const sens = SENSITIVITY_STYLES[page.sensitivity];

  const formattedDate = new Date(page.updatedAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <article className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <header className="relative border-b border-[--border-default] pb-5">
        {/* Sensitivity accent ribbon */}
        <div
          className={cn(
            'absolute -left-4 top-0 h-1 w-[calc(100%+2rem)] rounded-full bg-gradient-to-r',
            sens.bar,
          )}
          aria-hidden
        />

        {/* Eyebrow — slug path */}
        <p className="text-display mt-2 truncate text-[11px] uppercase tracking-[0.12em] text-[--fg-muted]">
          {page.slug.split('/').join(' / ')}
        </p>

        <div className="mt-1 flex items-start justify-between gap-4">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-[--fg-primary] [text-wrap:pretty]">
            {page.title}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <Capy name="astronaut" size={48} className="shrink-0" />
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
                sens.chip,
              )}
            >
              {t(`sensitivity.${page.sensitivity}`)}
            </span>
          </div>
        </div>

        {/* Tags */}
        {page.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {page.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-0.5 rounded-full bg-[--bg-surface] px-2 py-0.5 text-[11px] font-medium text-[--fg-secondary] ring-1 ring-inset ring-[--border-default]"
              >
                <Hash className="h-2.5 w-2.5 text-[--fg-muted]" />
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Meta row */}
        <div className="text-display mt-3 flex items-center gap-1.5 text-[11px] tabular-nums text-[--fg-secondary]">
          <Calendar className="h-3 w-3 text-[--fg-muted]" />
          <span>{t('lastUpdated')}</span>
          <span className="text-[--fg-muted]">·</span>
          <span className="font-medium text-[--fg-primary]">{formattedDate}</span>
        </div>
      </header>

      {page.pageType === 'infra-runbook' && page.infra && (
        <div className="mt-6">
          <InfraRunbookHeader meta={page.infra} />
        </div>
      )}

      {/* Body */}
      <div className="prose prose-sm mt-6 max-w-none text-[14.5px] leading-[1.75] text-[--fg-primary]">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <p className="my-3.5 leading-[1.75] [text-wrap:pretty]">
                {processChildren(children, onWikiLinkClick, orphanSet)}
              </p>
            ),
            li: ({ children }) => (
              <li className="my-1 leading-[1.7]">
                {processChildren(children, onWikiLinkClick, orphanSet)}
              </li>
            ),
            h1: ({ children }) => (
              <h1 className="mt-8 mb-3 border-b border-[--border-default] pb-2 text-[22px] font-bold tracking-tight text-[--fg-primary]">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="mt-7 mb-2.5 text-[18px] font-semibold tracking-tight text-[--fg-primary]">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="mt-5 mb-2 text-[15px] font-semibold text-[--fg-primary]">
                {children}
              </h3>
            ),
            ul: ({ children }) => (
              <ul className="my-3 list-disc space-y-1 pl-5 marker:text-[--fg-muted]">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="my-3 list-decimal space-y-1 pl-5 marker:text-[--fg-muted] marker:font-semibold">
                {children}
              </ol>
            ),
            blockquote: ({ children }) => (
              <blockquote className="my-4 rounded-r-md border-l-[3px] border-[--brand-primary] bg-[--brand-primary-bg] px-4 py-3 text-[14px] italic text-[--fg-primary] [&_p]:my-0">
                {children}
              </blockquote>
            ),
            hr: () => <hr className="my-6 border-[--border-default]" />,
            code: ({ className, children, ...props }) => {
              const isInline = !className;
              if (isInline) {
                return (
                  <code
                    className="rounded-[4px] bg-[--bg-surface] px-[0.35em] py-[0.15em] font-mono text-[0.88em] text-[--fg-primary] ring-1 ring-inset ring-[--border-soft]"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }
              return (
                <code className={cn('font-mono text-[13px]', className)} {...props}>
                  {children}
                </code>
              );
            },
            pre: ({ children }) => (
              <pre className="relative my-4 overflow-x-auto rounded-md bg-[--bg-surface] p-4 font-mono text-[13px] leading-[1.65] text-[--fg-primary] ring-1 ring-inset ring-[--border-default] shadow-[inset_0_1px_0_rgba(0,0,0,0.04)]">
                {children}
              </pre>
            ),
            table: ({ children }) => (
              <div className="my-4 overflow-hidden overflow-x-auto rounded-md border border-[--border-default]">
                <table className="w-full border-collapse text-[13px]">{children}</table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-[--bg-surface] text-left">{children}</thead>
            ),
            th: ({ children }) => (
              <th className="text-display border-b border-[--border-default] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[--fg-secondary]">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border-b border-[--border-soft] px-3 py-2 text-[--fg-primary] last:border-0">
                {processChildren(children, onWikiLinkClick, orphanSet)}
              </td>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                className="font-medium text-[--brand-primary-text] decoration-[--border-focus]/40 underline underline-offset-[3px] hover:text-[--brand-primary-text] hover:decoration-[--border-focus]"
              >
                {children}
              </a>
            ),
            img: ({ src, alt }) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={alt ?? ''}
                className="my-4 rounded-md border border-[--border-default] shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              />
            ),
          }}
        >
          {page.content}
        </ReactMarkdown>
      </div>

      {showEdit && (
        <div className="mt-6 flex items-center justify-between gap-3 border-t border-[--border-default] pt-5">
          <p className="text-display text-[11px] text-[--fg-secondary]">
            직접 수정하려면 편집 모드로 전환하세요.
          </p>
          <Button variant="outline" size="sm">
            <Pencil className="h-3.5 w-3.5" />
            {t('edit')}
          </Button>
        </div>
      )}
    </article>
  );
}
