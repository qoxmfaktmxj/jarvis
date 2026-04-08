'use client';

import type { ComponentPropsWithoutRef } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface KnowledgeMarkdownProps {
  content: string;
  className?: string;
}

const components: Components = {
  table: (props: ComponentPropsWithoutRef<'table'>) => (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  ),
  a: ({ href, ...props }: ComponentPropsWithoutRef<'a'>) => {
    const isExternal = href?.startsWith('http');

    return (
      <a
        href={href}
        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...props}
      />
    );
  },
};

export function KnowledgeMarkdown({
  content,
  className,
}: KnowledgeMarkdownProps) {
  if (!content.trim()) {
    return (
      <div className={`mdx-content ${className ?? ''}`}>
        <p className="text-gray-400 italic">No content available.</p>
      </div>
    );
  }

  return (
    <div className={`mdx-content ${className ?? ''}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
