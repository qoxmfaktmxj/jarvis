// packages/search/highlighter.ts

/**
 * ts_headline options string for PostgreSQL.
 * MaxWords/MinWords control snippet length.
 * StartSel/StopSel are the highlight tags (must be HTML-safe on output).
 */
export const HEADLINE_OPTIONS =
  'MaxWords=50, MinWords=20, StartSel=<mark>, StopSel=</mark>, HighlightAll=false, ShortWord=3';

/**
 * Sanitize ts_headline output: allow only <mark> and </mark> tags,
 * strip any other HTML to prevent XSS. ts_headline output should only
 * contain text + our chosen <mark> tags, but we sanitize defensively.
 */
export function sanitizeHeadline(raw: string): string {
  return raw
    .replace(/<mark[^>]*>/gi, '<mark>')     // normalize <mark> — strip any attributes
    .replace(/<(?!\/?mark>)[^>]*>/gi, '')   // strip all tags except plain <mark>/<\/mark>
    .trim();
}
