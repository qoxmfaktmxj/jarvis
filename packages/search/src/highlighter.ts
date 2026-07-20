function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll(`"`, "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface HighlightPart {
  text: string;
  matched: boolean;
}

export function highlightSnippet(snippet: string, terms: readonly string[]): HighlightPart[] {
  const windowed = snippet.slice(0, 240);
  if (terms.length === 0) return [{ text: escapeHtml(windowed), matched: false }];

  const uniqueTerms = Array.from(new Set(terms.filter(Boolean)));
  if (uniqueTerms.length === 0) return [{ text: escapeHtml(windowed), matched: false }];

  const pattern = new RegExp(`(${uniqueTerms.map(escapeRegex).join("|")})`, "giu");
  return windowed
    .split(pattern)
    .filter(Boolean)
    .map((part) => ({
      text: escapeHtml(part),
      matched: uniqueTerms.some((term) => part.localeCompare(term, "ko", { sensitivity: "accent" }) === 0),
    }));
}
