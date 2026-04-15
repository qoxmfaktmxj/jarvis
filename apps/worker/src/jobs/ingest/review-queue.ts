/**
 * Step D — Route post-commit signals into wiki_review_queue.
 *
 * Inputs come from Step A (analysis.contradictions), Step B (review blocks),
 * and Step C (commit metadata + sensitivity transitions). All inserts target
 * `wiki_review_queue` with a structured `kind` so the admin UI can filter.
 *
 * Side effect: pages flagged as `contradiction` / `sensitivity_promotion` /
 * `pii` are kept as `draft` in `wiki_page_index` (Step C already inserted
 * them with publishedStatus='draft'). We do NOT auto-publish on review path.
 */

import { db } from "@jarvis/db/client";
import { wikiReviewQueue } from "@jarvis/db/schema/wiki-review-queue";
import type { AnalysisResult, ReviewBlock } from "@jarvis/wiki-agent";
import type { WikiSensitivity } from "@jarvis/wiki-fs";

export interface ReviewQueueInput {
  workspaceId: string;
  rawSourceId: string;
  commitSha?: string;
  /** From Step A. */
  analysis: AnalysisResult;
  /** From Step B. */
  reviewBlocks: ReviewBlock[];
  /** Pages that landed in the commit (workspace-relative wiki paths). */
  affectedPagePaths: string[];
  /** Sensitivity comparison for promotion detection. */
  previousSensitivity: WikiSensitivity;
  newSensitivity: WikiSensitivity;
  /** PII keywords detected during Step 0 (already PII-redacted). */
  piiHits: string[];
}

export interface ReviewQueueResult {
  inserted: number;
  /** Per-kind counts for observability. */
  byKind: Record<string, number>;
}

const SENSITIVITY_ORDER: Record<WikiSensitivity, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  RESTRICTED: 2,
  SECRET_REF_ONLY: 3,
};

function bumpCount(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

export async function recordReviewQueue(
  input: ReviewQueueInput,
): Promise<ReviewQueueResult> {
  const byKind: Record<string, number> = {};
  let inserted = 0;

  // 1. Contradictions from Step A.
  for (const c of input.analysis.contradictions ?? []) {
    if (!c || (!c.pageA && !c.pageB)) continue;
    const affectedPages = [c.pageA, c.pageB].filter((p) => typeof p === "string" && p !== "__new__");
    await db.insert(wikiReviewQueue).values({
      workspaceId: input.workspaceId,
      kind: "contradiction",
      affectedPages,
      commitSha: input.commitSha ?? null,
      description: c.description ?? "Step-A flagged contradiction",
      payload: { pageA: c.pageA, pageB: c.pageB, source: "analysis" },
      status: "pending",
    });
    inserted++;
    bumpCount(byKind, "contradiction");
  }

  // 2. Step B REVIEW blocks routed by type.
  for (const rb of input.reviewBlocks) {
    const kind = mapReviewBlockKind(rb.type);
    await db.insert(wikiReviewQueue).values({
      workspaceId: input.workspaceId,
      kind,
      affectedPages: rb.pages ?? [],
      commitSha: input.commitSha ?? null,
      description: `${rb.title} — ${rb.body.slice(0, 400)}`,
      payload: {
        type: rb.type,
        title: rb.title,
        options: rb.options ?? [],
        search: rb.search ?? [],
      },
      status: "pending",
    });
    inserted++;
    bumpCount(byKind, kind);
  }

  // 3. Sensitivity promotion (input-level, not per-page).
  const prev = SENSITIVITY_ORDER[input.previousSensitivity];
  const next = SENSITIVITY_ORDER[input.newSensitivity];
  if (next > prev) {
    await db.insert(wikiReviewQueue).values({
      workspaceId: input.workspaceId,
      kind: "sensitivity_promotion",
      affectedPages: input.affectedPagePaths,
      commitSha: input.commitSha ?? null,
      description: `sensitivity promoted ${input.previousSensitivity} → ${input.newSensitivity} during ingest`,
      payload: {
        from: input.previousSensitivity,
        to: input.newSensitivity,
        rawSourceId: input.rawSourceId,
      },
      status: "pending",
    });
    inserted++;
    bumpCount(byKind, "sensitivity_promotion");
  }

  // 4. PII (separate signal — Step 0 detected redactable patterns).
  if (input.piiHits.length > 0) {
    await db.insert(wikiReviewQueue).values({
      workspaceId: input.workspaceId,
      // wiki_review_queue has no 'pii' kind in the schema enum doc; use the
      // closest semantic equivalent ("sensitivity_promotion") with a payload
      // marker so the admin UI can render PII details inline.
      kind: "sensitivity_promotion",
      affectedPages: input.affectedPagePaths,
      commitSha: input.commitSha ?? null,
      description: `PII detected — ${input.piiHits.length} matches; review redaction quality`,
      payload: {
        signal: "pii",
        hits: input.piiHits.slice(0, 50),
        rawSourceId: input.rawSourceId,
      },
      status: "pending",
    });
    inserted++;
    bumpCount(byKind, "sensitivity_promotion");
  }

  return { inserted, byKind };
}

/**
 * Map Step B REVIEW block type → canonical wiki_review_queue kind.
 * Unknown types fall back to `lint` (broadest catch-all in the enum).
 */
function mapReviewBlockKind(reviewType: string): string {
  switch (reviewType) {
    case "contradiction":
      return "contradiction";
    case "duplicate":
      return "lint";
    case "missing-page":
      return "lint";
    case "suggestion":
      return "lint";
    case "sensitivity":
      return "sensitivity_promotion";
    default:
      return "lint";
  }
}
