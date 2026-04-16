-- Phase-W4 (참조 전용): document_chunks 테이블 DROP
--
-- ⚠️  이 파일은 실행하지 않아도 됩니다.
--
-- 실제 DROP은 Drizzle 마이그레이션 체인(0019_absurd_scarlet_witch.sql)에
-- 이미 포함되어 있습니다. `pnpm db:migrate` 실행 시 자동으로 적용됩니다.
-- drizzle.config.ts의 tablesFilter: ["!document_chunks"]는 이후 db:generate가
-- 같은 DROP을 재생성하지 않도록 막는 안전장치입니다.
--
-- 이 파일은 의도 문서화 목적으로만 유지됩니다.

DROP TABLE IF EXISTS "document_chunks" CASCADE;
