import type { ReviewBlock } from "../types.js";

/**
 * Canonical REVIEW block format (reference_only/llm_wiki/src/lib/ingest.ts
 * L246-309):
 *
 * ```
 * ---REVIEW: type | Title---
 * Description body ...
 * OPTIONS: Label A | Label B
 * PAGES: path/one.md, path/two.md
 * SEARCH: query one | query two
 * ---END REVIEW---
 * ```
 *
 * - `type` is lowercased and whitespace-trimmed.
 * - `title` is trimmed.
 * - `body` is the raw body with OPTIONS / PAGES / SEARCH meta lines
 *   stripped out so the consumer can show it to the user directly.
 * - `options` / `pages` / `search` are optional — only present when
 *   the corresponding meta line appeared. An empty-valued meta line
 *   yields an empty array (not undefined) so that callers can
 *   distinguish "absent" from "explicitly empty".
 */
const REVIEW_BLOCK_REGEX = /---REVIEW:[ \t]*(\w[\w-]*)[ \t]*\|[ \t]*(.+?)[ \t]*---\n([\s\S]*?)\n---END REVIEW---/g;

const OPTIONS_LINE = /^OPTIONS:[ \t]*(.*)$/m;
const PAGES_LINE = /^PAGES:[ \t]*(.*)$/m;
const SEARCH_LINE = /^SEARCH:[ \t]*(.*)$/m;

function splitList(value: string, separator: string): string[] {
  return value
    .split(separator)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function stripMetaLines(body: string): string {
  return body
    .replace(/^OPTIONS:.*$/m, "")
    .replace(/^PAGES:.*$/m, "")
    .replace(/^SEARCH:.*$/m, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Parse REVIEW blocks out of the Generation LLM's raw text output.
 *
 * Returns an empty array when no complete block is found. Malformed
 * blocks (missing END marker, missing pipe between type and title)
 * are ignored silently.
 */
export function parseReviewBlocks(text: string): ReviewBlock[] {
  if (!text) return [];

  const blocks: ReviewBlock[] = [];
  const matches = text.matchAll(REVIEW_BLOCK_REGEX);

  for (const match of matches) {
    const type = (match[1] ?? "").trim().toLowerCase();
    const title = (match[2] ?? "").trim();
    const body = match[3] ?? "";

    if (!type || !title) continue;

    const block: ReviewBlock = {
      type,
      title,
      body: stripMetaLines(body),
    };

    const optionsMatch = body.match(OPTIONS_LINE);
    if (optionsMatch) {
      // `|` is the canonical separator for OPTIONS.
      block.options = splitList(optionsMatch[1] ?? "", "|");
    }

    const pagesMatch = body.match(PAGES_LINE);
    if (pagesMatch) {
      // `,` is the canonical separator for PAGES (matches llm_wiki).
      block.pages = splitList(pagesMatch[1] ?? "", ",");
    }

    const searchMatch = body.match(SEARCH_LINE);
    if (searchMatch) {
      // `|` is the canonical separator for SEARCH queries.
      block.search = splitList(searchMatch[1] ?? "", "|");
    }

    blocks.push(block);
  }

  return blocks;
}
