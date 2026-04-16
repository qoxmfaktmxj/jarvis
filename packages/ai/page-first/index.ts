/**
 * packages/ai/page-first/index.ts
 *
 * Phase-W2 T2 — page-first navigation orchestrator.
 *
 * Public entry: `pageFirstAsk(query)` — a drop-in async generator that
 * `ask.ts` dispatches to when FEATURE_PAGE_FIRST_QUERY=true. The legacy
 * vector/claims/chunks pipeline stays untouched in ask.ts; this module
 * only has to emit the same SSE shape.
 *
 * Pipeline:
 *   1. lexical shortlist  (wiki_page_index)
 *   2. 1-hop wikilink expansion  (wiki_page_link, inbound-heavy hubs first)
 *   3. disk read of top 5~8 pages
 *   4. LLM synthesis with [[slug]] citations
 *
 * Budget gate + cache-through wrap everything (same shape as `askAI`).
 */

import type { AskQuery, SSEEvent } from "../types.js";
import {
  assertBudget,
  BudgetExceededError,
  recordBlocked,
} from "../budget.js";
import { makeCacheKey, getCached, setCached } from "../cache.js";

import { lexicalShortlist } from "./shortlist.js";
import { expandOneHop } from "./expand.js";
import { readTopPages } from "./read-pages.js";
import {
  synthesizePageFirstAnswer,
  PAGE_FIRST_PROMPT_VERSION,
  PAGE_FIRST_SYNTH_OP,
} from "./synthesize.js";

const PAGE_FIRST_MODEL = process.env["ASK_AI_MODEL"] ?? "gpt-5.4-mini";

export async function* pageFirstAsk(
  query: AskQuery,
): AsyncGenerator<SSEEvent> {
  const { question, workspaceId, userPermissions, requestId } = query;

  const sensitivityScope =
    query.sensitivityScope ??
    `workspace:${workspaceId}|level:internal|graph:0`;

  // 1. Budget gate BEFORE anything (incl. cache hit) — same policy as askAI.
  try {
    await assertBudget(workspaceId);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await recordBlocked(
        workspaceId,
        PAGE_FIRST_MODEL,
        requestId ?? null,
        PAGE_FIRST_SYNTH_OP,
      );
      yield { type: "error", message: "daily budget exceeded" };
      yield { type: "done", totalTokens: 0 };
      return;
    }
    throw err;
  }

  // 2. Cache key — include op so we never collide with legacy askAI.
  //    permissionFingerprint ensures users with different ACLs never share
  //    a cached response (P0 fix: cache key ACL isolation).
  const permFingerprint = [...(userPermissions ?? [])].sort().join(",");
  const cacheKey = makeCacheKey({
    promptVersion: PAGE_FIRST_PROMPT_VERSION,
    workspaceId,
    sensitivityScope,
    permissionFingerprint: permFingerprint,
    input: question,
    model: PAGE_FIRST_MODEL,
    op: PAGE_FIRST_SYNTH_OP,
  });

  const hit = await getCached(cacheKey);
  if (hit) {
    const cached = JSON.parse(hit) as SSEEvent[];
    for (const evt of cached) yield evt;
    return;
  }

  const collected: SSEEvent[] = [];

  // 3. Emit a synthetic "route" event so the UI knows which lane won.
  //    lane name is stable for dashboards; confidence is always 1.0 when
  //    the feature flag explicitly forces this path.
  const routeEvt: SSEEvent = {
    type: "route",
    lane: "wiki.page-first",
    confidence: 1,
  };
  collected.push(routeEvt);
  yield routeEvt;

  // 4. Shortlist
  let shortlist;
  try {
    shortlist = await lexicalShortlist({
      workspaceId,
      userPermissions,
      question,
      topK: 20,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "shortlist failed";
    yield { type: "error", message };
    yield { type: "done", totalTokens: 0 };
    return;
  }

  // 5. 1-hop expansion (best-effort — a link table outage should not kill
  //    the whole query; we just lose the hub-page hint).
  //    Fallback shape is identical to `ExpandedPage` so the types unify.
  let candidates: import("./expand.js").ExpandedPage[] = shortlist.map((s) => ({
    id: s.id,
    path: s.path,
    title: s.title,
    slug: s.slug,
    sensitivity: s.sensitivity,
    requiredPermission: s.requiredPermission,
    origin: "shortlist" as const,
    inboundCount: 0,
    score: s.score,
  }));
  try {
    candidates = await expandOneHop({
      workspaceId,
      userPermissions,
      shortlist,
      fanOut: 30,
    });
  } catch (err) {
    console.warn(
      "[page-first] expandOneHop failed (degrading to shortlist only):",
      err instanceof Error ? err.message : err,
    );
  }

  // 6. Read top pages from disk
  const readResult = await readTopPages({
    workspaceId,
    candidates,
    topN: 7,
  });

  if (!readResult.ok) {
    // High drift — too many pages missing from disk vs index.
    yield { type: "error", message: "wiki index drift: most pages could not be read from disk" };
    yield { type: "done", totalTokens: 0 };
    return;
  }

  const pages = readResult.pages;

  // 7. Synthesize answer + stream events; collect for cache persistence.
  for await (const evt of synthesizePageFirstAnswer({
    question,
    pages,
    workspaceId,
    requestId: requestId ?? null,
    sensitivityScope,
  })) {
    collected.push(evt);
    yield evt;
  }

  // 8. Cache only successful streams.
  const hasError = collected.some((e) => e.type === "error");
  if (!hasError) {
    await setCached(cacheKey, JSON.stringify(collected));
  }
}

export { PAGE_FIRST_PROMPT_VERSION, PAGE_FIRST_SYNTH_OP } from "./synthesize.js";
