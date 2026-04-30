-- Code review HIGH G (2026-04-30) — popular_search 에 UNIQUE 인덱스 추가.
-- aggregate-popular cron handler 가 onConflictDoUpdate 의 conflict target 으로 사용한다.
-- 기존엔 UNIQUE 가 없어 .onConflictDoNothing() 이 PK(id) 기준으로만 동작 → 매 실행마다
-- 동일 (workspaceId, query, period) 의 중복 row 가 누적되는 idempotency 버그.
-- 현재 popular_search 행 0건 (검증 완료) 이라 backfill 불필요.

CREATE UNIQUE INDEX IF NOT EXISTS "popular_search_ws_query_period_unique"
  ON "popular_search" ("workspace_id", "query", "period");
