import { PERMISSIONS } from "@jarvis/shared";
import type { ToolContext, ToolDefinition, ToolName } from "../../types.js";

export { TOOL_NAMES } from "../../types.js";

export function isToolName(value: string): value is ToolName {
  return value === "wiki_search" || value === "wiki_read" || value === "source_read" || value === "wiki_follow_link";
}

export function assertToolAccess(context: ToolContext, tool: ToolName): void {
  const required = tool === "source_read" ? PERMISSIONS.SOURCE_READ : PERMISSIONS.WIKI_READ;
  if (!context.permissions.has(required)) {
    throw new Error("FORBIDDEN");
  }
}

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: "wiki_search",
    description: "Search published wiki pages and evidence records.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "wiki_read",
    description: "Read one wiki page from current Git HEAD.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        path: { type: "string" },
      },
      required: ["slug", "path"],
      additionalProperties: false,
    },
  },
  {
    name: "source_read",
    description: "Read one bounded evidence segment from a source revision.",
    inputSchema: {
      type: "object",
      properties: {
        source_revision_id: { type: "string" },
        locator: { type: "string" },
      },
      required: ["source_revision_id", "locator"],
      additionalProperties: false,
    },
  },
  {
    name: "wiki_follow_link",
    description: "Follow a wikilink from a wiki page to a linked wiki page.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        path: { type: "string" },
      },
      required: ["slug", "path"],
      additionalProperties: false,
    },
  },
] as const;
