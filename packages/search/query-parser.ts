// packages/search/query-parser.ts
import type { ParsedQuery, QueryMode } from './types.js';

/**
 * Sanitize raw user input: strip dangerous SQL characters, collapse whitespace.
 * Keep alphanumeric, spaces, hyphens, apostrophes, and quotation marks.
 */
function sanitize(q: string): string {
  return q
    .trim()
    .replace(/[^\w\s"'\-*]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Strip surrounding quotes from a phrase query like "foo bar" → foo bar
 */
function stripQuotes(q: string): string {
  return q.replace(/^"|"$/g, '').trim();
}

/**
 * Detect query mode from raw user input:
 *   - phrase: starts AND ends with double quote  → "foo bar"
 *   - prefix: ends with asterisk                 → foo*
 *   - web: everything else (default)
 */
function detectMode(q: string): QueryMode {
  const trimmed = q.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 2) {
    return 'phrase';
  }
  if (trimmed.endsWith('*')) {
    return 'prefix';
  }
  return 'web';
}

/**
 * Build the PostgreSQL tsquery expression string for each mode.
 *
 * IMPORTANT: these strings are used as SQL literal arguments inside
 * Drizzle's sql`` tagged template — the actual parameterization happens
 * in PgSearchAdapter. Here we just return the sanitized term so callers
 * know which PG function to use.
 *
 *   web    → websearch_to_tsquery('simple', $term)
 *   phrase → phraseto_tsquery('simple', $term)
 *   prefix → to_tsquery('simple', $prefix || ':*')
 *             where $prefix is the word before the trailing *
 */
export function parseQuery(q: string): ParsedQuery {
  const mode = detectMode(q);
  const sanitized = sanitize(q);

  let tsquery: string;

  switch (mode) {
    case 'phrase': {
      const inner = stripQuotes(sanitized);
      // phraseto_tsquery returns a phrase tsquery; we pass the inner text
      tsquery = `phraseto_tsquery('simple', '${inner.replace(/'/g, "''")}')`;
      break;
    }
    case 'prefix': {
      // Remove trailing * to get prefix word, then use :* operator
      const prefix = sanitized.replace(/\*$/, '').trim();
      // to_tsquery requires lexeme format; for prefix search the :* modifier works
      tsquery = `to_tsquery('simple', '${prefix.replace(/'/g, "''")}:*')`;
      break;
    }
    case 'web':
    default: {
      // websearch_to_tsquery handles AND/OR/NOT naturally
      tsquery = `websearch_to_tsquery('simple', '${sanitized.replace(/'/g, "''")}')`;
      break;
    }
  }

  return { tsquery, mode, sanitized };
}

/**
 * Return the bare term (no function wrapper) for use as a bind parameter.
 * PgSearchAdapter passes this to Drizzle sql`` so PG handles escaping.
 */
export function extractTerm(q: string): string {
  const mode = detectMode(q);
  const sanitized = sanitize(q);

  switch (mode) {
    case 'phrase':
      return stripQuotes(sanitized);
    case 'prefix':
      return sanitized.replace(/\*$/, '').trim();
    default:
      return sanitized;
  }
}

export { detectMode, sanitize };
