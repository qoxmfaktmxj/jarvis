'use client';

import { Fragment, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { WikiPage } from './types';

const WIKILINK_PATTERN = /\[\[([^\]]+)\]\]/g;

const SENSITIVITY_VARIANT: Record<
  WikiPage['sensitivity'],
  'success' | 'warning' | 'destructive'
> = {
  public: 'success',
  internal: 'warning',
  confidential: 'destructive',
};

type WikiPageViewProps = {
  page: WikiPage;
  onWikiLinkClick: (slug: string) => void;
  /**
   * T6 — 본문에서 `[[...]]` 로 참조되지만 DB 에 실제 페이지가 없는
   * target slug 집합. 전달되면 해당 링크를 orphan 스타일(빨간색)로 표시한다.
   * SSoT 는 `wiki_page_link.toPageId IS NULL` — 서버 컴포넌트가 조회해 넘긴다.
   */
  orphanSlugs?: readonly string[];
};

/**
 * `[[target|alias]]` / `[[target#anchor]]` 에서 target 만 뽑는다.
 * DB orphan set 과 비교할 키는 target 이므로 alias/anchor 는 잘라낸다.
 */
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
    const label = inner; // 화면에는 alias/anchor 포함한 원본 표기를 그대로 보여준다.
    nodes.push(
      <button
        key={`l-${key++}`}
        type="button"
        onClick={() => onWikiLinkClick(target)}
        data-orphan={isOrphan ? 'true' : undefined}
        aria-label={isOrphan ? `${target} (orphan)` : target}
        className={
          isOrphan
            ? 'orphan-slug text-rose-600 underline underline-offset-2 decoration-dashed hover:text-rose-700'
            : 'text-blue-600 underline underline-offset-2 hover:text-blue-700'
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
  const showEdit =
    page.slug.startsWith('manual/') && page.sensitivity !== 'confidential';

  const formattedDate = new Date(page.updatedAt).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <article className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <header className="space-y-3 border-b border-gray-200 pb-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-bold text-gray-900">{page.title}</h1>
          <Badge variant={SENSITIVITY_VARIANT[page.sensitivity]}>
            {t(`sensitivity.${page.sensitivity}`)}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {page.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              #{tag}
            </Badge>
          ))}
        </div>
        <p className="text-sm text-gray-500">
          {t('lastUpdated')}: {formattedDate}
        </p>
      </header>

      <div className="prose prose-sm max-w-none text-gray-800">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <p className="leading-7 my-3">
                {processChildren(children, onWikiLinkClick, orphanSet)}
              </p>
            ),
            li: ({ children }) => (
              <li className="my-1">{processChildren(children, onWikiLinkClick, orphanSet)}</li>
            ),
            h1: ({ children }) => (
              <h1 className="text-2xl font-bold mt-6 mb-3">{children}</h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-xl font-semibold mt-5 mb-2">{children}</h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-lg font-semibold mt-4 mb-2">{children}</h3>
            ),
            ul: ({ children }) => (
              <ul className="list-disc list-inside space-y-1 my-3">{children}</ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal list-inside space-y-1 my-3">{children}</ol>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-gray-300 bg-gray-50 px-4 py-2 my-3 text-gray-700 italic">
                {children}
              </blockquote>
            ),
            code: ({ className, children, ...props }) => {
              const isInline = !className;
              if (isInline) {
                return (
                  <code
                    className="bg-gray-100 text-rose-700 rounded px-1 py-0.5 font-mono text-sm"
                    {...props}
                  >
                    {children}
                  </code>
                );
              }
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
            pre: ({ children }) => (
              <pre className="bg-gray-900 text-gray-100 rounded-md p-4 my-4 overflow-x-auto font-mono text-sm">
                {children}
              </pre>
            ),
            table: ({ children }) => (
              <div className="my-4 overflow-x-auto">
                <table className="w-full border-collapse text-sm">{children}</table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="bg-gray-100">{children}</thead>
            ),
            th: ({ children }) => (
              <th className="border border-gray-300 px-3 py-2 text-left font-semibold">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="border border-gray-300 px-3 py-2">
                {processChildren(children, onWikiLinkClick, orphanSet)}
              </td>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                className="text-blue-600 underline underline-offset-2 hover:text-blue-700"
              >
                {children}
              </a>
            ),
          }}
        >
          {page.content}
        </ReactMarkdown>
      </div>

      {showEdit && (
        <div className="pt-4 border-t border-gray-200">
          <Button variant="outline" size="sm">
            {t('edit')}
          </Button>
        </div>
      )}
    </article>
  );
}
