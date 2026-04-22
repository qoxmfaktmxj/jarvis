/**
 * packages/ai/page-first/synthesize.ts
 *
 * Phase-W2 T2 — page-first navigation step 4/4.
 *
 * LLM answer synthesis from pre-read wiki pages, with `[[page-slug]]`
 * citations. Mirrors the SSE streaming shape of `generateAnswer` in
 * `ask.ts` so a UI consumer doesn't need to branch on the feature flag.
 *
 * Differences vs. legacy `generateAnswer`:
 *   - Sources are `WikiPageSourceRef`, citation string is `[[slug]]`
 *     (not `[source:N]`). The wiki frontend already resolves `[[...]]`
 *     via `packages/wiki-fs/wikilink`.
 *   - Emits a `meta` SSE event with `saveAsPageEligible: boolean` so the
 *     UI can surface the "Save answer as a page" action.
 *   - Uses op `wiki.query.synthesis` for cache keying + budget logging.
 *   - Budget gate + logLlmCall follow the exact same pattern as
 *     `generateAnswer` — no drift from Phase-7A accounting.
 */

import OpenAI from "openai";

import { createChatWithTokenFallback } from "../openai-compat.js";
import { getProvider } from "../provider.js";
import { logLlmCall } from "../logger.js";
import {
  assertBudget,
  BudgetExceededError,
  recordBlocked,
} from "../budget.js";
import type { SSEEvent, WikiPageSourceRef } from "../types.js";

import type { LoadedPage } from "./read-pages.js";

/** Bumped when this prompt template changes (cache invalidation). */
export const PAGE_FIRST_PROMPT_VERSION = "2026-04-v1-pagefirst";

/** Op tag for logging + cache. */
export const PAGE_FIRST_SYNTH_OP = "wiki.query.synthesis" as const;

const SYNTH_MODEL = process.env["ASK_AI_MODEL"] ?? "gpt-5.4-mini";

const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  "gpt-5.4-mini": { in: 0.0005, out: 0.0015 },
  "gpt-5.4": { in: 0.005, out: 0.015 },
};

function computeCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
): string {
  const p = MODEL_PRICING[model] ?? { in: 0, out: 0 };
  return ((tokensIn * p.in + tokensOut * p.out) / 1000).toFixed(6);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const SYSTEM_PROMPT_PAGE_FIRST = `You are Jarvis, an internal wiki assistant.

You will receive a set of wiki pages inside <pages>…</pages>. Each page has a
slug attribute — treat the slug as the citation key.

Rules:
1. Answer ONLY from the provided pages. Do not use outside knowledge.
2. Cite EVERY factual claim with \`[[page-slug]]\` using the slug attribute
   (not the title). Multiple citations per sentence are fine: \`[[a]][[b]]\`.
3. If the pages do not contain the answer, say so explicitly and suggest the
   user create or update a wiki page. Do NOT invent facts to bridge gaps.
4. Reply in the same language as the question (Korean preferred when the
   question is Korean).
5. Keep the answer focused and well-structured. Lead with the direct
   answer, then add supporting detail with citations.`;

/**
 * Build the `<pages>` XML block the LLM will condition on. Keeps each
 * page's content under `maxPerPage` chars to cap prompt size.
 */
function buildPagesContext(pages: LoadedPage[]): string {
  const blocks = pages.map(
    (p) =>
      `  <page slug="${escapeXml(p.slug)}" title="${escapeXml(p.title)}" path="${escapeXml(p.path)}">\n${escapeXml(
        p.content,
      )}\n  </page>`,
  );
  return `<pages>\n${blocks.join("\n")}\n</pages>`;
}

/**
 * Is this answer worth surfacing a "Save as Page" affordance for?
 * Heuristic: we synthesized from ≥2 pages AND produced non-trivial output.
 * The UI decides the final UX; we just expose the signal.
 */
function isSaveAsPageEligible(pages: LoadedPage[], answer: string): boolean {
  return pages.length >= 2 && answer.trim().length >= 80;
}

export interface SynthesizeOptions {
  question: string;
  pages: LoadedPage[];
  workspaceId: string;
  requestId: string | null;
  sensitivityScope?: string;
  /** 메시지별 모델 오버라이드. undefined면 env default(`SYNTH_MODEL`). */
  model?: string;
}

export async function* synthesizePageFirstAnswer(
  opts: SynthesizeOptions,
): AsyncGenerator<SSEEvent> {
  const { question, pages, workspaceId, requestId } = opts;
  const model = opts.model ?? SYNTH_MODEL;
  const startedAt = Date.now();

  // Build the source refs up front so they're emitted even if the LLM fails.
  const sources: WikiPageSourceRef[] = pages.map((p, i) => ({
    kind: "wiki-page",
    pageId: p.id,
    path: p.path,
    slug: p.slug,
    title: p.title,
    sensitivity: p.sensitivity,
    citation: `[[${p.slug}]]`,
    origin: p.origin,
    // Confidence falls off linearly with rank; origin==expand is penalized.
    confidence:
      Math.max(0.1, 1 - i * 0.1) * (p.origin === "shortlist" ? 1 : 0.7),
  }));

  // Budget gate — identical pattern to generateAnswer.
  try {
    await assertBudget(workspaceId);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await recordBlocked(workspaceId, model, requestId, PAGE_FIRST_SYNTH_OP);
      yield { type: "error", message: "daily budget exceeded" };
      return;
    }
    throw err;
  }

  // No pages → emit a fallback message + empty sources. Still log the op so
  // the observability dashboards see page-first traffic.
  if (pages.length === 0) {
    yield {
      type: "text",
      content:
        "해당 질문에 답할 수 있는 위키 페이지를 찾지 못했어요. 관련 페이지를 새로 작성하거나 키워드를 바꿔 다시 시도해 주세요.",
    };
    yield { type: "sources", sources: [] };
    yield { type: "meta", meta: { saveAsPageEligible: false, pageFirst: true } };
    yield { type: "done", totalTokens: 0 };
    await logLlmCall({
      op: PAGE_FIRST_SYNTH_OP,
      workspaceId,
      requestId,
      model,
      promptVersion: PAGE_FIRST_PROMPT_VERSION,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: "0",
      durationMs: Date.now() - startedAt,
      status: "ok",
      blockedBy: null,
      errorCode: null,
      sensitivityScope: opts.sensitivityScope ?? null,
      pagePath: null,
    });
    return;
  }

  const context = buildPagesContext(pages);

  // Phase-W1.5 — gateway-aware client (FEATURE_SUBSCRIPTION_QUERY).
  const openai = getProvider("query").client;

  let tokensIn = 0;
  let tokensOut = 0;
  let answerAccum = "";

  try {
    const stream = await createChatWithTokenFallback<
      AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
      Record<string, unknown>
    >(
      openai,
      model,
      {
        stream: true,
        stream_options: { include_usage: true },
        messages: [
          { role: "system", content: SYSTEM_PROMPT_PAGE_FIRST },
          { role: "user", content: `${context}\n\nQuestion: ${question}` },
        ],
      },
      1024,
    );

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        answerAccum += content;
        yield { type: "text", content };
      }
      if (chunk.usage) {
        tokensIn = chunk.usage.prompt_tokens ?? 0;
        tokensOut = chunk.usage.completion_tokens ?? 0;
      }
    }

    yield { type: "sources", sources };
    yield {
      type: "meta",
      meta: {
        pageFirst: true,
        saveAsPageEligible: isSaveAsPageEligible(pages, answerAccum),
        pageCount: pages.length,
      },
    };
    yield { type: "done", totalTokens: tokensIn + tokensOut };

    await logLlmCall({
      op: PAGE_FIRST_SYNTH_OP,
      workspaceId,
      requestId,
      model,
      promptVersion: PAGE_FIRST_PROMPT_VERSION,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      costUsd: computeCostUsd(model, tokensIn, tokensOut),
      durationMs: Date.now() - startedAt,
      status: "ok",
      blockedBy: null,
      errorCode: null,
      sensitivityScope: opts.sensitivityScope ?? null,
      pagePath: pages[0]?.path ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logLlmCall({
      op: PAGE_FIRST_SYNTH_OP,
      workspaceId,
      requestId,
      model,
      promptVersion: PAGE_FIRST_PROMPT_VERSION,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      costUsd: computeCostUsd(model, tokensIn, tokensOut),
      durationMs: Date.now() - startedAt,
      status: "error",
      blockedBy: null,
      errorCode: message,
      sensitivityScope: opts.sensitivityScope ?? null,
      pagePath: pages[0]?.path ?? null,
    });
    yield { type: "error", message };
    // Even on mid-stream failure, emit sources + done so the UI can stop its
    // spinner and render whatever partial text was already yielded. Mirrors
    // the legacy generateAnswer terminal-event pattern.
    yield { type: "sources", sources };
    yield {
      type: "meta",
      meta: {
        pageFirst: true,
        saveAsPageEligible: isSaveAsPageEligible(pages, answerAccum),
        pageCount: pages.length,
      },
    };
    yield { type: "done", totalTokens: tokensIn + tokensOut };
  }
}
