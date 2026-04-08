import Link from 'next/link';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePages } from '@/lib/queries/knowledge';
import { BookMarked } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function GlossaryPage() {
  const session = await requirePageSession(PERMISSIONS.KNOWLEDGE_READ, '/dashboard');

  const { data: pages } = await getKnowledgePages(session.workspaceId, session.permissions ?? [], {
    pageType: 'glossary',
    publishStatus: 'published',
    limit: 200,
  });

  // Group by first letter
  const grouped = pages.reduce<Record<string, typeof pages>>((acc, page) => {
    const letter = page.title.charAt(0).toUpperCase();
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(page);
    return acc;
  }, {});

  const letters = Object.keys(grouped).sort();

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <BookMarked className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold">Glossary</h1>
          <p className="text-sm text-gray-500">Company-wide terminology reference</p>
        </div>
      </div>

      {/* Alphabet quick-nav */}
      {letters.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {letters.map((letter) => (
            <a
              key={letter}
              href={`#letter-${letter}`}
              className="w-8 h-8 flex items-center justify-center rounded-md border border-gray-300 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              {letter}
            </a>
          ))}
        </div>
      )}

      {letters.length === 0 ? (
        <p className="text-gray-400 italic">No glossary entries published yet.</p>
      ) : (
        <div className="space-y-8">
          {letters.map((letter) => (
            <section key={letter} id={`letter-${letter}`}>
              <h2 className="text-xl font-bold border-b pb-2 mb-4">{letter}</h2>
              <dl className="space-y-4">
                {(grouped[letter] ?? []).map((page) => (
                  <div key={page.id}>
                    <dt>
                      <Link
                        href={`/knowledge/${page.id}`}
                        className="font-semibold text-blue-600 hover:underline"
                      >
                        {page.title}
                      </Link>
                    </dt>
                    {page.summary && (
                      <dd className="text-sm text-gray-500 mt-0.5 pl-4">
                        {page.summary}
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
