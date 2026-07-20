import type { AskAgentDeps, ToolName } from "../../types.js";
import { TOOL_DEFINITIONS } from "./types.js";
import { wikiSearch } from "./wiki-search.js";
import { wikiRead } from "./wiki-read.js";
import { sourceRead } from "./source-read.js";
import { wikiFollowLink } from "./wiki-follow-link.js";

export { TOOL_DEFINITIONS };

export const TOOL_HANDLERS: Record<ToolName, (deps: AskAgentDeps, input: Record<string, unknown>) => Promise<unknown>> = {
  wiki_search: async (deps, input) => wikiSearch(deps, {
    query: String(input.query ?? ""),
    ...(typeof input.asOf === "string" ? { asOf: input.asOf } : {}),
  }),
  wiki_read: async (deps, input) => wikiRead(deps, {
    slug: String(input.slug ?? ""),
    path: String(input.path ?? ""),
  }),
  source_read: async (deps, input) => sourceRead(deps, {
    source_revision_id: String(input.source_revision_id ?? ""),
    locator: String(input.locator ?? ""),
  }),
  wiki_follow_link: async (deps, input) => wikiFollowLink(deps, {
    slug: String(input.slug ?? ""),
    path: String(input.path ?? ""),
  }),
};
