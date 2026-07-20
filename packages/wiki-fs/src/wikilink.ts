import type { WikiLink } from "./types.js";

const WIKILINK_REGEX = /\[\[([^\]\n]+?)\]\]/g;

export function parseWikilinks(content: string): WikiLink[] {
  const results: WikiLink[] = [];
  for (const match of content.matchAll(WIKILINK_REGEX)) {
    const inner = match[1];
    if (inner === undefined) continue;
    const parsed = parseInner(inner);
    if (parsed) results.push({ ...parsed, raw: match[0] });
  }
  return results;
}

export function parseWikilink(literal: string): WikiLink | null {
  const trimmed = literal.trim();
  if (!trimmed.startsWith("[[") || !trimmed.endsWith("]]")) return null;
  const parsed = parseInner(trimmed.slice(2, -2));
  return parsed ? { ...parsed, raw: trimmed } : null;
}

export function renderWikilinks(
  content: string,
  transform: (link: WikiLink) => string,
): string {
  return content.replace(WIKILINK_REGEX, (match, inner: string) => {
    const parsed = parseInner(inner);
    return parsed ? transform({ ...parsed, raw: match }) : match;
  });
}

export function formatWikilink(link: Omit<WikiLink, "raw">): string {
  const target = assertSafeComponent(link.target, "target");
  const anchor = link.anchor === undefined ? undefined : assertSafeComponent(link.anchor, "anchor");
  const alias = link.alias === undefined ? undefined : assertSafeComponent(link.alias, "alias");
  return `[[${target}${anchor ? `#${anchor}` : ""}${alias ? `|${alias}` : ""}]]`;
}

function parseInner(inner: string): Omit<WikiLink, "raw"> | null {
  let rest = inner.trim();
  if (!rest) return null;
  let alias: string | undefined;
  let anchor: string | undefined;
  const pipeIndex = rest.indexOf("|");
  if (pipeIndex >= 0) {
    alias = rest.slice(pipeIndex + 1).trim() || undefined;
    rest = rest.slice(0, pipeIndex).trim();
  }
  const hashIndex = rest.indexOf("#");
  if (hashIndex >= 0) {
    anchor = rest.slice(hashIndex + 1).trim() || undefined;
    rest = rest.slice(0, hashIndex).trim();
  }
  if (!rest) return null;
  try {
    const result: Omit<WikiLink, "raw"> = {
      target: assertSafeComponent(rest, "target"),
    };
    if (alias !== undefined) result.alias = assertSafeComponent(alias, "alias");
    if (anchor !== undefined) result.anchor = assertSafeComponent(anchor, "anchor");
    return result;
  } catch {
    return null;
  }
}

function assertSafeComponent(value: string, label: "target" | "alias" | "anchor"): string {
  const normalized = value.normalize("NFC");
  if (!normalized || normalized !== value) throw new Error(`${label} must be NFC-normalized`);
  if (/[\u0000-\u001f\u007f\[\]]/.test(normalized) || normalized.includes("|")) {
    throw new Error(`${label} contains unsafe characters`);
  }
  if ((label === "target" || label === "anchor") && normalized.includes("#")) {
    throw new Error(`${label} contains unsafe characters`);
  }
  return normalized;
}
