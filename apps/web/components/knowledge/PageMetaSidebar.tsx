import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Edit, Clock, History, ShieldCheck, Tag } from 'lucide-react';
import type { KnowledgePageWithVersion } from '@/lib/queries/knowledge';

interface PageMetaSidebarProps {
  page: KnowledgePageWithVersion;
  canEdit: boolean;
}

const PAGE_TYPE_LABELS: Record<string, string> = {
  project: 'Project', system: 'System', access: 'Access',
  runbook: 'Runbook', onboarding: 'Onboarding', 'hr-policy': 'HR Policy',
  'tool-guide': 'Tool Guide', faq: 'FAQ', decision: 'Decision',
  incident: 'Incident', analysis: 'Analysis', glossary: 'Glossary',
};

const SENSITIVITY_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  PUBLIC: 'outline',
  INTERNAL: 'secondary',
  RESTRICTED: 'default',
  SECRET_REF_ONLY: 'destructive',
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  review: 'default',
  published: 'outline',
  archived: 'destructive',
};

export function PageMetaSidebar({ page, canEdit }: PageMetaSidebarProps) {
  const frontmatter = (page.currentVersion?.frontmatter ?? {}) as Record<string, unknown>;
  const tags = Array.isArray(frontmatter.tags) ? frontmatter.tags as string[] : [];
  const versionNumber = page.currentVersion?.versionNumber ?? 1;

  return (
    <aside className="space-y-4 text-sm">
      {canEdit && (
        <div className="flex flex-col gap-2">
          <Button asChild className="w-full">
            <Link href={`/knowledge/${page.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" /> Edit Page
            </Link>
          </Button>
          <Button variant="outline" asChild className="w-full">
            <Link href={`/knowledge/${page.id}/review`}>Review</Link>
          </Button>
          <Button variant="ghost" asChild className="w-full">
            <Link href={`/knowledge/${page.id}/history`}>
              <History className="h-4 w-4 mr-2" /> Version History
            </Link>
          </Button>
        </div>
      )}

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[--fg-secondary]">Status</span>
          <Badge variant={STATUS_VARIANTS[page.publishStatus ?? 'draft']}>
            {page.publishStatus ?? 'draft'}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[--fg-secondary]">Type</span>
          <span className="font-medium">{PAGE_TYPE_LABELS[page.pageType] ?? page.pageType}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-[--fg-secondary]">
            <ShieldCheck className="h-3.5 w-3.5" /> Sensitivity
          </span>
          <Badge variant={SENSITIVITY_VARIANTS[page.sensitivity ?? 'INTERNAL']}>
            {page.sensitivity ?? 'INTERNAL'}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[--fg-secondary]">Version</span>
          <span className="font-mono font-medium">v{versionNumber}</span>
        </div>

        <div className="flex items-center gap-1 text-[--fg-secondary]">
          <Clock className="h-3.5 w-3.5 flex-none" />
          <span>
            Updated{' '}
            {page.updatedAt
              ? formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })
              : '—'}
          </span>
        </div>
      </div>

      {tags.length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center gap-1 text-[--fg-secondary]">
              <Tag className="h-3.5 w-3.5" /> Tags
            </div>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}

      {page.summary && (
        <>
          <Separator />
          <div className="space-y-1">
            <span className="text-[--fg-secondary]">Summary</span>
            <p className="text-xs leading-relaxed">{page.summary}</p>
          </div>
        </>
      )}
    </aside>
  );
}
