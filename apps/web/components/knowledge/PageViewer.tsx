import '@/styles/mdx.css';
import { KnowledgeMarkdown } from './KnowledgeMarkdown';

interface PageViewerProps {
  mdxContent: string;
  className?: string;
}

export function PageViewer({ mdxContent, className }: PageViewerProps) {
  return <KnowledgeMarkdown content={mdxContent} className={className} />;
}
