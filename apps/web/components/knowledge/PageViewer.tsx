import '@/styles/mdx.css';
import { MDXRemote } from 'next-mdx-remote/rsc';
import type { ComponentPropsWithoutRef } from 'react';

interface PageViewerProps {
  mdxContent: string;
  className?: string;
}

// Custom MDX components — extend as needed
const components = {
  // Wrap tables for horizontal scroll on small screens
  table: (props: ComponentPropsWithoutRef<'table'>) => (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  ),
  // Open external links in a new tab
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

export async function PageViewer({ mdxContent, className }: PageViewerProps) {
  // Validate that content is non-empty before attempting to render
  if (!mdxContent?.trim()) {
    return (
      <div className={`mdx-content ${className ?? ''}`}>
        <p className="text-gray-400 italic">No content available.</p>
      </div>
    );
  }

  try {
    return (
      <div className={`mdx-content ${className ?? ''}`}>
        <MDXRemote source={mdxContent} components={components} />
      </div>
    );
  } catch (err) {
    // Fallback: render raw content when MDX compilation fails
    return (
      <div className={`mdx-content ${className ?? ''}`}>
        <div className="rounded-md border border-red-300 bg-red-50 p-3 mb-4 text-sm text-red-700">
          MDX compilation error — showing raw content.
        </div>
        <pre className="whitespace-pre-wrap text-sm">{mdxContent}</pre>
      </div>
    );
  }
}
