import Link from 'next/link';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePages } from '@/lib/queries/knowledge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { PageHeader } from '@/components/patterns/PageHeader';
import { EmptyState } from '@/components/patterns/EmptyState';
import { HelpCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function FAQHubPage() {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');

  const { data: pages } = await getKnowledgePages(session.workspaceId, session.permissions ?? [], {
    pageType: 'faq',
    publishStatus: 'published',
    limit: 100,
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader
        eyebrow="Knowledge · FAQ"
        title="FAQ"
        description="Frequently asked questions"
      />

      {pages.length === 0 ? (
        <EmptyState
          icon={HelpCircle}
          title="No FAQ entries"
          description="No FAQ entries published yet."
        />
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {pages.map((page) => (
            <AccordionItem
              key={page.id}
              value={page.id}
              className="rounded-lg border border-border px-4"
            >
              <AccordionTrigger className="text-left font-medium">
                {page.title}
              </AccordionTrigger>
              <AccordionContent className="pb-4 text-sm text-muted-foreground">
                {page.summary ?? (
                  <Link
                    href={`/knowledge/${page.id}`}
                    className="text-isu-600 underline hover:text-isu-700"
                  >
                    Read full answer
                  </Link>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
