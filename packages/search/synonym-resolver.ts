// packages/search/synonym-resolver.ts
import { db } from '@jarvis/db/client';
import { searchSynonym } from '@jarvis/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Look up synonyms for every token in the query from the search_synonym table.
 * Returns an array of expanded terms: [original, ...all synonyms found].
 * Deduplicates and lowercases before returning.
 */
export async function resolveSynonyms(
  q: string,
  workspaceId: string,
): Promise<string[]> {
  const tokens = q
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return [q];

  const rows = await db
    .select({ term: searchSynonym.term, synonyms: searchSynonym.synonyms })
    .from(searchSynonym)
    .where(eq(searchSynonym.workspaceId, workspaceId));

  const synonymMap = new Map<string, string[]>();
  for (const row of rows) {
    synonymMap.set(row.term.toLowerCase(), row.synonyms.map((s) => s.toLowerCase()));
  }

  const expanded = new Set<string>([q.toLowerCase()]);

  for (const token of tokens) {
    const syns = synonymMap.get(token);
    if (syns) {
      for (const syn of syns) {
        expanded.add(syn);
      }
    }
  }

  return Array.from(expanded);
}

/**
 * Build an expanded query string by joining all resolved terms with OR
 * so PostgreSQL websearch_to_tsquery can pick up any synonym.
 */
export function buildExpandedQuery(terms: string[]): string {
  // Join unique terms with OR for websearch_to_tsquery
  return terms
    .filter((t) => t.trim().length > 0)
    .map((t) => t.trim())
    .join(' OR ');
}
