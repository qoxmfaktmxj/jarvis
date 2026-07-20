import { isProjectableWikiPath, normalizeRepoRelativePath } from "@jarvis/wiki-fs";
import type { AskAgentDeps, WikiReadResult } from "../../types.js";
import { assertToolAccess } from "./types.js";

export async function wikiRead(
  deps: Pick<AskAgentDeps, "context" | "wikiRepo">,
  input: { slug: string; path: string },
): Promise<WikiReadResult> {
  assertToolAccess(deps.context, "wiki_read");
  const slug = String(input.slug ?? "").trim();
  const path = normalizeRepoRelativePath(String(input.path ?? ""));
  if (!/^[a-z0-9-]{1,240}$/i.test(slug)) throw new Error("WIKI_SLUG_INVALID");
  if (!isProjectableWikiPath(path)) throw new Error("WIKI_PATH_NOT_PROJECTABLE");
  const gitSha = await deps.wikiRepo.headSha();
  const body = await deps.wikiRepo.readBlob(gitSha, path);
  return { slug, path, gitSha, body };
}
