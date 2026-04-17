/**
 * packages/ai/page-first/read-pages.ts
 *
 * Phase-W2 T2 — page-first navigation step 3/4.
 *
 * Given an ordered list of candidate pages (shortlist ∪ expand), read the
 * top-N raw markdown bodies from disk via `@jarvis/wiki-fs` and produce a
 * structure ready for LLM synthesis. Token budget is the gating factor —
 * spec says top 5~8 pages; we take 7 as the default middle ground with
 * a per-page char cap to keep the prompt under ~16k tokens worst-case.
 *
 * Disk-read failures degrade gracefully: a page whose file is missing
 * (index drift between `wiki_page_index` and the working tree) is skipped
 * with a console.warn, not thrown. The caller gets whatever succeeded.
 */

import { readPage } from "@jarvis/wiki-fs";

import type { ExpandedPage } from "./expand.js";

export interface LoadedPage {
  id: string;
  path: string;
  title: string;
  slug: string;
  sensitivity: string;
  origin: "shortlist" | "expand";
  content: string; // raw markdown (frontmatter + body)
}

export interface ReadPagesOptions {
  workspaceId: string;
  candidates: ExpandedPage[];
  /** Default 7 (spec: 5~8). */
  topN?: number;
  /** Per-page char cap before truncation. Default 4000 (~1k tokens). */
  maxCharsPerPage?: number;
}

const DEFAULT_TOP_N = 7;
const DEFAULT_MAX_CHARS = 4000;

export type ReadPagesResult =
  | { ok: true; pages: LoadedPage[] }
  | { ok: false; reason: "high_drift"; missCount: number; totalPicked: number };

export async function readTopPages(
  opts: ReadPagesOptions,
): Promise<ReadPagesResult> {
  const { workspaceId, candidates } = opts;
  const topN = opts.topN ?? DEFAULT_TOP_N;
  const maxChars = opts.maxCharsPerPage ?? DEFAULT_MAX_CHARS;

  const picked = candidates.slice(0, topN);
  const totalPicked = picked.length;
  const loaded: LoadedPage[] = [];

  // Parallelized reads — wiki pages are <10KB each so `Promise.all` stays
  // well under any fd cap. We catch per-file so one missing page doesn't
  // kill the whole retrieval.
  const results = await Promise.all(
    picked.map(async (page) => {
      try {
        const raw = await readPage(workspaceId, page.path);
        const trimmed =
          raw.length > maxChars ? raw.slice(0, maxChars) + "\n…[truncated]" : raw;
        return { page, content: trimmed, ok: true as const };
      } catch (err) {
        console.warn(
          `[page-first] readPage failed for ${page.path}:`,
          err instanceof Error ? err.message : err,
        );
        return { page, content: "", ok: false as const };
      }
    }),
  );

  let missCount = 0;
  for (const r of results) {
    if (!r.ok) {
      missCount++;
      continue;
    }
    loaded.push({
      id: r.page.id,
      path: r.page.path,
      title: r.page.title,
      slug: r.page.slug,
      sensitivity: r.page.sensitivity,
      origin: r.page.origin,
      content: r.content,
    });
  }

  // Drift detection — high miss ratio indicates wiki_page_index is out of
  // sync with the working tree (files deleted/moved but index not updated).
  if (totalPicked > 0 && missCount / totalPicked > 0.8) {
    console.warn(
      "[page-first] read.degraded — miss ratio above 80%, aborting synthesis",
      { missCount, totalPicked, missRatio: missCount / totalPicked },
    );
    return { ok: false, reason: "high_drift", missCount, totalPicked };
  }

  if (totalPicked > 0 && missCount / totalPicked > 0.5) {
    console.warn(
      "[page-first] read.degraded — elevated miss ratio",
      { missCount, totalPicked, missRatio: missCount / totalPicked },
    );
  }

  return { ok: true, pages: loaded };
}
