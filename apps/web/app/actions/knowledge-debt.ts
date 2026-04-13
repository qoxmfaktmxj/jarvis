'use server';

import { cookies, headers } from 'next/headers';
import { getSession } from '@jarvis/auth/session';
import { db } from '@jarvis/db/client';
import { knowledgePage } from '@jarvis/db/schema/knowledge';
import { and, eq, isNotNull } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface StaleDocument {
  id: string;
  title: string;
  slug: string;
  surface: string;
  domain: string | null;
  ownerTeam: string | null;
  lastVerifiedAt: string | null;
  reviewCycleDays: number;
  daysSinceVerified: number;
  overdueDays: number;
}

export interface KnowledgeDebtSummary {
  totalDocuments: number;
  staleDocuments: StaleDocument[];
  overdueCount: number;
  warningCount: number;
  healthyCount: number;
  byTeam: Record<string, { overdue: number; warning: number; healthy: number }>;
  byDomain: Record<string, { overdue: number; warning: number }>;
}

// ---------------------------------------------------------------------------
// getKnowledgeDebtSummary — 지식 부채 전체 현황 조회
// ---------------------------------------------------------------------------
async function resolveSessionId() {
  const headerStore = await headers();
  const cookieStore = await cookies();
  return (
    headerStore.get('x-session-id') ??
    cookieStore.get('sessionId')?.value ??
    cookieStore.get('jarvis_session')?.value ??
    null
  );
}

export async function getKnowledgeDebtSummary(
  workspaceId: string,
): Promise<KnowledgeDebtSummary> {
  // Auth guard — prevent unauthorized workspace enumeration
  const sessionId = await resolveSessionId();
  if (!sessionId) throw new Error('Unauthorized');
  const session = await getSession(sessionId);
  if (!session || session.workspaceId !== workspaceId) throw new Error('Forbidden');
  // review_cycle_days가 설정된 문서만 대상 (canonical surface 위주)
  const rows = await db
    .select({
      id: knowledgePage.id,
      title: knowledgePage.title,
      slug: knowledgePage.slug,
      surface: knowledgePage.surface,
      domain: knowledgePage.domain,
      ownerTeam: knowledgePage.ownerTeam,
      reviewCycleDays: knowledgePage.reviewCycleDays,
      lastVerifiedAt: knowledgePage.lastVerifiedAt,
      updatedAt: knowledgePage.updatedAt,
    })
    .from(knowledgePage)
    .where(
      and(
        eq(knowledgePage.workspaceId, workspaceId),
        isNotNull(knowledgePage.reviewCycleDays),
      ),
    );

  const now = Date.now();
  const staleDocuments: StaleDocument[] = [];
  let overdueCount = 0;
  let warningCount = 0;
  let healthyCount = 0;
  const byTeam: Record<string, { overdue: number; warning: number; healthy: number }> = {};
  const byDomain: Record<string, { overdue: number; warning: number }> = {};

  for (const row of rows) {
    const cycleDays = row.reviewCycleDays ?? 90;
    // Prefer lastVerifiedAt (explicit review); fall back to updatedAt (any edit)
    const verifiedDate = row.lastVerifiedAt ?? row.updatedAt;
    const lastVerified = verifiedDate ? new Date(verifiedDate).getTime() : 0;
    const daysSince = Math.floor((now - lastVerified) / (1000 * 60 * 60 * 24));
    const overdueDays = daysSince - cycleDays;

    const team = row.ownerTeam ?? '미지정';
    const domain = row.domain ?? '일반';

    if (!byTeam[team]) byTeam[team] = { overdue: 0, warning: 0, healthy: 0 };
    if (!byDomain[domain]) byDomain[domain] = { overdue: 0, warning: 0 };

    if (overdueDays > 0) {
      // 기한 초과
      overdueCount++;
      byTeam[team].overdue++;
      byDomain[domain].overdue++;
      staleDocuments.push({
        id: row.id,
        title: row.title,
        slug: row.slug,
        surface: row.surface,
        domain: row.domain,
        ownerTeam: row.ownerTeam,
        lastVerifiedAt: row.updatedAt?.toISOString() ?? null,
        reviewCycleDays: cycleDays,
        daysSinceVerified: daysSince,
        overdueDays,
      });
    } else if (overdueDays > -14) {
      // 2주 이내 만료 예정
      warningCount++;
      byTeam[team].warning++;
      byDomain[domain].warning++;
    } else {
      healthyCount++;
      byTeam[team].healthy++;
    }
  }

  // 초과 일수 내림차순 정렬
  staleDocuments.sort((a, b) => b.overdueDays - a.overdueDays);

  return {
    totalDocuments: rows.length,
    staleDocuments,
    overdueCount,
    warningCount,
    healthyCount,
    byTeam,
    byDomain,
  };
}
