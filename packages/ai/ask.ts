// packages/ai/ask.ts  (retrieval section — Task 4 adds generation)
import { buildKnowledgeSensitivitySqlFilter } from '@jarvis/auth/rbac';
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';
import { generateEmbedding } from './embed.js';
import type { RetrievedClaim } from './types.js';

const TOP_K_VECTOR = 10;
const TOP_K_FINAL = 5;
const VECTOR_WEIGHT = 0.7;
const FTS_WEIGHT = 0.3;

export async function retrieveRelevantClaims(
  question: string,
  workspaceId: string,
  userPermissions: string[],
): Promise<RetrievedClaim[]> {
  // 1. Embed query
  const embedding = await generateEmbedding(question);
  const embeddingLiteral = `[${embedding.join(',')}]`;

  // 2. Sensitivity filter: SECRET_REF_ONLY excluded unless ADMIN or DEVELOPER
  // Roles are stored uppercase in session (e.g. 'ADMIN', 'DEVELOPER') — must match exactly
  const sensitivityFilter = buildKnowledgeSensitivitySqlFilter(userPermissions)
    .replace(/\bsensitivity\b/g, 'kp.sensitivity')
    .trim();
  const sensitivityClause = sensitivityFilter
    ? sql.raw(` ${sensitivityFilter}`)
    : sql.empty();

  // 3. Vector similarity search (top 10)
  const vectorRows = await db.execute<{
    id: string;
    claim_text: string;
    page_id: string;
    title: string;
    distance: number;
  }>(
    sql`
      SELECT
        kc.id,
        kc.claim_text,
        kc.page_id,
        kp.title,
        (kc.embedding <=> ${embeddingLiteral}::vector) AS distance
      FROM knowledge_claim kc
      JOIN knowledge_page kp ON kp.id = kc.page_id
      WHERE kp.workspace_id = ${workspaceId}::uuid
        AND kp.publish_status = 'published'
        ${sensitivityClause}
        AND kc.embedding IS NOT NULL
      ORDER BY kc.embedding <=> ${embeddingLiteral}::vector
      LIMIT ${TOP_K_VECTOR}
    `,
  );

  if (vectorRows.rows.length === 0) return [];

  // 4. FTS rerank: compute ts_rank for each retrieved claim's page
  const pageIds = vectorRows.rows.map((r) => r.page_id);
  const ftsRows = await db.execute<{ page_id: string; fts_rank: number }>(
    sql`
      SELECT
        kp.id AS page_id,
        ts_rank_cd(kp.search_vector, websearch_to_tsquery('simple', ${question})) AS fts_rank
      FROM knowledge_page kp
      WHERE kp.id = ANY(${pageIds}::uuid[])
    `,
  );

  const ftsRankMap = new Map<string, number>(
    ftsRows.rows.map((r) => [r.page_id, Number(r.fts_rank)]),
  );

  // 5. Compute hybrid score and sort
  const claims: RetrievedClaim[] = vectorRows.rows.map((row) => {
    const vectorSim = 1 - Number(row.distance); // cosine: distance 0 = perfect match
    const ftsRank = ftsRankMap.get(row.page_id) ?? 0;
    const hybridScore = vectorSim * VECTOR_WEIGHT + ftsRank * FTS_WEIGHT;
    return {
      id: row.id,
      pageId: row.page_id,
      pageTitle: row.title,
      pageUrl: `/knowledge/${row.page_id}`,
      claimText: row.claim_text,
      vectorSim,
      ftsRank,
      hybridScore,
    };
  });

  claims.sort((a, b) => b.hybridScore - a.hybridScore);
  return claims.slice(0, TOP_K_FINAL);
}

import Anthropic from '@anthropic-ai/sdk';
import type { SSEEvent, SourceRef } from './types.js';
import {
  retrieveRelevantGraphContext,
  formatGraphContextXml,
  type GraphContext,
} from './graph-context.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CLAUDE_MODEL = 'claude-sonnet-4-5';

export function assembleContext(claims: RetrievedClaim[]): string {
  const sources = claims
    .map(
      (c, i) =>
        `  <source id="${i + 1}" title="${escapeXml(c.pageTitle)}" url="${c.pageUrl}">${escapeXml(c.claimText)}</source>`,
    )
    .join('\n');
  return `<context>\n${sources}\n</context>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const SYSTEM_PROMPT = `You are Jarvis, an internal knowledge assistant for an enterprise portal.
Answer ONLY based on the provided context sources and graph context. Do not use outside knowledge.
For each factual claim in your answer, cite the source using [source:N] notation where N is the source id.
If multiple sources support a claim, cite all relevant ones: [source:1][source:2].
If the context doesn't contain enough information to answer the question, say so explicitly and suggest the user search the knowledge base or contact the relevant team.
Keep answers concise and professional. Use the same language as the user's question.
For structure-based answers (architecture, dependencies, connections), reference the graph context.
When a question asks about relationships, dependencies, or "how does X connect to Y", prefer the graph context over text sources.`;

export async function* generateAnswer(
  question: string,
  context: string,
  claims: RetrievedClaim[],
): AsyncGenerator<SSEEvent> {
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const stream = anthropic.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `${context}\n\nQuestion: ${question}`,
        },
      ],
    });

    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        fullText += chunk.delta.text;
        yield { type: 'text', content: chunk.delta.text };
      }

      if (chunk.type === 'message_delta' && chunk.usage) {
        outputTokens = chunk.usage.output_tokens;
      }

      if (chunk.type === 'message_start' && chunk.message.usage) {
        inputTokens = chunk.message.usage.input_tokens;
      }
    }

    // Parse [source:N] citations from full text and map to SourceRef[]
    const citationPattern = /\[source:(\d+)\]/g;
    const citedIndexes = new Set<number>();
    let match: RegExpExecArray | null;
    while ((match = citationPattern.exec(fullText)) !== null) {
      const raw = match[1];
      if (!raw) continue;
      const idx = parseInt(raw, 10) - 1; // 1-based → 0-based
      if (idx >= 0 && idx < claims.length) {
        citedIndexes.add(idx);
      }
    }

    const sources: SourceRef[] = Array.from(citedIndexes).flatMap((idx) => {
      const claim = claims[idx];
      if (!claim) return [];
      return [{
        kind: 'text',
        pageId: claim.pageId,
        title: claim.pageTitle,
        url: claim.pageUrl,
        excerpt: claim.claimText.slice(0, 200),
        confidence: claim.hybridScore,
      }];
    });

    yield { type: 'sources', sources };
    yield { type: 'done', totalTokens: inputTokens + outputTokens };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    yield { type: 'error', message };
  }
}

// Full pipeline: question → SSEEvent stream
export async function* askAI(
  query: import('./types.js').AskQuery,
): AsyncGenerator<SSEEvent> {
  const { question, workspaceId, userPermissions } = query;

  // Parallel retrieval: text claims + graph context
  let claims: RetrievedClaim[];
  let graphCtx: GraphContext | null;

  try {
    [claims, graphCtx] = await Promise.all([
      retrieveRelevantClaims(question, workspaceId, userPermissions),
      retrieveRelevantGraphContext(question, workspaceId).catch((err) => {
        console.error('[ask] Graph context retrieval failed (degraded gracefully):', err instanceof Error ? err.message : err);
        return null;
      }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Retrieval failed';
    yield { type: 'error', message };
    return;
  }

  if (claims.length === 0 && !graphCtx) {
    yield {
      type: 'text',
      content:
        '죄송합니다. 관련 정보를 찾을 수 없습니다. 지식 베이스를 검색하거나 담당 팀에 문의해 주세요.',
    };
    yield { type: 'sources', sources: [] };
    yield { type: 'done', totalTokens: 0 };
    return;
  }

  // Assemble combined context: text sources + graph structure
  let context = assembleContext(claims);
  if (graphCtx && graphCtx.matchedNodes.length > 0) {
    context += '\n\n' + formatGraphContextXml(graphCtx);
  }

  yield* generateAnswer(question, context, claims);
}
