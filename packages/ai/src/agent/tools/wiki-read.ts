import { isProjectableWikiPath, normalizeRepoRelativePath } from "@jarvis/wiki-fs";
import type { AskAgentDeps, WikiReadResult } from "../../types.js";
import { assertToolAccess } from "./types.js";

const WIKI_EXCERPT_MAX_CHARS = 6_000;

function queryTerms(query: string): string[] {
  return [...new Set(query.toLocaleLowerCase("ko-KR").match(/[\p{L}\p{N}]{2,}/gu) ?? [])];
}

export function selectWikiExcerpt(body: string, query: string): string {
  if (body.length <= WIKI_EXCERPT_MAX_CHARS) return body;

  const terms = queryTerms(query);
  if (terms.length === 0) return body.slice(0, WIKI_EXCERPT_MAX_CHARS);

  const sections = body.split(/(?=^#{1,6}\s+)/m).filter(Boolean);
  const bestSection = sections.reduce<{ section: string; score: number } | null>((best, section) => {
    const [heading = "", ...content] = section.split("\n");
    const lowerHeading = heading.toLocaleLowerCase("ko-KR");
    const lowerContent = content.join("\n").toLocaleLowerCase("ko-KR");
    const score = terms.reduce(
      (total, term) => total + (lowerHeading.includes(term) ? 4 : 0) + (lowerContent.split(term).length - 1),
      0,
    );
    return !best || score > best.score ? { section, score } : best;
  }, null);

  const selected = bestSection?.score ? bestSection.section : body;
  return selected.slice(0, WIKI_EXCERPT_MAX_CHARS);
}

export async function wikiRead(
  deps: Pick<AskAgentDeps, "context" | "wikiRepo">,
  input: { slug: string; path: string; query?: string },
): Promise<WikiReadResult> {
  assertToolAccess(deps.context, "wiki_read");
  const slug = String(input.slug ?? "").trim();
  const path = normalizeRepoRelativePath(String(input.path ?? ""));
  if (!/^[a-z0-9-]{1,240}$/i.test(slug)) throw new Error("WIKI_SLUG_INVALID");
  if (!isProjectableWikiPath(path)) throw new Error("WIKI_PATH_NOT_PROJECTABLE");
  const gitSha = await deps.wikiRepo.headSha();
  const body = await deps.wikiRepo.readBlob(gitSha, path);
  return { slug, path, gitSha, body: selectWikiExcerpt(body, input.query ?? "") };
}
