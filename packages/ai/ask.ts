// packages/ai/ask.ts  (retrieval + generation)
import Anthropic from '@anthropic-ai/sdk';
import { buildKnowledgeSensitivitySqlFilter } from '@jarvis/auth/rbac';
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';
import { generateEmbedding } from './embed.js';
import {
  retrieveRelevantGraphContext,
  type GraphContext,
} from './graph-context.js';
import type {
  SSEEvent,
  SourceRef,
  TextSourceRef,
  GraphSourceRef,
  RetrievedClaim,
} from './types.js';

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

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CLAUDE_MODEL = 'claude-sonnet-4-5';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/**
 * Convert a GraphContext into an array of GraphSourceRef objects.
 * Limits to top 5 unique matched nodes + top 2 paths so the unified
 * sources array stays bounded (matches Task 5 spec).
 */
export function toGraphSourceRefs(ctx: GraphContext): GraphSourceRef[] {
  const title = truncate(ctx.snapshotTitle, 60);
  const seen = new Set<string>();
  const nodeSources: GraphSourceRef[] = ctx.matchedNodes
    .filter((n) => {
      if (seen.has(n.nodeId)) return false;
      seen.add(n.nodeId);
      return true;
    })
    .slice(0, 5)
    .map((n) => ({
      kind: 'graph' as const,
      snapshotId: ctx.snapshotId,
      snapshotTitle: title,
      nodeId: n.nodeId,
      nodeLabel: n.label,
      sourceFile: n.sourceFile,
      communityLabel: n.communityLabel,
      url: `/architecture?snapshot=${ctx.snapshotId}&node=${encodeURIComponent(n.nodeId)}`,
      confidence: 0.7,
    }));

  const pathSources: GraphSourceRef[] = ctx.paths.slice(0, 2).map((p) => ({
    kind: 'graph' as const,
    snapshotId: ctx.snapshotId,
    snapshotTitle: title,
    nodeId: `${p.from}->${p.to}`,
    nodeLabel: `${p.from} → ${p.to}`,
    sourceFile: null as string | null,
    communityLabel: null as string | null,
    relationPath: p.hops,
    url: `/architecture?snapshot=${ctx.snapshotId}`,
    confidence: 0.7,
  }));

  return [...nodeSources, ...pathSources];
}

export function assembleContext(
  claims: RetrievedClaim[],
  graphSources: GraphSourceRef[],
  graphCtx: GraphContext | null,
): string {
  const textEntries = claims.map(
    (c, i) =>
      `  <source idx="${i + 1}" kind="text" title="${escapeXml(c.pageTitle)}" url="${c.pageUrl}">${escapeXml(c.claimText)}</source>`,
  );

  const textCount = claims.length;
  const graphEntries = graphSources.map((g, i) => {
    const idx = textCount + i + 1;
    const conns =
      graphCtx?.matchedNodes.find((n) => n.nodeId === g.nodeId)?.connections ?? [];
    const connSummary = conns
      .slice(0, 5)
      .map((c) => `${c.relation} → ${escapeXml(c.targetLabel)}`)
      .join(', ');
    const pathLine = g.relationPath
      ? `Path: ${g.relationPath.map(escapeXml).join(' → ')}`
      : '';
    const communityLine = g.communityLabel
      ? `Community: ${escapeXml(g.communityLabel)}`
      : '';
    const fileLine = g.sourceFile ? `File: ${escapeXml(g.sourceFile)}` : '';
    const inner = [
      pathLine,
      communityLine,
      fileLine,
      connSummary ? `Connections: ${connSummary}` : '',
    ]
      .filter(Boolean)
      .join(' | ');
    return `  <source idx="${idx}" kind="graph" node="${escapeXml(g.nodeLabel)}">${inner}</source>`;
  });

  return `<context>\n${[...textEntries, ...graphEntries].join('\n')}\n</context>`;
}

const SYSTEM_PROMPT = `You are Jarvis, an internal knowledge assistant for an enterprise portal.
Answer ONLY based on the provided <context>. Do not use outside knowledge.

Sources inside <context> come in two kinds:
  - kind="text"  → excerpts from knowledge pages
  - kind="graph" → structural facts from the code/architecture graph (nodes, files, relations, paths)

For each factual claim, cite the source using [source:N] notation where N is the source idx.
If multiple sources support a claim, cite all: [source:1][source:3].
Use graph sources for structural questions ("how is X connected to Y", "what depends on X", "architecture of X").
Use text sources for definitions, policies, how-tos, and descriptive answers.
If <context> doesn't answer the question, say so explicitly and suggest the user search the knowledge base or contact the relevant team.
Keep answers concise and professional. Use the same language as the user's question.`;

export async function* generateAnswer(
  question: string,
  context: string,
  claims: RetrievedClaim[],
  graphSources: GraphSourceRef[],
): AsyncGenerator<SSEEvent> {
  let inputTokens = 0;
  let outputTokens = 0;

  // Prebuild the unified sources array — text first, then graph.
  // Prompt index and UI index share the same order, so [source:N] from the
  // model can cite either kind through a single shared index space.
  const allTextSources: TextSourceRef[] = claims.map((c) => ({
    kind: 'text',
    pageId: c.pageId,
    title: c.pageTitle,
    url: c.pageUrl,
    excerpt: c.claimText.slice(0, 200),
    confidence: c.hybridScore,
  }));
  const allSources: SourceRef[] = [...allTextSources, ...graphSources];

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
        yield { type: 'text', content: chunk.delta.text };
      }

      if (chunk.type === 'message_delta' && chunk.usage) {
        outputTokens = chunk.usage.output_tokens;
      }

      if (chunk.type === 'message_start' && chunk.message.usage) {
        inputTokens = chunk.message.usage.input_tokens;
      }
    }

    // Emit all sources in unified order (text first, then graph).
    // The LLM's [source:N] citations use 1-based indexes into this same array,
    // so we must preserve original positions — compacting to cited-only would
    // break ClaimBadge lookups (e.g. [source:6] → sources[5] undefined).
    yield { type: 'sources', sources: allSources };
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
  const { question, workspaceId, userPermissions, snapshotId } = query;

  // Parallel retrieval: text claims + graph context
  let claims: RetrievedClaim[];
  let graphCtx: GraphContext | null;

  // Graph context is gated on graph:read permission. Users without this permission
  // (e.g. HR staff with only knowledge:read) still get text answers but no graph
  // citations or /architecture links in the response.
  const canReadGraph =
    userPermissions.includes('graph:read') ||
    userPermissions.includes('admin:all');

  try {
    [claims, graphCtx] = await Promise.all([
      retrieveRelevantClaims(question, workspaceId, userPermissions),
      canReadGraph
        ? retrieveRelevantGraphContext(question, workspaceId, {
            explicitSnapshotId: snapshotId,
            permissions: userPermissions,
          }).catch((err) => {
            console.error(
              '[ask] Graph context retrieval failed (degraded gracefully):',
              err instanceof Error ? err.message : err,
            );
            return null;
          })
        : Promise.resolve(null),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Retrieval failed';
    yield { type: 'error', message };
    return;
  }

  const graphSources: GraphSourceRef[] = graphCtx ? toGraphSourceRefs(graphCtx) : [];

  if (claims.length === 0 && graphSources.length === 0) {
    yield {
      type: 'text',
      content:
        '죄송합니다. 관련 정보를 찾을 수 없습니다. 지식 베이스를 검색하거나 담당 팀에 문의해 주세요.',
    };
    yield { type: 'sources', sources: [] };
    yield { type: 'done', totalTokens: 0 };
    return;
  }

  const context = assembleContext(claims, graphSources, graphCtx);

  yield* generateAnswer(question, context, claims, graphSources);
}
