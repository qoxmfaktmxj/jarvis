import { isProjectableWikiPath, normalizeRepoRelativePath, parseWikilinks } from "@jarvis/wiki-fs";
import type { AskAgentDeps } from "../../types.js";
import { assertToolAccess } from "./types.js";

export async function wikiFollowLink(
  deps: Pick<AskAgentDeps, "context" | "wikiRepo">,
  input: { slug: string; path: string },
): Promise<{ slug: string; path: string; links: Array<{ target: string; alias?: string; anchor?: string }> }> {
  assertToolAccess(deps.context, "wiki_follow_link");
  const slug = String(input.slug ?? "").trim();
  const path = normalizeRepoRelativePath(String(input.path ?? ""));
  if (!/^[a-z0-9-]{1,240}$/i.test(slug)) throw new Error("WIKI_SLUG_INVALID");
  if (!isProjectableWikiPath(path)) {
    throw new Error("WIKI_PATH_NOT_PROJECTABLE");
  }
  const gitSha = await deps.wikiRepo.headSha();
  const body = await deps.wikiRepo.readBlob(gitSha, path);
  return {
    slug,
    path,
    links: parseWikilinks(body).slice(0, 5).map((link) => ({
      target: link.target,
      ...(link.alias ? { alias: link.alias } : {}),
      ...(link.anchor ? { anchor: link.anchor } : {}),
    })),
  };
}
