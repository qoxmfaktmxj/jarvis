import type { AskAgentDeps, EvidenceSearchHit } from "../../types.js";
import { assertToolAccess } from "./types.js";

export async function wikiSearch(
  deps: Pick<AskAgentDeps, "context" | "searcher">,
  input: { query: string; asOf?: string },
): Promise<EvidenceSearchHit[]> {
  assertToolAccess(deps.context, "wiki_search");
  const query = String(input.query ?? "").trim();
  if (!query) return [];
  return deps.searcher.searchEvidence({
    workspaceId: deps.context.workspaceId,
    query,
    asOf: input.asOf,
    types: ["wiki", "source", "legal_case"],
    page: 1,
    limit: 5,
  });
}
