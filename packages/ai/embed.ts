// packages/ai/embed.ts
import OpenAI from "openai";
import { createHash } from "crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { embedCache } from "@jarvis/db/schema/embed-cache";
import { logLlmCall } from "./logger.js";
import { assertBudget, BudgetExceededError, recordBlocked } from "./budget.js";

const EMBED_OP = "embed" as const;

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMENSIONS = 1536;
const CACHE_TTL_SECONDS = 86400;
const EMBED_PRICE_PER_1K_IN = 0.00002;

function embedCacheHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function computeCostUsd(tokensIn: number): string {
  return ((tokensIn * EMBED_PRICE_PER_1K_IN) / 1000).toFixed(6);
}

export interface EmbedMeta {
  workspaceId: string;
  requestId?: string | null;
}

const DEFAULT_META: Required<EmbedMeta> = {
  workspaceId: "00000000-0000-0000-0000-000000000000",
  requestId: null,
};

export async function generateEmbedding(
  text: string,
  meta: EmbedMeta = DEFAULT_META,
): Promise<number[]> {
  const hash = embedCacheHash(text);

  // 1. 캐시 조회 (실패해도 OpenAI fallback)
  try {
    const rows = await db
      .select({ embedding: embedCache.embedding })
      .from(embedCache)
      .where(and(eq(embedCache.hash, hash), gt(embedCache.expiresAt, new Date())))
      .limit(1);
    if (rows[0]) return rows[0].embedding;
  } catch (err) {
    console.warn("[embed] cache read failed, falling back to OpenAI", err);
  }

  const startedAt = Date.now();
  const workspaceId = meta.workspaceId;
  const requestId = meta.requestId ?? null;

  try {
    await assertBudget(workspaceId);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await recordBlocked(workspaceId, EMBED_MODEL, requestId, EMBED_OP);
    }
    throw err;
  }

  try {
    const response = await getOpenAI().embeddings.create({
      model: EMBED_MODEL,
      input: text.trim(),
      dimensions: EMBED_DIMENSIONS,
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) throw new Error("No embedding returned from OpenAI");

    const tokensIn = response.usage?.prompt_tokens ?? 0;
    await logLlmCall({
      op: EMBED_OP,
      workspaceId,
      requestId,
      model: EMBED_MODEL,
      promptVersion: null,
      inputTokens: tokensIn,
      outputTokens: 0,
      costUsd: computeCostUsd(tokensIn),
      durationMs: Date.now() - startedAt,
      status: "ok",
      blockedBy: null,
      errorCode: null,
    });

    // 2. 캐시 저장 (upsert; 실패는 조용히 무시)
    const expiresAt = new Date(Date.now() + CACHE_TTL_SECONDS * 1000);
    try {
      await db
        .insert(embedCache)
        .values({ hash, embedding, expiresAt })
        .onConflictDoUpdate({
          target: embedCache.hash,
          set: { embedding, expiresAt },
        });
    } catch (err) {
      console.warn("[embed] cache write failed", err);
    }

    return embedding;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logLlmCall({
      op: EMBED_OP,
      workspaceId,
      requestId,
      model: EMBED_MODEL,
      promptVersion: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: "0",
      durationMs: Date.now() - startedAt,
      status: "error",
      blockedBy: null,
      errorCode: message,
    });
    throw err;
  }
}
