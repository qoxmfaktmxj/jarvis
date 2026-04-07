import Link from 'next/link';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePages } from '@/lib/queries/knowledge';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Wrench } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function ToolsHubPage() {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');

  const { data: pages } = await getKnowledgePages(session.workspaceId, {
    pageType: 'tool-guide',
    publishStatus: 'published',
    limit: 50,
  });

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <Wrench className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">Tool Guides</h1>
          <p className="text-sm text-gray-500">How-to guides for company tools</p>
        </div>
      </div>

      {pages.length === 0 ? (
        <p className="text-gray-400 italic">No tool guides published yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pages.map((page) => (
            <Card key={page.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <Link href={`/knowledge/${page.id}`} className="block space-y-1">
                  <p className="font-semibold hover:underline">{page.title}</p>
                  {page.summary && (
                    <p className="text-sm text-gray-500 line-clamp-2">{page.summary}</p>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <Badge variant="outline" className="text-xs">{page.sensitivity}</Badge>
                    <span className="text-xs text-gray-400">
                      {page.updatedAt
                        ? formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })
                        : ''}
                    </span>
                  </div>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
