/**
 * apps/worker/src/jobs/quiz-season-rotate.ts
 *
 * 매일 KST 00:01 (cron `1 15 * * *` UTC)에 트리거. 오늘이 KST 기준 1일이면
 * 모든 워크스페이스에서 active season을 종료하고 새 시즌을 만든다.
 *
 * 종료 처리:
 *   1. top 20 + org leaderboard freeze → leaderboard_snapshot jsonb
 *   2. ended_at = now()
 *   3. rank 1: 희귀 mascot unlock (astronaut)
 *      rank 2-3: 일반 mascot 1개 unlock (사용자별 결정론)
 *   4. 새 시즌 row 생성 (name = "YYYY-MM" KST 기준)
 */

import type PgBoss from "pg-boss";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import {
  mascotUnlock,
  organization,
  quizSeason,
  quizSeasonScore,
  user,
  workspace
} from "@jarvis/db/schema";

type DbLike = typeof db;
type DbOrTx = DbLike | Parameters<Parameters<DbLike["transaction"]>[0]>[0];
// Note: 워커는 apps/web의 lib을 import할 수 없으므로 mascot 풀 로직은 워커 로컬에 둔다.
// apps/web/lib/quiz/mascot-pool.ts와 동일한 풀. 풀이 바뀌면 양쪽 모두 갱신.

const RARE_MASCOTS = ["astronaut"] as const;
const COMMON_MASCOTS = [
  "armchair",
  "bird",
  "cabbage",
  "chef",
  "diver",
  "garden",
  "music",
  "onsen",
  "painter",
  "snorkel",
  "surprise",
  "watermelon"
] as const;

function hashSeed(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h * 33) ^ input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function pickFromPool(
  pool: readonly string[],
  owned: ReadonlySet<string>,
  seed: string
): string | null {
  const candidates = pool.filter((m) => !owned.has(m));
  if (candidates.length === 0) return null;
  return candidates[hashSeed(seed) % candidates.length]!;
}

interface KstNow {
  date: string; // YYYY-MM-DD (KST)
  day: number; // 1-31
  monthLabel: string; // YYYY-MM (KST)
}

export function kstNow(now: Date = new Date()): KstNow {
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = kst.getUTCDate();
  const dayStr = String(day).padStart(2, "0");
  return { date: `${y}-${m}-${dayStr}`, day, monthLabel: `${y}-${m}` };
}

interface LeaderboardRow {
  userId: string;
  userName: string | null;
  orgId: string | null;
  orgName: string | null;
  score: number;
  attempts: number;
  correct: number;
}

async function fetchLeaderboard(
  seasonId: string,
  database: DbOrTx,
  topN = 20
): Promise<LeaderboardRow[]> {
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
    .leftJoin(user, eq(quizSeasonScore.userId, user.id))
    .leftJoin(organization, eq(quizSeasonScore.orgId, organization.id))
    .where(eq(quizSeasonScore.seasonId, seasonId))
    .orderBy(desc(quizSeasonScore.score))
    .limit(topN);
  return rows;
}

async function fetchOrgSnapshot(
  seasonId: string,
  database: DbOrTx
): Promise<
  { orgId: string; orgName: string | null; totalScore: number; members: number; averageScore: number }[]
> {
  const rows = await database
    .select({
      orgId: quizSeasonScore.orgId,
      orgName: organization.name,
      totalScore: sql<number>`COALESCE(SUM(${quizSeasonScore.score}), 0)::int`,
      members: sql<number>`COUNT(*)::int`
    })
    .from(quizSeasonScore)
    .leftJoin(organization, eq(quizSeasonScore.orgId, organization.id))
    .where(
      and(
        eq(quizSeasonScore.seasonId, seasonId),
        isNotNull(quizSeasonScore.orgId)
      )
    )
    .groupBy(quizSeasonScore.orgId, organization.name);
  return rows
    .filter((r): r is { orgId: string; orgName: string | null; totalScore: number; members: number } => r.orgId !== null)
    .map((r) => ({
      ...r,
      averageScore: r.members > 0 ? Math.round(r.totalScore / r.members) : 0
    }));
}

async function unlockRewardMascots(
  seasonId: string,
  leaderboard: LeaderboardRow[],
  database: DbOrTx
): Promise<void> {
  for (let i = 0; i < Math.min(3, leaderboard.length); i++) {
    const row = leaderboard[i]!;
    const ownedRows = await database
      .select({ mascotId: mascotUnlock.mascotId })
      .from(mascotUnlock)
      .where(eq(mascotUnlock.userId, row.userId));
    const owned = new Set(ownedRows.map((r) => r.mascotId));
    const seed = `${seasonId}:${row.userId}`;
    const reward =
      i === 0
        ? pickFromPool(RARE_MASCOTS, owned, seed) ??
          pickFromPool(COMMON_MASCOTS, owned, seed)
        : pickFromPool(COMMON_MASCOTS, owned, seed);
    if (!reward) continue;
    await database
      .insert(mascotUnlock)
      .values({ userId: row.userId, mascotId: reward, seasonId })
      .onConflictDoNothing({
        target: [mascotUnlock.userId, mascotUnlock.mascotId]
      });
  }
}

async function rotateWorkspaceSeason(
  workspaceId: string,
  monthLabel: string,
  database: DbLike
): Promise<{ ended: number; created: number }> {
  return database.transaction(async (tx) => {
    const active = await tx
      .select({
        id: quizSeason.id,
        name: quizSeason.name,
        startedAt: quizSeason.startedAt
      })
      .from(quizSeason)
      .where(
        and(eq(quizSeason.workspaceId, workspaceId), isNull(quizSeason.endedAt))
      )
      .orderBy(desc(quizSeason.startedAt))
      .limit(1);

    let ended = 0;
    if (active.length > 0) {
      const seasonId = active[0]!.id;
      const top = await fetchLeaderboard(seasonId, tx);
      const orgSnap = await fetchOrgSnapshot(seasonId, tx);
      const snapshot = {
        top,
        organizations: orgSnap,
        frozenAt: new Date().toISOString()
      };
      await tx
        .update(quizSeason)
        .set({
          endedAt: new Date(),
          leaderboardSnapshot: snapshot
        })
        .where(eq(quizSeason.id, seasonId));
      await unlockRewardMascots(seasonId, top, tx);
      ended = 1;
    }

    const existing = await tx
      .select({ id: quizSeason.id })
      .from(quizSeason)
      .where(
        and(
          eq(quizSeason.workspaceId, workspaceId),
          eq(quizSeason.name, monthLabel)
        )
      )
      .limit(1);
    if (existing.length === 0) {
      await tx.insert(quizSeason).values({
        workspaceId,
        name: monthLabel,
        startedAt: new Date()
      });
    }
    return { ended, created: existing.length === 0 ? 1 : 0 };
  });
}

export async function quizSeasonRotateHandler(
  _jobs: PgBoss.Job<Record<string, never>>[],
  database: DbLike = db,
  now: Date = new Date()
): Promise<{ rotated: number; skipped: boolean }> {
  const k = kstNow(now);
  if (k.day !== 1) {
    console.log(`[quiz-season-rotate] day=${k.day} (KST ${k.date}) — not 1st, skipping`);
    return { rotated: 0, skipped: true };
  }

  const workspaces = await database.select({ id: workspace.id }).from(workspace);
  let rotated = 0;
  for (const ws of workspaces) {
    try {
      const result = await rotateWorkspaceSeason(ws.id, k.monthLabel, database);
      console.log(
        `[quiz-season-rotate] workspace=${ws.id} ended=${result.ended} created=${result.created}`
      );
      rotated += result.ended;
    } catch (err) {
      console.error(
        `[quiz-season-rotate] workspace=${ws.id} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  return { rotated, skipped: false };
}

export const QUIZ_SEASON_ROTATE_QUEUE = "quiz-season-rotate";
export const QUIZ_SEASON_ROTATE_CRON = "1 15 * * *"; // KST 00:01 daily
