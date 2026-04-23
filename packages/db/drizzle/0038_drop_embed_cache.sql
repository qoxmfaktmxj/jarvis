-- Phase-Harness E2 (2026-04-23): embedding cache 테이블 폐지.
-- 0037 에서 컬럼을 드롭했으므로 cache 만 남길 이유가 없다.

DROP TABLE IF EXISTS "embed_cache" CASCADE;
