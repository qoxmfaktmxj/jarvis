import type { ReviewBlock } from "../types.js";

const REVIEW_BLOCK_REGEX =
  /---REVIEW:[ \t]*([A-Za-z][\w-]*)[ \t]*\|[ \t]*(.+?)[ \t]*---\r?\n([\s\S]*?)\r?\n---END REVIEW---/g;

function splitList(value: string, separator: string): string[] {
  return value
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stripMetaLines(body: string): string {
  return body
    .replace(/^OPTIONS:.*$/gm, "")
    .replace(/^PAGES:.*$/gm, "")
    .replace(/^SEARCH:.*$/gm, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseReviewBlocks(text: string): ReviewBlock[] {
  if (!text) return [];

  const blocks: ReviewBlock[] = [];
  for (const match of text.matchAll(REVIEW_BLOCK_REGEX)) {
    const type = (match[1] ?? "").trim().toLowerCase();
    const title = (match[2] ?? "").trim();
    const body = match[3] ?? "";
    if (!type || !title) continue;

    const review: ReviewBlock = {
      type,
      title,
      body: stripMetaLines(body),
    };

    const optionsMatch = /^OPTIONS:[ \t]*(.*)$/m.exec(body);
    if (optionsMatch) review.options = splitList(optionsMatch[1] ?? "", "|");

    const pagesMatch = /^PAGES:[ \t]*(.*)$/m.exec(body);
    if (pagesMatch) review.pages = splitList(pagesMatch[1] ?? "", ",");

    const searchMatch = /^SEARCH:[ \t]*(.*)$/m.exec(body);
    if (searchMatch) review.search = splitList(searchMatch[1] ?? "", "|");

    blocks.push(review);
  }

  return blocks;
}
