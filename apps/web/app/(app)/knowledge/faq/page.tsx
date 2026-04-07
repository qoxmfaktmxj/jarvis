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
import { HelpCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function FAQHubPage() {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');

  const { data: pages } = await getKnowledgePages(session.workspaceId, {
    pageType: 'faq',
    publishStatus: 'published',
    limit: 100,
  });

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <HelpCircle className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">FAQ</h1>
          <p className="text-sm text-gray-500">Frequently asked questions</p>
        </div>
      </div>

      {pages.length === 0 ? (
        <p className="text-gray-400 italic">No FAQ entries published yet.</p>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {pages.map((page) => (
            <AccordionItem key={page.id} value={page.id} className="border rounded-lg px-4">
              <AccordionTrigger className="font-medium text-left">
                {page.title}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-gray-500 pb-4">
                {page.summary ?? (
                  <Link href={`/knowledge/${page.id}`} className="underline text-blue-600">
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
