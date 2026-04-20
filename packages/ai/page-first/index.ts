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
 * Pipeline (FEATURE_LLM_SHORTLIST=true):
 *   1. inferDomain → getCatalog (RBAC filtered)
 *   2. selectPages  (LLM shortlist; fallback to legacyLexicalShortlist)
 *   3. disk read of top 5~8 pages  (skip expandOneHop — LLM already selected)
 *   4. LLM synthesis with [[slug]] citations
 *
 * Pipeline (FEATURE_LLM_SHORTLIST=false — legacy):
 *   1. legacyLexicalShortlist  (wiki_page_index lexical scoring)
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

import { legacyLexicalShortlist } from "./shortlist.js";
import { getCatalog } from "./catalog.js";
import { inferDomain } from "./domain-infer.js";
import { selectPages } from "./llm-shortlist.js";
import { expandOneHop } from "./expand.js";
import { readTopPages } from "./read-pages.js";
import { detectInfraIntent } from "./infra-routing.js";
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

  // 3. Feature flag: LLM-first shortlist (Phase-γ) vs legacy lexical shortlist.
  const useLlmShortlist = process.env["FEATURE_LLM_SHORTLIST"] === "true";

  let shortlistVia: "llm" | "legacy" = "legacy";
  let candidates: import("./expand.js").ExpandedPage[];

  if (useLlmShortlist) {
    // ── LLM-first path ─────────────────────────────────────────────────────
    const domain = inferDomain(question);
    const catalog = await getCatalog({
      workspaceId,
      userPermissions,
      domain: domain ?? undefined,
      limit: 500,
    });

    if (catalog.length === 0) {
      yield { type: "error", message: "해당 워크스페이스에 접근 가능한 페이지가 없습니다." };
      yield { type: "done", totalTokens: 0 };
      return;
    }

    const result = await selectPages({ question, catalog });

    if (result.fallback) {
      // Graceful degradation to legacy lexical shortlist.
      const legacy = await legacyLexicalShortlist({
        workspaceId,
        userPermissions,
        question,
        topK: 8,
      });
      candidates = legacy.map((h) => ({
        id: h.id,
        slug: h.slug,
        path: h.path,
        title: h.title,
        sensitivity: h.sensitivity,
        requiredPermission: h.requiredPermission,
        origin: "shortlist" as const,
        inboundCount: 0,
        score: h.score,
      }));
      shortlistVia = "legacy";
    } else {
      // Map LLM-selected slugs back to catalog rows.
      // catalog doesn't have id; read-pages reads by path so id="" is fine.
      const pagesMap = new Map(catalog.map((r) => [r.slug, r]));
      const chosen = result.pages
        .map((slug) => pagesMap.get(slug))
        .filter((x): x is NonNullable<typeof x> => x != null);

      candidates = chosen.map((r) => ({
        id: "",
        slug: r.slug,
        path: r.path,
        title: r.title,
        // catalog doesn't expose sensitivity; RBAC filter already ran in getCatalog.
        sensitivity: "INTERNAL",
        requiredPermission: null,
        origin: "shortlist" as const,
        inboundCount: 0,
        score: 1,
      }));
      shortlistVia = "llm";
    }
    // LLM already selected the right pages — skip expandOneHop.
  } else {
    // ── Legacy path ────────────────────────────────────────────────────────
    const inferredDomain = detectInfraIntent(question) ? "infra" : undefined;
    let shortlist;
    try {
      shortlist = await legacyLexicalShortlist({
        workspaceId,
        userPermissions,
        question,
        topK: 20,
        domain: inferredDomain,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "shortlist failed";
      yield { type: "error", message };
      yield { type: "done", totalTokens: 0 };
      return;
    }

    // 1-hop expansion (best-effort — a link table outage should not kill
    // the whole query; we just lose the hub-page hint).
    candidates = shortlist.map((s) => ({
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
    shortlistVia = "legacy";
  }

  // 4. Emit a synthetic "route" event so the UI knows which lane won.
  //    shortlistVia is included for observability (dashboard / logs).
  const routeEvt: SSEEvent = {
    type: "route",
    lane: "wiki.page-first",
    confidence: 1,
    shortlistVia,
  };
  collected.push(routeEvt);
  yield routeEvt;

  // 5. Read top pages from disk
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

  // 6. Synthesize answer + stream events; collect for cache persistence.
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

  // 7. Cache only successful streams.
  const hasError = collected.some((e) => e.type === "error");
  if (!hasError) {
    await setCached(cacheKey, JSON.stringify(collected));
  }
}

export { PAGE_FIRST_PROMPT_VERSION, PAGE_FIRST_SYNTH_OP } from "./synthesize.js";
