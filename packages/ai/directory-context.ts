// packages/ai/directory-context.ts
// Directory Layer Retrieval — "어디서 신청해?", "링크가 뭐야?", "담당자 누구야?" 처리
// directory_entry 테이블에서 키워드 매칭으로 바로가기 카드를 반환한다.

import { db } from '@jarvis/db/client';
import { directoryEntry } from '@jarvis/db/schema/directory';
import { eq, and, or, ilike, asc } from 'drizzle-orm';
import type { DirectorySourceRef } from './types.js';

export interface RetrievedEntry {
  id: string;
  entryType: string;
  name: string;
  nameKo: string | null;
  description: string | null;
  url: string | null;
  category: string | null;
  ownerTeam: string | null;
  ownerContact: string | null;
  relatedPageSlug: string | null;
  metadata: Record<string, unknown>;
  score: number;  // 매칭 점수 (0~1)
}

export interface DirectoryContext {
  entries: RetrievedEntry[];
  xml: string;  // ask.ts system prompt에 주입할 XML
}

// ---------------------------------------------------------------------------
// searchDirectory — 메인 검색 함수
// ---------------------------------------------------------------------------
export async function searchDirectory(
  question: string,
  workspaceId: string,
  options: {
    topK?: number;
    categoryFilter?: string;  // hr | it | admin | welfare | facility 등
    typeFilter?: string;      // tool | form | contact | system_link | guide_link
  } = {},
): Promise<DirectoryContext> {
  const { topK = 5, categoryFilter, typeFilter } = options;

  // 1. 질문에서 검색 키워드 추출 (2글자 이상 한글·영문)
  const tokens = extractKeywords(question);

  if (tokens.length === 0) {
    return { entries: [], xml: '' };
  }

  // 2. ILIKE 조건 구성 (name, name_ko, description 검색)
  // Note: directory_entry is assumed public-internal (no sensitivity column).
  // All entries are visible to any authenticated user. This is by design —
  // directory items are tool links, forms, and team contacts, not sensitive data.
  const keywordConditions = tokens.flatMap((tok) => {
    const safe = escapeLike(tok);
    return [
      ilike(directoryEntry.name, `%${safe}%`),
      ilike(directoryEntry.nameKo, `%${safe}%`),
      ilike(directoryEntry.description, `%${safe}%`),
    ];
  });

  const baseConditions = [
    eq(directoryEntry.workspaceId, workspaceId),
    or(...keywordConditions)!,
  ];

  if (categoryFilter) {
    baseConditions.push(eq(directoryEntry.category, categoryFilter));
  }
  if (typeFilter) {
    baseConditions.push(eq(directoryEntry.entryType, typeFilter));
  }

  const rows = await db
    .select({
      id: directoryEntry.id,
      entryType: directoryEntry.entryType,
      name: directoryEntry.name,
      nameKo: directoryEntry.nameKo,
      description: directoryEntry.description,
      url: directoryEntry.url,
      category: directoryEntry.category,
      ownerTeam: directoryEntry.ownerTeam,
      ownerContact: directoryEntry.ownerContact,
      relatedPageSlug: directoryEntry.relatedPageSlug,
      metadata: directoryEntry.metadata,
      sortOrder: directoryEntry.sortOrder,
    })
    .from(directoryEntry)
    .where(and(...baseConditions))
    .orderBy(asc(directoryEntry.sortOrder))
    .limit(topK * 2);

  // 3. 간단한 relevance 스코어 계산 (매칭 토큰 수 비율)
  const scored: RetrievedEntry[] = rows.map((row) => {
    const nameHits = tokens.filter(
      (t) =>
        row.name.toLowerCase().includes(t.toLowerCase()) ||
        (row.nameKo ?? '').includes(t),
    ).length;
    const score = nameHits / Math.max(tokens.length, 1);

    return {
      id: row.id,
      entryType: row.entryType,
      name: row.name,
      nameKo: row.nameKo,
      description: row.description,
      url: row.url,
      category: row.category,
      ownerTeam: row.ownerTeam,
      ownerContact: row.ownerContact,
      relatedPageSlug: row.relatedPageSlug,
      metadata: row.metadata as Record<string, unknown>,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topK);

  return {
    entries: top,
    xml: buildDirectoryXml(top),
  };
}

// ---------------------------------------------------------------------------
// buildDirectoryXml — system prompt 주입용 XML 빌더
// ---------------------------------------------------------------------------
function buildDirectoryXml(entries: RetrievedEntry[]): string {
  if (entries.length === 0) return '';

  const items = entries
    .map(
      (e, i) => `
  <entry index="${i + 1}" type="${e.entryType}" id="${e.id}">
    <name>${escapeXml(e.name)}${e.nameKo ? ` (${escapeXml(e.nameKo)})` : ''}</name>
    ${e.description ? `<description>${escapeXml(e.description)}</description>` : ''}
    ${e.url ? `<url>${escapeXml(e.url)}</url>` : ''}
    ${e.category ? `<category>${escapeXml(e.category)}</category>` : ''}
    ${e.ownerTeam ? `<owner_team>${escapeXml(e.ownerTeam)}</owner_team>` : ''}
    ${e.ownerContact ? `<owner_contact>${escapeXml(e.ownerContact)}</owner_contact>` : ''}
  </entry>`,
    )
    .join('');

  return `<directory_context>
  <!-- 사내 시스템·양식·담당자 목록 (${entries.length}건). 경로/링크 안내 시 우선 참조. -->
${items}
</directory_context>`;
}

// ---------------------------------------------------------------------------
// toDirectorySourceRef — RetrievedEntry → DirectorySourceRef 변환
// ---------------------------------------------------------------------------
export function toDirectorySourceRef(e: RetrievedEntry): DirectorySourceRef {
  return {
    kind: 'directory',
    entryId: e.id,
    entryType: e.entryType,
    name: e.name,
    nameKo: e.nameKo,
    url: e.url,
    category: e.category,
    ownerTeam: e.ownerTeam,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function extractKeywords(question: string): string[] {
  // 불용어 제거 후 2글자 이상 토큰만 추출
  const STOPWORDS = new Set([
    '있나요', '인가요', '어떤', '어디', '무엇', '어떻게', '뭔가',
    '뭐야', '해줘', '해주세요', '알려줘', '궁금', '질문', '문의',
  ]);

  return (
    (question.match(/[가-힣a-zA-Z]{2,}/g) ?? []).filter(
      (tok) => !STOPWORDS.has(tok),
    )
  );
}

/** Escape LIKE/ILIKE wildcard characters in user input */
function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
