import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import {
  organization,
  quizSeason,
  quizSeasonScore,
  user
} from "@jarvis/db/schema";

// P1 #7 — quiz_season_score / mascot_unlock 테이블엔 workspace_id 축이 없다.
// 단기 차단(A안): leaderboard 쿼리에 quiz_season 을 join 해서 workspace_id 로
// 필터링한다. seasonId 가 다른 테넌트의 것이면 결과는 빈 배열.
//
// TODO(multi-tenant, B안): quiz_season_score / mascot_unlock 에 workspace_id
// 컬럼 추가 + 복합 unique 마이그레이션. 본격 멀티테넌트 도입 시 score 업데이트
// 경로(quiz attempt 처리)에도 workspaceId 검증 추가 필요.
// (Code review P1 #7, 2026-04-30)

type DbLike = typeof db;
type DbOrTx = DbLike | Parameters<Parameters<DbLike["transaction"]>[0]>[0];

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  orgId: string | null;
  orgName: string | null;
  score: number;
  attempts: number;
  correct: number;
}

export interface OrgLeaderboardEntry {
  orgId: string;
  orgName: string;
  averageScore: number;
  totalScore: number;
  members: number;
}

export interface PastSeason {
  id: string;
  name: string;
  startedAt: Date;
  endedAt: Date;
}

const TOP_N = 20;

export async function getCurrentLeaderboard(
  seasonId: string,
  workspaceId: string,
  database: DbOrTx = db
): Promise<LeaderboardEntry[]> {
  const rows = await database
    .select({
      userId: quizSeasonScore.userId,
      userName: user.name,
      orgId: quizSeasonScore.orgId,
      orgName: organization.name,
      score: quizSeasonScore.score,
      attempts: quizSeasonScore.attempts,
      correct: quizSeasonScore.correct
    })
    .from(quizSeasonScore)
    .innerJoin(quizSeason, eq(quizSeasonScore.seasonId, quizSeason.id))
    .leftJoin(user, eq(quizSeasonScore.userId, user.id))
    .leftJoin(organization, eq(quizSeasonScore.orgId, organization.id))
    .where(
      and(
        eq(quizSeasonScore.seasonId, seasonId),
        eq(quizSeason.workspaceId, workspaceId)
      )
    )
    .orderBy(desc(quizSeasonScore.score))
    .limit(TOP_N);
  return rows.map((r, i) => ({
    rank: i + 1,
    userId: r.userId,
    userName: r.userName ?? "—",
    orgId: r.orgId,
    orgName: r.orgName,
    score: r.score,
    attempts: r.attempts,
    correct: r.correct
  }));
}

export async function getOrgLeaderboard(
  seasonId: string,
  workspaceId: string,
  database: DbOrTx = db
): Promise<OrgLeaderboardEntry[]> {
  const rows = await database
    .select({
      orgId: quizSeasonScore.orgId,
      orgName: organization.name,
      totalScore: sql<number>`COALESCE(SUM(${quizSeasonScore.score}), 0)::int`,
      members: sql<number>`COUNT(*)::int`
    })
    .from(quizSeasonScore)
    .innerJoin(quizSeason, eq(quizSeasonScore.seasonId, quizSeason.id))
    .leftJoin(organization, eq(quizSeasonScore.orgId, organization.id))
    .where(
      and(
        eq(quizSeasonScore.seasonId, seasonId),
        eq(quizSeason.workspaceId, workspaceId),
        isNotNull(quizSeasonScore.orgId)
      )
    )
    .groupBy(quizSeasonScore.orgId, organization.name);
  return rows
    .filter((r): r is { orgId: string; orgName: string | null; totalScore: number; members: number } => r.orgId !== null)
    .map((r) => ({
      orgId: r.orgId,
      orgName: r.orgName ?? "—",
      totalScore: r.totalScore,
      members: r.members,
      averageScore: r.members > 0 ? Math.round(r.totalScore / r.members) : 0
    }))
    .sort((a, b) => b.averageScore - a.averageScore);
}

export async function listPastSeasons(
  workspaceId: string,
  limit = 6,
  database: DbOrTx = db
): Promise<PastSeason[]> {
  const rows = await database
    .select({
      id: quizSeason.id,
      name: quizSeason.name,
      startedAt: quizSeason.startedAt,
      endedAt: quizSeason.endedAt
    })
    .from(quizSeason)
    .where(
      and(eq(quizSeason.workspaceId, workspaceId), isNotNull(quizSeason.endedAt))
    )
    .orderBy(desc(quizSeason.endedAt))
    .limit(limit);
  return rows
    .filter((r): r is { id: string; name: string; startedAt: Date; endedAt: Date } => r.endedAt !== null)
    .map((r) => ({ id: r.id, name: r.name, startedAt: r.startedAt, endedAt: r.endedAt }));
}

/**
 * 과거 시즌 leaderboard는 freeze된 jsonb snapshot을 사용 (rotate 시 저장).
 */
export async function getPastSeasonLeaderboard(
  seasonId: string,
  workspaceId: string,
  database: DbOrTx = db
): Promise<{ snapshot: unknown | null; name: string; endedAt: Date | null }> {
  const rows = await database
    .select({
      name: quizSeason.name,
      snapshot: quizSeason.leaderboardSnapshot,
      endedAt: quizSeason.endedAt
    })
    .from(quizSeason)
    .where(
      and(eq(quizSeason.id, seasonId), eq(quizSeason.workspaceId, workspaceId))
    )
    .limit(1);
  const row = rows[0];
  if (!row) return { snapshot: null, name: "", endedAt: null };
  return { snapshot: row.snapshot, name: row.name, endedAt: row.endedAt };
}
