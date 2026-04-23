// packages/ai/case-context.ts
// Cases Layer Retrieval — precedent_case 테이블에서 관련 사례를 가져온다.
// 임베딩 생성 후 cosine similarity + 카테고리 키워드 보조 매칭.

import { db } from '@jarvis/db/client';
import { precedentCase } from '@jarvis/db/schema/case';
import { eq, and, sql, or, ilike, notInArray, type SQL } from 'drizzle-orm';
import { PERMISSIONS } from '@jarvis/shared/constants/permissions';
// Phase-Harness (2026-04-23): generateEmbedding 제거. 벡터 검색은 keywordFallback 으로 대체.
import type { CaseSourceRef } from './types.js';

export interface RetrievedCase {
  id: string;
  title: string;
  symptom: string | null;
  cause: string | null;
  action: string | null;
  result: string | null;
  requestCompany: string | null;
  clusterId: number | null;
  clusterLabel: string | null;
  isDigest: boolean;
  higherCategory: string | null;
  lowerCategory: string | null;
  vectorSim: number;
  hybridScore: number;
}

export interface CaseContext {
  cases: RetrievedCase[];
  xml: string;   // ask.ts system prompt에 주입할 XML 형식 컨텍스트
}

export type CaseSensitivityPolicy = 'all' | 'public-internal' | 'none';

export function getCaseSensitivityPolicy(userPermissions: string[] = []): CaseSensitivityPolicy {
  if (
    userPermissions.includes(PERMISSIONS.ADMIN_ALL) ||
    userPermissions.includes(PERMISSIONS.KNOWLEDGE_UPDATE) ||
    userPermissions.includes(PERMISSIONS.KNOWLEDGE_REVIEW)
  ) {
    return 'all';
  }
  if (userPermissions.includes(PERMISSIONS.KNOWLEDGE_READ)) {
    return 'public-internal';
  }
  return 'none';
}

function caseSensitivityCondition(userPermissions: string[] = []): SQL | undefined {
  const policy = getCaseSensitivityPolicy(userPermissions);
  if (policy === 'all') return undefined;
  if (policy === 'public-internal') {
    return notInArray(precedentCase.sensitivity, ['RESTRICTED', 'SECRET_REF_ONLY']);
  }
  return sql`1 = 0`;
}

// ---------------------------------------------------------------------------
// retrieveRelevantCases — 메인 retrieval 함수
// ---------------------------------------------------------------------------
export async function retrieveRelevantCases(
  question: string,
  workspaceId: string,
  options: {
    topK?: number;
    companyFilter?: string;       // 특정 고객사만 보기 (hard filter)
    userCompany?: string;         // 사용자 소속 고객사 (soft boost)
    companyBoost?: number;        // 같은 고객사 가산점 (default 0.15)
    includeNonDigest?: boolean;
    userPermissions?: string[];
  } = {},
): Promise<CaseContext> {
  const {
    topK = 5,
    companyFilter,
    // userCompany / companyBoost: Phase-Harness 이전에는 벡터 점수 + soft-boost
    // 조합에 사용됐으나 벡터 검색 제거로 현재는 keywordFallback 결과만 리턴.
    // 시그니처 호환을 위해 옵션은 유지하되 내부에서는 미사용.
    includeNonDigest = false,
    userPermissions = [],
  } = options;
  // Phase-Harness (2026-04-23): precedent_case.embedding 컬럼이 migration 0037 로
  // 드롭되었기 때문에 벡터 similarity 검색 경로가 제거되었다. 모든 쿼리는
  // keywordFallback (BM25 유사: title/symptom/category ILIKE) 로 처리된다.
  // 향후 Phase F 에서 pg_trgm 기반 검색으로 업그레이드하거나, ask-agent
  // 내부에 wiki-grep 에 흡수될 수 있다.
  return keywordFallback(question, workspaceId, topK, companyFilter, includeNonDigest, userPermissions);
}

// ---------------------------------------------------------------------------
// keywordFallback — 임베딩 없을 때 제목·카테고리 ILIKE 매칭
// ---------------------------------------------------------------------------
async function keywordFallback(
  question: string,
  workspaceId: string,
  topK: number,
  companyFilter?: string,
  includeNonDigest = false,
  userPermissions: string[] = [],
): Promise<CaseContext> {
  // 질문에서 핵심 키워드 추출 (간단히 2글자 이상 한글·영문 토큰)
  const tokens = question.match(/[가-힣a-zA-Z]{2,}/g) ?? [];
  if (tokens.length === 0) return { cases: [], xml: '' };

  const conditions = [
    eq(precedentCase.workspaceId, workspaceId),
    or(
      ...tokens.flatMap((tok) => {
        const safe = escapeLike(tok);
        return [
          ilike(precedentCase.title, `%${safe}%`),
          ilike(precedentCase.symptom, `%${safe}%`),
          ilike(precedentCase.lowerCategory, `%${safe}%`),
        ];
      }),
    )!,
  ];

  if (!includeNonDigest) {
    conditions.push(eq(precedentCase.isDigest, true));
  }
  const sensitivityCondition = caseSensitivityCondition(userPermissions);
  if (sensitivityCondition) {
    conditions.push(sensitivityCondition);
  }
  if (companyFilter) {
    conditions.push(eq(precedentCase.requestCompany, companyFilter));
  }

  const rows = await db
    .select({
      id: precedentCase.id,
      title: precedentCase.title,
      symptom: precedentCase.symptom,
      cause: precedentCase.cause,
      action: precedentCase.action,
      result: precedentCase.result,
      requestCompany: precedentCase.requestCompany,
      clusterId: precedentCase.clusterId,
      clusterLabel: precedentCase.clusterLabel,
      isDigest: precedentCase.isDigest,
      higherCategory: precedentCase.higherCategory,
      lowerCategory: precedentCase.lowerCategory,
    })
    .from(precedentCase)
    .where(and(...conditions))
    .orderBy(sql`${precedentCase.isDigest} DESC`)
    .limit(topK);

  const cases: RetrievedCase[] = rows.map((r) => ({
    ...r,
    vectorSim: 0,
    hybridScore: r.isDigest ? 0.5 : 0.3,
  }));

  return { cases, xml: buildCaseXml(cases) };
}

// ---------------------------------------------------------------------------
// buildCaseXml — system prompt 주입용 XML 빌더
// ---------------------------------------------------------------------------
function buildCaseXml(cases: RetrievedCase[]): string {
  if (cases.length === 0) return '';

  const items = cases
    .map(
      (c, i) => `
  <case index="${i + 1}" id="${c.id}" cluster="${c.clusterLabel ?? ''}">
    <category>${c.higherCategory ?? ''} > ${c.lowerCategory ?? ''}</category>
    <title>${escapeXml(c.title)}</title>
    ${c.symptom ? `<symptom>${escapeXml(c.symptom)}</symptom>` : ''}
    ${c.cause ? `<cause>${escapeXml(c.cause)}</cause>` : ''}
    ${c.action ? `<action>${escapeXml(c.action)}</action>` : ''}
    <result>${c.result ?? 'unknown'}</result>
    ${c.requestCompany ? `<company>${escapeXml(c.requestCompany)}</company>` : ''}
  </case>`,
    )
    .join('');

  return `<case_context>
  <!-- 유사 유지보수 사례 (${cases.length}건). 답변 시 참조하되, canonical 문서보다 후순위. -->
${items}
</case_context>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Escape LIKE/ILIKE wildcard characters in user input */
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// toCaseSourceRef — RetrievedCase → CaseSourceRef 변환 (ask.ts에서 사용)
// ---------------------------------------------------------------------------
export function toCaseSourceRef(c: RetrievedCase): CaseSourceRef {
  return {
    kind: 'case',
    caseId: c.id,
    title: c.title,
    symptom: c.symptom,
    action: c.action,
    requestCompany: c.requestCompany,
    clusterLabel: c.clusterLabel,
    result: c.result,
    confidence: c.hybridScore,
  };
}
