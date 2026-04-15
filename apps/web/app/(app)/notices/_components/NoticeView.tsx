'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface NoticeViewProps {
  bodyMd: string;
}

export function NoticeView({ bodyMd }: NoticeViewProps) {
  return (
    <div
      data-testid="notice-view"
      className="prose prose-sm max-w-none rounded-lg border border-gray-200 bg-white px-6 py-5"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{bodyMd}</ReactMarkdown>
    </div>
  );
}
