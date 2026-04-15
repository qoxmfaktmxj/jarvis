import type { FileBlock } from "../types.js";

/**
 * Canonical FILE block format (see reference_only/llm_wiki/src/lib/ingest.ts
 * L11 / L219-245):
 *
 * ```
 * ---FILE: auto/path/to/page.md---
 * (body with YAML frontmatter)
 * ---END FILE---
 * ```
 *
 * Rules:
 * - Path is trimmed; empty paths are discarded.
 * - Incomplete blocks (missing END FILE) are ignored silently —
 *   the upstream Generation LLM sometimes truncates output and we
 *   never want to write partial pages.
 * - For `log.md` (root OR any subdirectory suffix), the block is
 *   tagged `mode: "append"` so the caller appends to the existing
 *   file instead of overwriting.
 *
 * The regex uses `[\s\S]*?` (lazy, dotall) to safely handle
 * multi-page outputs without greedily eating the next header.
 */
const FILE_BLOCK_REGEX = /---FILE:[ \t]*([^\n]+?)[ \t]*---\n([\s\S]*?)\n---END FILE---/g;

function isLogPath(relativePath: string): boolean {
  return relativePath === "log.md"
    || relativePath === "wiki/log.md"
    || relativePath.endsWith("/log.md");
}

/**
 * Parse FILE blocks out of the Generation LLM's raw text output.
 *
 * Returns an empty array when no complete block is found. The
 * parser is intentionally tolerant: malformed headers (e.g. missing
 * END marker) are dropped rather than thrown.
 */
export function parseFileBlocks(text: string): FileBlock[] {
  if (!text) return [];

  const blocks: FileBlock[] = [];
  // `.matchAll` on a `/g` regex returns every non-overlapping match.
  const matches = text.matchAll(FILE_BLOCK_REGEX);

  for (const match of matches) {
    const rawPath = match[1]?.trim();
    // Preserve the inner body verbatim (frontmatter whitespace matters).
    // `match[2]` captures everything between the header newline and the
    // newline that precedes `---END FILE---`.
    const content = match[2] ?? "";

    if (!rawPath) continue;

    const block: FileBlock = {
      path: rawPath,
      content,
      mode: isLogPath(rawPath) ? "append" : "overwrite",
    };

    blocks.push(block);
  }

  return blocks;
}
