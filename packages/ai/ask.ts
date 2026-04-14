// packages/ai/ask.ts  (retrieval + generation)
// 2026-04-13: 6-lane 라우터 + Cases/Directory Layer 추가 + OpenAI 생성 마이그레이션
// 2026-04-14 (Phase-7A PR#5): cache-through with workspace/prompt/scope-aware key.
// 2026-04-15 (Phase-7A merged): assertBudget + logLlmCall integrated.

import OpenAI from 'openai';
import { buildKnowledgeSensitivitySqlFilter } from '@jarvis/auth/rbac';
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';
import { generateEmbedding } from './embed.js';
import { logLlmCall } from './logger.js';
import { assertBudget, BudgetExceededError, recordBlocked } from './budget.js';
import {
  retrieveRelevantGraphContext,
  type GraphContext,
} from './graph-context.js';
import {
  retrieveRelevantCases,
  toCaseSourceRef,
  type RetrievedCase,
} from './case-context.js';
import {
  searchDirectory,
  toDirectorySourceRef,
  type RetrievedEntry,
} from './directory-context.js';
import { routeQuestion, LANE_SOURCE_WEIGHTS } from './router.js';
import { makeCacheKey, getCached, setCached } from './cache.js';
import type {
  SSEEvent,
  SourceRef,
  TextSourceRef,
  GraphSourceRef,
  CaseSourceRef,
  DirectorySourceRef,
  RetrievedClaim,
} from './types.js';

// ---------------------------------------------------------------------------
// Cache key versioning — bump when prompt template changes
// ---------------------------------------------------------------------------
export const PROMPT_VERSION = '2026-04-v1';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const TOP_K_VECTOR = 10;
const TOP_K_FINAL = 5;
const VECTOR_WEIGHT = 0.7;
const FTS_WEIGHT = 0.3;

const ASK_MODEL = process.env['ASK_AI_MODEL'] ?? 'gpt-5.4-mini';

// 모델별 단가(USD per 1K tokens). 스펙 §3 PR#1 cost 계산용.
const MODEL_PRICING: Record<string, { in: number; out: number }> = {
  'gpt-5.4-mini': { in: 0.0005, out: 0.0015 },
  'gpt-5.4': { in: 0.005, out: 0.015 },
  'text-embedding-3-small': { in: 0.00002, out: 0 },
};

function computeCostUsd(model: string, tokensIn: number, tokensOut: number): string {
  const p = MODEL_PRICING[model] ?? { in: 0, out: 0 };
  const cost = (tokensIn * p.in + tokensOut * p.out) / 1000;
  return cost.toFixed(6);
}

// ---------------------------------------------------------------------------
// Text Claims Retrieval (기존 로직 유지)
// ---------------------------------------------------------------------------
export async function retrieveRelevantClaims(
  question: string,
  workspaceId: string,
  userPermissions: string[],
): Promise<RetrievedClaim[]> {
  const embedding = await generateEmbedding(question);
  const embeddingLiteral = `[${embedding.join(',')}]`;

  const sensitivityFilter = buildKnowledgeSensitivitySqlFilter(userPermissions)
    .replace(/\bsensitivity\b/g, 'kp.sensitivity')
    .trim();
  const sensitivityClause = sensitivityFilter
    ? sql.raw(` ${sensitivityFilter}`)
    : sql.empty();

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

  const claims: RetrievedClaim[] = vectorRows.rows.map((row) => {
    const vectorSim = 1 - Number(row.distance);
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

// ---------------------------------------------------------------------------
// OpenAI Client
// ---------------------------------------------------------------------------
const openai = new OpenAI({
  apiKey: process.env['OPENAI_API_KEY'],
});

// ---------------------------------------------------------------------------
// XML / Helper utilities (기존 유지)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// toGraphSourceRefs (기존 유지)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// assembleContext — 4개 소스 종류를 하나의 XML로 통합
// ---------------------------------------------------------------------------
export function assembleContext(
  claims: RetrievedClaim[],
  graphSources: GraphSourceRef[],
  graphCtx: GraphContext | null,
  cases: RetrievedCase[],
  entries: RetrievedEntry[],
): string {
  let idx = 1;
  const textEntries = claims.map(
    (c) =>
      `  <source idx="${idx++}" kind="text" title="${escapeXml(c.pageTitle)}" url="${c.pageUrl}">${escapeXml(c.claimText)}</source>`,
  );

  const textCount = claims.length;
  const graphEntries = graphSources.map((g) => {
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
    const inner = [pathLine, communityLine, fileLine, connSummary ? `Connections: ${connSummary}` : '']
      .filter(Boolean)
      .join(' | ');
    return `  <source idx="${idx++}" kind="graph" node="${escapeXml(g.nodeLabel)}">${inner}</source>`;
  });

  const caseEntries = cases.map(
    (c) =>
      `  <source idx="${idx++}" kind="case" cluster="${escapeXml(c.clusterLabel ?? '')}" result="${c.result ?? ''}">` +
      `증상: ${escapeXml(c.symptom ?? '')} | 조치: ${escapeXml(c.action ?? '')}</source>`,
  );

  const dirEntries = entries.map(
    (e) =>
      `  <source idx="${idx++}" kind="directory" type="${e.entryType}" name="${escapeXml(e.name)}">` +
      `${e.url ? `URL: ${escapeXml(e.url)} | ` : ''}${e.ownerTeam ? `담당: ${escapeXml(e.ownerTeam)}` : ''}</source>`,
  );

  return `<context>\n${[...textEntries, ...graphEntries, ...caseEntries, ...dirEntries].join('\n')}\n</context>`;
}

// ---------------------------------------------------------------------------
// SYSTEM_PROMPT — 4개 소스 종류 지원, Simple/Expert 모드 분기
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT_BASE = `You are Jarvis, an internal knowledge assistant for an enterprise portal.
Answer ONLY based on the provided <context>. Do not use outside knowledge.

Sources inside <context> come in four kinds:
  - kind="text"      → excerpts from canonical knowledge pages (highest authority)
  - kind="graph"     → structural facts from the code/architecture graph
  - kind="case"      → past maintenance/incident patterns (증상→조치 형식)
  - kind="directory" → internal system links, forms, contacts (바로가기 정보)

Citation rules:
1. For each factual claim, cite the source using [source:N] notation (N = idx attribute).
2. If multiple sources support a claim, cite all: [source:1][source:3].
3. text > graph > case > directory in authority order for conflicting information.
4. If <context> doesn't answer the question, say so explicitly and suggest searching the knowledge base or contacting the relevant team.
5. Use the same language as the user's question (Korean preferred).`;

const SIMPLE_SUFFIX = `
Response style: SIMPLE mode
- Answer in 2-3 short sentences maximum.
- Lead with the direct answer, then one supporting detail.
- If a directory link exists, show it as a clickable action: "→ [시스템명] 바로가기".
- Skip detailed explanations, cases, and graph context unless directly asked.
- Prioritize: answer → link → team contact.`;

const EXPERT_SUFFIX = `
Response style: EXPERT mode
- Provide a thorough, detailed answer with full context.
- Include relevant case patterns (증상→원인→조치→결과) when available.
- Reference graph/structural context for architecture or dependency questions.
- Show all relevant directory links and forms.
- Explain the reasoning and cite all supporting sources.
- Structure with clear sections when the answer is complex.`;

function getSystemPrompt(mode: import('./types.js').AskMode = 'simple'): string {
  return SYSTEM_PROMPT_BASE + (mode === 'expert' ? EXPERT_SUFFIX : SIMPLE_SUFFIX);
}

// ---------------------------------------------------------------------------
// generateAnswer — OpenAI 스트리밍 생성
// ---------------------------------------------------------------------------
export interface AskMeta {
  workspaceId: string;
  requestId: string | null;
}

export async function* generateAnswer(
  question: string,
  context: string,
  claims: RetrievedClaim[],
  graphSources: GraphSourceRef[],
  caseSources: CaseSourceRef[],
  dirSources: DirectorySourceRef[],
  mode: import('./types.js').AskMode = 'simple',
  meta: AskMeta = { workspaceId: '00000000-0000-0000-0000-000000000000', requestId: null },
): AsyncGenerator<SSEEvent> {
  let tokensIn = 0;
  let tokensOut = 0;
  const startedAt = Date.now();

  // 통합 sources 배열 (idx 순서: text → graph → case → directory)
  const allTextSources: TextSourceRef[] = claims.map((c) => ({
    kind: 'text',
    pageId: c.pageId,
    title: c.pageTitle,
    url: c.pageUrl,
    excerpt: c.claimText.slice(0, 200),
    confidence: c.hybridScore,
  }));
  const allSources: SourceRef[] = [
    ...allTextSources,
    ...graphSources,
    ...caseSources,
    ...dirSources,
  ];

  // Budget gate BEFORE OpenAI call
  try {
    await assertBudget(meta.workspaceId);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await recordBlocked(meta.workspaceId, ASK_MODEL, meta.requestId);
      yield { type: 'error', message: 'daily budget exceeded' };
      return;
    }
    throw err;
  }

  try {
    const stream = await openai.chat.completions.create({
      model: ASK_MODEL,
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 1024,
      messages: [
        { role: 'system', content: getSystemPrompt(mode) },
        { role: 'user', content: `${context}\n\nQuestion: ${question}` },
      ],
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield { type: 'text', content };
      }
      if (chunk.usage) {
        tokensIn = chunk.usage.prompt_tokens ?? 0;
        tokensOut = chunk.usage.completion_tokens ?? 0;
      }
    }

    yield { type: 'sources', sources: allSources };
    yield { type: 'done', totalTokens: tokensIn + tokensOut };

    await logLlmCall({
      workspaceId: meta.workspaceId,
      requestId: meta.requestId,
      model: ASK_MODEL,
      promptVersion: PROMPT_VERSION,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      costUsd: computeCostUsd(ASK_MODEL, tokensIn, tokensOut),
      durationMs: Date.now() - startedAt,
      status: 'ok',
      blockedBy: null,
      errorCode: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await logLlmCall({
      workspaceId: meta.workspaceId,
      requestId: meta.requestId,
      model: ASK_MODEL,
      promptVersion: PROMPT_VERSION,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      costUsd: computeCostUsd(ASK_MODEL, tokensIn, tokensOut),
      durationMs: Date.now() - startedAt,
      status: 'error',
      blockedBy: null,
      errorCode: message,
    });
    yield { type: 'error', message };
  }
}

// ---------------------------------------------------------------------------
// Unified retrieval: 항상 4개 소스 전부 병렬 검색 → lane 가중치로 랭킹만 조정.
// 라우터는 "어떤 소스를 버릴지"가 아니라 "얼마나 신뢰할지"를 결정한다.
// ---------------------------------------------------------------------------
const UNIFIED_TOP_K = 8;      // 각 소스 초기 fetch 개수
const UNIFIED_FINAL_TEXT = 5;
const UNIFIED_FINAL_CASE = 4;
const UNIFIED_FINAL_DIR = 5;
const UNIFIED_FINAL_GRAPH = 5;

export async function* askAI(
  query: import('./types.js').AskQuery,
): AsyncGenerator<SSEEvent> {
  const { question, workspaceId, userPermissions, snapshotId, userCompany } = query;

  // ---------------------------------------------------------------------------
  // Phase-7A cache-through (interim in-memory LRU; Phase-7B replaces with Redis)
  // sensitivityScope encodes both knowledge clearance and graph access so that
  // users with different permission profiles never share a cache entry.
  // Format: workspace:<id>|level:<public|internal|restricted|secret>|graph:<0|1>
  // Callers MUST pass the RBAC-derived scope (see apps/web/app/api/ask/route.ts).
  // The fallback here is the conservative minimum (internal, no graph).
  // ---------------------------------------------------------------------------
  const sensitivityScope =
    query.sensitivityScope ??
    `workspace:${workspaceId}|level:internal|graph:0`;

  const cacheKey = makeCacheKey({
    promptVersion: PROMPT_VERSION,
    workspaceId,
    sensitivityScope,
    input: question,
    model: process.env['ASK_AI_MODEL'] ?? 'gpt-5.4-mini',
  });

  // Budget gate applies even on cache hit — a workspace over budget should not
  // receive LLM content regardless of whether it comes from cache or a new call.
  try {
    await assertBudget(workspaceId);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await recordBlocked(workspaceId, process.env['ASK_AI_MODEL'] ?? 'gpt-5.4-mini', query.requestId ?? null);
      yield { type: 'error', message: 'daily budget exceeded' };
      return;
    }
    throw err;
  }

  const hit = await getCached(cacheKey);
  if (hit) {
    // Cache hit: replay stored events without touching OpenAI.
    const cached = JSON.parse(hit) as SSEEvent[];
    for (const evt of cached) {
      yield evt;
    }
    return;
  }

  // No cache hit — run the full retrieval + generation pipeline and
  // collect events so we can store them after completion.

  const canReadGraph =
    userPermissions.includes('graph:read') ||
    userPermissions.includes('admin:all');

  // Collect all events so we can cache the full response after completion.
  const collectedEvents: SSEEvent[] = [];

  // 1. 라우팅: lane 결정 + 소스별 가중치
  const route = routeQuestion(question);
  const weights = LANE_SOURCE_WEIGHTS[route.lane];
  const routeEvent: SSEEvent = { type: 'route', lane: route.lane, confidence: route.confidence };
  collectedEvents.push(routeEvent);
  yield routeEvent;

  // 2. 모든 소스 항상 병렬 fetch (graph는 권한 있을 때만)
  let claims: RetrievedClaim[] = [];
  let graphCtx: GraphContext | null = null;
  let caseResult: Awaited<ReturnType<typeof retrieveRelevantCases>> | null = null;
  let dirResult: Awaited<ReturnType<typeof searchDirectory>> | null = null;

  try {
    const claimsTask = retrieveRelevantClaims(question, workspaceId, userPermissions)
      .catch((err) => {
        console.error('[ask] Text retrieval failed:', err instanceof Error ? err.message : err);
        return [] as RetrievedClaim[];
      });

    const graphTask = canReadGraph
      ? retrieveRelevantGraphContext(question, workspaceId, {
          explicitSnapshotId: snapshotId,
          permissions: userPermissions,
        }).catch((err) => {
          console.error('[ask] Graph retrieval failed (degraded):', err instanceof Error ? err.message : err);
          return null;
        })
      : Promise.resolve(null);

    const casesTask = retrieveRelevantCases(question, workspaceId, {
      topK: UNIFIED_TOP_K,
      userCompany,
      userPermissions,
      includeNonDigest: true,
    }).catch((err) => {
      console.error('[ask] Case retrieval failed:', err instanceof Error ? err.message : err);
      return null;
    });

    const dirTask = searchDirectory(question, workspaceId, { topK: UNIFIED_TOP_K })
      .catch((err) => {
        console.error('[ask] Directory retrieval failed:', err instanceof Error ? err.message : err);
        return null;
      });

    [claims, graphCtx, caseResult, dirResult] = await Promise.all([
      claimsTask,
      graphTask,
      casesTask,
      dirTask,
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Retrieval failed';
    yield { type: 'error', message };
    return;
  }

  // 3. 소스별 가중치 적용 + 정규화 후 최종 선택
  const rawCases = caseResult?.cases ?? [];
  const rawEntries = dirResult?.entries ?? [];

  const weightedClaims = claims
    .map((c) => ({ ...c, weighted: c.hybridScore * weights.text }))
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, UNIFIED_FINAL_TEXT);

  const weightedCases = rawCases
    .map((c) => ({ ...c, weighted: c.hybridScore * weights.case }))
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, UNIFIED_FINAL_CASE);

  const weightedEntries = rawEntries
    .map((e) => ({ ...e, weighted: e.score * weights.directory }))
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, UNIFIED_FINAL_DIR);

  const graphSources: GraphSourceRef[] = graphCtx ? toGraphSourceRefs(graphCtx) : [];
  const weightedGraph = graphSources
    .map((g) => ({ ...g, weighted: g.confidence * weights.graph }))
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, UNIFIED_FINAL_GRAPH);

  const caseSources: CaseSourceRef[] = weightedCases.map(toCaseSourceRef);
  const dirSources: DirectorySourceRef[] = weightedEntries.map(toDirectorySourceRef);

  // 4. 아무 결과도 없을 때 fallback
  if (
    weightedClaims.length === 0 &&
    weightedGraph.length === 0 &&
    weightedCases.length === 0 &&
    weightedEntries.length === 0
  ) {
    yield {
      type: 'text',
      content:
        '죄송합니다. 관련 정보를 찾을 수 없습니다. 지식 베이스를 검색하거나 담당 팀에 문의해 주세요.',
    };
    yield { type: 'sources', sources: [] };
    yield { type: 'done', totalTokens: 0 };
    // Don't cache the fallback (no-result responses shouldn't be cached).
    return;
  }

  // 5. 컨텍스트 조합 + 생성
  const context = assembleContext(
    weightedClaims,
    weightedGraph,
    graphCtx,
    weightedCases,
    weightedEntries,
  );

  // Collect generation events, yield each one, then cache the whole response.
  for await (const evt of generateAnswer(
    question,
    context,
    weightedClaims,
    weightedGraph,
    caseSources,
    dirSources,
    query.mode ?? 'simple',
    { workspaceId, requestId: query.requestId ?? null },
  )) {
    collectedEvents.push(evt);
    yield evt;
  }

  // Store the collected events so future identical requests skip OpenAI.
  // Don't cache error responses — a transient OpenAI failure should not be
  // served to future callers as a cached "answer".
  const hasError = collectedEvents.some(e => e.type === 'error');
  if (!hasError) {
    await setCached(cacheKey, JSON.stringify(collectedEvents));
  }
}
