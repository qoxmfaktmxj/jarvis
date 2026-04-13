'use server';

import { db } from '@jarvis/db/client';
import { knowledgePage, knowledgePageVersion } from '@jarvis/db/schema/knowledge';
import { directoryEntry } from '@jarvis/db/schema/directory';
import { eq, and, sql, desc } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface DriftItem {
  id: string;
  type: 'stale_reference' | 'missing_system' | 'outdated_procedure' | 'broken_link' | 'version_gap';
  severity: 'low' | 'medium' | 'high';
  pageId: string;
  pageTitle: string;
  pageSlug: string;
  description: string;
  suggestedAction: string;
  detectedAt: string;
}

export interface DriftReport {
  totalChecked: number;
  driftsFound: DriftItem[];
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  checkedAt: string;
}

// ---------------------------------------------------------------------------
// Known systems that should exist in directory_entry
// ---------------------------------------------------------------------------
const KNOWN_SYSTEM_REFERENCES = [
  { pattern: /이수\s*HR/i, name: 'isu-hr' },
  { pattern: /그룹웨어/i, name: 'isu-groupware' },
  { pattern: /전자전표/i, name: 'e-slip' },
  { pattern: /팀즈|Teams/i, name: 'teams' },
  { pattern: /워크업|WORKUP/i, name: 'workup' },
  { pattern: /스마트\s*오피스/i, name: 'smart-office' },
  { pattern: /러닝\s*센터/i, name: 'isu-learning' },
  { pattern: /구매\s*시스템/i, name: 'purchase-sys' },
];

// ---------------------------------------------------------------------------
// detectDrift — 문서-시스템 정합성 검사
// ---------------------------------------------------------------------------
export async function detectDrift(workspaceId: string): Promise<DriftReport> {
  const drifts: DriftItem[] = [];
  const now = new Date().toISOString();

  // 1. canonical 문서 + 최신 버전 조회
  const pages = await db
    .select({
      id: knowledgePage.id,
      title: knowledgePage.title,
      slug: knowledgePage.slug,
      surface: knowledgePage.surface,
      domain: knowledgePage.domain,
      ownerTeam: knowledgePage.ownerTeam,
      reviewCycleDays: knowledgePage.reviewCycleDays,
      updatedAt: knowledgePage.updatedAt,
    })
    .from(knowledgePage)
    .where(
      and(
        eq(knowledgePage.workspaceId, workspaceId),
        eq(knowledgePage.surface, 'canonical'),
      ),
    );

  // 2. directory entries 조회
  const entries = await db
    .select({
      id: directoryEntry.id,
      name: directoryEntry.name,
      nameKo: directoryEntry.nameKo,
      entryType: directoryEntry.entryType,
    })
    .from(directoryEntry)
    .where(eq(directoryEntry.workspaceId, workspaceId));

  const entryNames = new Set(entries.map((e) => e.name));

  // 3. 최신 버전 body 일괄 조회 (N+1 방지)
  const pageIds = pages.map((p) => p.id);
  const allVersions = pageIds.length > 0
    ? await db
        .select({
          pageId: knowledgePageVersion.pageId,
          mdxContent: knowledgePageVersion.mdxContent,
          versionNumber: knowledgePageVersion.versionNumber,
        })
        .from(knowledgePageVersion)
        .where(sql`${knowledgePageVersion.pageId} = ANY(${pageIds}::uuid[])`)
        .orderBy(desc(knowledgePageVersion.versionNumber))
    : [];

  // pageId -> 최신 버전만 추출
  const latestVersionMap = new Map<string, { mdxContent: string | null; versionNumber: number }>();
  for (const v of allVersions) {
    if (!latestVersionMap.has(v.pageId)) {
      latestVersionMap.set(v.pageId, v);
    }
  }

  for (const page of pages) {
    const latestVersion = latestVersionMap.get(page.id);
    if (!latestVersion?.mdxContent) continue;

    const body = latestVersion.mdxContent;

    // Check 3a: 문서에서 참조하는 시스템이 directory_entry에 있는지
    for (const sysRef of KNOWN_SYSTEM_REFERENCES) {
      if (sysRef.pattern.test(body) && !entryNames.has(sysRef.name)) {
        drifts.push({
          id: `drift-${page.id}-${sysRef.name}`,
          type: 'missing_system',
          severity: 'medium',
          pageId: page.id,
          pageTitle: page.title,
          pageSlug: page.slug,
          description: `문서에서 "${sysRef.name}" 시스템을 참조하지만 directory에 등록되지 않음`,
          suggestedAction: `directory_entry에 "${sysRef.name}" 추가`,
          detectedAt: now,
        });
      }
    }

    // Check 3b: 문서에 URL이 있는데 깨진 패턴 (https?://로 시작하는데 도메인이 비활성)
    const urls = body.match(/https?:\/\/[^\s)>"]+/g) ?? [];
    for (const url of urls) {
      // 내부 URL이 localhost나 placeholder를 가리키면 drift
      if (/localhost|example\.com|placeholder/i.test(url)) {
        drifts.push({
          id: `drift-${page.id}-url-${url.slice(0, 30)}`,
          type: 'broken_link',
          severity: 'low',
          pageId: page.id,
          pageTitle: page.title,
          pageSlug: page.slug,
          description: `문서에 개발용 URL 발견: ${url.slice(0, 80)}`,
          suggestedAction: '실제 운영 URL로 변경',
          detectedAt: now,
        });
      }
    }

    // Check 3c: 버전이 1개뿐인데 review_cycle을 넘긴 문서 (한번도 갱신 안 된 imported 문서)
    if (
      latestVersion.versionNumber === 1 &&
      page.reviewCycleDays &&
      page.updatedAt
    ) {
      const daysSince = Math.floor(
        (Date.now() - new Date(page.updatedAt).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSince > page.reviewCycleDays) {
        drifts.push({
          id: `drift-${page.id}-never-updated`,
          type: 'version_gap',
          severity: 'high',
          pageId: page.id,
          pageTitle: page.title,
          pageSlug: page.slug,
          description: `imported 후 ${daysSince}일간 한 번도 갱신되지 않음 (주기: ${page.reviewCycleDays}일)`,
          suggestedAction: '담당 팀에 문서 검토 요청',
          detectedAt: now,
        });
      }
    }
  }

  // 4. 통계
  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const d of drifts) {
    byType[d.type] = (byType[d.type] ?? 0) + 1;
    bySeverity[d.severity] = (bySeverity[d.severity] ?? 0) + 1;
  }

  return {
    totalChecked: pages.length,
    driftsFound: drifts,
    byType,
    bySeverity,
    checkedAt: now,
  };
}
