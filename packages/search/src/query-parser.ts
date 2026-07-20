const TOKEN_CHARS = /[^\p{L}\p{N}\s"._-]+/gu;

export interface ParsedSearchQuery {
  normalized: string;
  tsQueryText: string;
  trigramText: string;
  terms: string[];
}

export function parseSearchQuery(value: string): ParsedSearchQuery | null {
  const normalized = value
    .normalize("NFKC")
    .replace(TOKEN_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  if (!normalized) return null;

  const terms = normalized
    .replace(/"/g, " ")
    .split(/\s+/)
    .map((term) => term.slice(0, 40))
    .filter((term) => /[\p{L}\p{N}]/u.test(term))
    .filter(Boolean)
    .slice(0, 8);
  if (terms.length === 0) return null;

  return {
    normalized,
    tsQueryText: normalized,
    trigramText: terms.join(" "),
    terms,
  };
}
