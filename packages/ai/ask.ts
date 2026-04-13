// packages/ai/ask.ts  (retrieval + generation)
// 2026-04-13: 6-lane 라우터 + Cases/Directory Layer 추가 + OpenAI 생성 마이그레이션

import OpenAI from 'openai';
import { buildKnowledgeSensitivitySqlFilter } from '@jarvis/auth/rbac';
import { db } from '@jarvis/db/client';
import { sql } from 'drizzle-orm';
import { generateEmbedding } from './embed.js';
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
import { routeQuestion } from './router.js';
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
// Constants
// ---------------------------------------------------------------------------
const TOP_K_VECTOR = 10;
const TOP_K_FINAL = 5;
const VECTOR_WEIGHT = 0.7;
const FTS_WEIGHT = 0.3;

const ASK_MODEL = process.env['ASK_AI_MODEL'] ?? 'gpt-4.1-mini';

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
export async function* generateAnswer(
  question: string,
  context: string,
  claims: RetrievedClaim[],
  graphSources: GraphSourceRef[],
  caseSources: CaseSourceRef[],
  dirSources: DirectorySourceRef[],
  mode: import('./types.js').AskMode = 'simple',
): AsyncGenerator<SSEEvent> {
  let totalTokens = 0;

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
      // OpenAI usage는 스트림 마지막 청크에 포함 (stream_options.include_usage 설정 시)
      if (chunk.usage) {
        totalTokens = (chunk.usage.prompt_tokens ?? 0) + (chunk.usage.completion_tokens ?? 0);
      }
    }

    yield { type: 'sources', sources: allSources };
    yield { type: 'done', totalTokens };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    yield { type: 'error', message };
  }
}

// ---------------------------------------------------------------------------
// askAI — 메인 파이프라인 (6-lane 라우터 통합)
// ---------------------------------------------------------------------------
export async function* askAI(
  query: import('./types.js').AskQuery,
): AsyncGenerator<SSEEvent> {
  const { question, workspaceId, userPermissions, snapshotId, userCompany } = query;

  const canReadGraph =
    userPermissions.includes('graph:read') ||
    userPermissions.includes('admin:all');

  // 1. 라우팅 결정
  const route = routeQuestion(question);
  const { lane } = route;

  // 2. Lane별 retrieval 계획 수립
  const shouldFetchText =
    lane !== 'directory-first'; // directory-only 질문엔 text skip

  const shouldFetchGraph =
    canReadGraph &&
    (lane === 'graph-first' || lane === 'tutor-first');

  const shouldFetchCases =
    lane === 'case-first' || lane === 'tutor-first' || lane === 'action-first';

  const shouldFetchDirectory =
    lane === 'directory-first' || lane === 'action-first' || lane === 'tutor-first';

  // 3. 병렬 retrieval 실행
  let claims: RetrievedClaim[] = [];
  let graphCtx: GraphContext | null = null;
  let caseResult: Awaited<ReturnType<typeof retrieveRelevantCases>> | null = null;
  let dirResult: Awaited<ReturnType<typeof searchDirectory>> | null = null;

  try {
    const tasks: Promise<unknown>[] = [];

    const claimsTask = shouldFetchText
      ? retrieveRelevantClaims(question, workspaceId, userPermissions)
      : Promise.resolve([]);

    const graphTask =
      shouldFetchGraph
        ? retrieveRelevantGraphContext(question, workspaceId, {
            explicitSnapshotId: snapshotId,
            permissions: userPermissions,
          }).catch((err) => {
            console.error('[ask] Graph context failed (degraded):', err instanceof Error ? err.message : err);
            return null;
          })
        : Promise.resolve(null);

    const casesTask = shouldFetchCases
      ? retrieveRelevantCases(question, workspaceId, {
          topK: 3,
          userCompany,
          userPermissions,
        })
      : Promise.resolve(null);

    const dirTask = shouldFetchDirectory
      ? searchDirectory(question, workspaceId, { topK: 5 })
      : Promise.resolve(null);

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

  const graphSources: GraphSourceRef[] = graphCtx ? toGraphSourceRefs(graphCtx) : [];
  const cases = caseResult?.cases ?? [];
  const entries = dirResult?.entries ?? [];
  const caseSources: CaseSourceRef[] = cases.map(toCaseSourceRef);
  const dirSources: DirectorySourceRef[] = entries.map(toDirectorySourceRef);

  // 4. 아무 결과도 없을 때 fallback
  if (
    claims.length === 0 &&
    graphSources.length === 0 &&
    cases.length === 0 &&
    entries.length === 0
  ) {
    yield {
      type: 'text',
      content:
        '죄송합니다. 관련 정보를 찾을 수 없습니다. 지식 베이스를 검색하거나 담당 팀에 문의해 주세요.',
    };
    yield { type: 'sources', sources: [] };
    yield { type: 'done', totalTokens: 0 };
    return;
  }

  // 5. 컨텍스트 조합 + 생성
  const context = assembleContext(claims, graphSources, graphCtx, cases, entries);

  yield* generateAnswer(question, context, claims, graphSources, caseSources, dirSources, query.mode ?? 'simple');
}
