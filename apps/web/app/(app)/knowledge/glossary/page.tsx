import Link from 'next/link';
import { requirePageSession } from '@/lib/server/page-auth';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
import { getKnowledgePages } from '@/lib/queries/knowledge';
import { PageHeader } from '@/components/patterns/PageHeader';
import { EmptyState } from '@/components/patterns/EmptyState';
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
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageHeader
        eyebrow="Knowledge · Glossary"
        title="Glossary"
        description="Company-wide terminology reference"
      />

      {/* Alphabet quick-nav */}
      {letters.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-1">
          {letters.map((letter) => (
            <a
              key={letter}
              href={`#letter-${letter}`}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-input text-sm font-medium transition-colors hover:bg-muted"
            >
              {letter}
            </a>
          ))}
        </div>
      )}

      {letters.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="No entries"
          description="No glossary entries published yet."
        />
      ) : (
        <div className="space-y-8">
          {letters.map((letter) => (
            <section key={letter} id={`letter-${letter}`}>
              <h2 className="mb-4 border-b border-border pb-2 text-xl font-bold">
                {letter}
              </h2>
              <dl className="space-y-4">
                {(grouped[letter] ?? []).map((page) => (
                  <div key={page.id}>
                    <dt>
                      <Link
                        href={`/knowledge/${page.id}`}
                        className="font-semibold text-isu-600 hover:underline"
                      >
                        {page.title}
                      </Link>
                    </dt>
                    {page.summary && (
                      <dd className="mt-0.5 pl-4 text-sm text-muted-foreground">
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
