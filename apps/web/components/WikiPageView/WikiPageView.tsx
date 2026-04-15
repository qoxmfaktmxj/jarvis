'use client';

import { Fragment, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { WikiPage } from './mockWikiPages';

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
};

function renderWithWikilinks(
  text: string,
  onWikiLinkClick: (slug: string) => void,
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
    const slug = (match[1] ?? '').trim();
    nodes.push(
      <button
        key={`l-${key++}`}
        type="button"
        onClick={() => onWikiLinkClick(slug)}
        className="text-blue-600 underline underline-offset-2 hover:text-blue-700"
      >
        {slug}
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
): ReactNode {
  if (typeof children === 'string') {
    return renderWithWikilinks(children, onWikiLinkClick);
  }
  if (Array.isArray(children)) {
    return children.map((child, idx) => {
      if (typeof child === 'string') {
        return (
          <Fragment key={idx}>{renderWithWikilinks(child, onWikiLinkClick)}</Fragment>
        );
      }
      return <Fragment key={idx}>{child}</Fragment>;
    });
  }
  return children;
}

export function WikiPageView({ page, onWikiLinkClick }: WikiPageViewProps) {
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
                {processChildren(children, onWikiLinkClick)}
              </p>
            ),
            li: ({ children }) => (
              <li className="my-1">{processChildren(children, onWikiLinkClick)}</li>
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
                {processChildren(children, onWikiLinkClick)}
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
