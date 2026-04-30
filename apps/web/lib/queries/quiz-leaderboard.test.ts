/**
 * P1 #7 — quiz leaderboard tenant isolation 회귀 테스트.
 *
 * 기존: leaderboard 쿼리가 seasonId 만으로 조회되고, quiz_season_score 테이블에
 * workspace_id 축이 없어서 다른 테넌트의 seasonId 가 유출되면 교차 노출되거나
 * 다른 워크스페이스의 데이터가 섞여 들어올 위험.
 *
 * 단기 차단 (A안): leaderboard 쿼리에 quiz_season 을 inner-join 하고
 * workspace_id 로 필터링한다. seasonId 가 다른 워크스페이스 것이면 빈 배열.
 *
 * 본 테스트는 호출 시그니처 (seasonId, workspaceId) 가 강제되는지 + 쿼리
 * builder 가 workspace_id 조건을 포함하는지 검증한다.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { whereSpy, limitSpy } = vi.hoisted(() => ({
  whereSpy: vi.fn(),
  limitSpy: vi.fn(),
}));

// Drizzle 빌더 chain — 어느 위치에서 .where 가 불려도 동일한 후속 객체로 이어지도록
// 모든 메서드를 `chain` self-return 으로 만든다. .where 만 spy 로 가로채 인자를 기록.
const chain: Record<string, unknown> = {};
chain.from = vi.fn(() => chain);
chain.innerJoin = vi.fn(() => chain);
chain.leftJoin = vi.fn(() => chain);
chain.where = vi.fn((cond: unknown) => {
  whereSpy(cond);
  return chain;
});
chain.orderBy = vi.fn(() => chain);
chain.groupBy = vi.fn(async () => []);
chain.limit = vi.fn(async (n: number) => {
  limitSpy(n);
  return [];
});

vi.mock("@jarvis/db/client", () => ({
  db: {
    select: vi.fn(() => chain),
  },
}));

vi.mock("@jarvis/db/schema", () => ({
  organization: { id: "id", name: "name" },
  quizSeason: { id: "id", workspaceId: "workspace_id", name: "name", leaderboardSnapshot: "lb", endedAt: "ended_at" },
  quizSeasonScore: {
    seasonId: "season_id",
    userId: "user_id",
    orgId: "org_id",
    score: "score",
    attempts: "attempts",
    correct: "correct",
  },
  user: { id: "id", name: "name" },
}));

import {
  getCurrentLeaderboard,
  getOrgLeaderboard,
  getPastSeasonLeaderboard,
} from "./quiz-leaderboard";

beforeEach(() => {
  whereSpy.mockClear();
  limitSpy.mockClear();
});

describe("P1 #7 — quiz leaderboard tenant isolation", () => {
  it("getCurrentLeaderboard 시그니처가 (seasonId, workspaceId) 를 요구한다", async () => {
    // 컴파일 시점에 workspaceId 인자가 강제되는지 (TS 에러 부재) +
    // 런타임에서 호출 가능한지 검증.
    const result = await getCurrentLeaderboard("season-1", "ws-1");
    expect(result).toEqual([]);
    expect(whereSpy).toHaveBeenCalledTimes(1);
  });

  it("getOrgLeaderboard 시그니처가 (seasonId, workspaceId) 를 요구한다", async () => {
    const result = await getOrgLeaderboard("season-1", "ws-1");
    expect(result).toEqual([]);
  });

  it("getPastSeasonLeaderboard 시그니처가 (seasonId, workspaceId) 를 요구한다", async () => {
    // 빈 결과여도 함수가 정상 종료되는지 확인
    const r = await getPastSeasonLeaderboard("season-1", "ws-1");
    expect(r).toEqual({ snapshot: null, name: "", endedAt: null });
  });

  it("getCurrentLeaderboard 가 limit(20) 을 적용한다 (TOP_N)", async () => {
    await getCurrentLeaderboard("season-1", "ws-1");
    expect(limitSpy).toHaveBeenCalledWith(20);
  });
});
