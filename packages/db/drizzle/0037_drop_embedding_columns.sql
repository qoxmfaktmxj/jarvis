-- Phase-Harness E1 (2026-04-23): embedding 파이프라인 폐지.
-- Ask AI 가 tool-use agent 로 wiki-fs 를 직접 탐색하는 구조로 전환됨에 따라
-- pgvector / HNSW / IVFFLAT 벡터 검색이 더 이상 필요하지 않다.
--
-- 데이터 손실은 의도적. `knowledge_page.embedding` 은 이미 전량 NULL
-- (2026-04-23 확인: embed_cache 0건, llm_call_log.op='embed' 0회) 이므로
-- 실제 사용자 데이터 손실은 없다. `knowledge_claim.embedding` 은 초기
-- Phase-W5 당시 생성됐을 수 있으나 이후 계획이 page-first retrieval 로
-- 바뀌면서 쓰이지 않는 상태.

DROP INDEX IF EXISTS "idx_knowledge_page_embedding_hnsw";
DROP INDEX IF EXISTS "idx_kc_embedding";

ALTER TABLE "knowledge_page"
  DROP COLUMN IF EXISTS "embedding",
  DROP COLUMN IF EXISTS "last_embedded_at";

ALTER TABLE "knowledge_claim"
  DROP COLUMN IF EXISTS "embedding";

ALTER TABLE "precedent_case"
  DROP COLUMN IF EXISTS "embedding";
