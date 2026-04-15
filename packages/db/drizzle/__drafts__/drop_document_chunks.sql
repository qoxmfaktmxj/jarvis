-- packages/db/drizzle/__drafts__/drop_document_chunks.sql
--
-- ⚠️  DRAFT — CI migration에서 제외됨 (drizzle meta/_journal.json 미등록)
-- ⚠️  drizzle-kit은 `drizzle/meta/_journal.json`에 등록된 파일만 실행하며,
--     `__drafts__/` 하위는 journal에 없으므로 `pnpm db:migrate`가 자동 실행하지 않는다.
--
-- ⚠️  실행 조건: T4 feature flag (FEATURE_WIKI_FS_MODE) = true 상태로
--              운영 안정 48시간 이상 확인 후 (W3-gate.md T4 기준)
--              + wiki_page_index 레코드 수 검증 완료 후
--              + 운영팀 승인 후에만 수동 실행
--
-- 목적: document_chunks 테이블 제거 (Phase-W 이후 wiki_page_index로 대체)
-- 참조: Phase-W2 완료 (2026-04-15), T4 안정화 이후 실행 예정
--
-- 주의: document_chunks는 Lane A (OpenAI 1536d 임베딩) 본체로 설계됐으나,
--       Phase-W에서 wiki 스코프는 wiki_page_index로 전환됨. 다른 document_type
--       (예: precedent_case는 별도 테이블 Lane B) 사용처가 남아 있는지
--       반드시 재확인한 뒤에만 drop 한다.

-- ───────────────────────────────────────────────────────────────
-- Step 1: 인덱스 제거
-- ───────────────────────────────────────────────────────────────
-- manual/0011_document_chunks_ivfflat.sql 에서 수동 생성된 ANN 인덱스
DROP INDEX IF EXISTS document_chunks_vec_idx;

-- packages/db/schema/document-chunks.ts 에서 생성된 인덱스
DROP INDEX IF EXISTS document_chunks_doc_chunk_uniq;
DROP INDEX IF EXISTS document_chunks_doc_idx;
DROP INDEX IF EXISTS document_chunks_hash_idx;
DROP INDEX IF EXISTS document_chunks_ws_idx;

-- ───────────────────────────────────────────────────────────────
-- Step 2: 테이블 제거
-- ───────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS document_chunks;

-- ───────────────────────────────────────────────────────────────
-- 롤백 (필요 시)
-- ───────────────────────────────────────────────────────────────
-- 1. packages/db/schema/document-chunks.ts 의 DDL을 참고해 테이블 재생성
--    (workspace_id → workspace.id FK, vector(1536) embedding, sensitivity 등)
-- 2. packages/db/drizzle/manual/0011_document_chunks_ivfflat.sql 재적용
--    CREATE INDEX document_chunks_vec_idx
--      ON document_chunks USING ivfflat (embedding vector_cosine_ops)
--      WITH (lists = 100);
-- 3. packages/db/schema/document-chunks.ts 의 인덱스 4개 재생성
--    (document_chunks_doc_chunk_uniq / doc_idx / hash_idx / ws_idx)
