-- Phase-CompanyMaster 1 (2026-04-30) — Oracle TMST001 마스터 그리드 매핑.
-- representative varchar(100)를 의미상 잘못된 모델링으로 판단해 boolean represent_company로 재매핑.
-- 추가 컬럼: object_div(C10100 대상구분), manage_div, zip, updated_by.
-- 신규 unique index: (workspace_id, code, object_div) — Oracle PK 의미 보존.
-- Pre: company.representative는 Phase 0 단계에서 빈 컬럼이다 (data drop 허용).
-- 관련 schema: packages/db/schema/company.ts.

ALTER TABLE "company" DROP COLUMN IF EXISTS "representative";
--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "object_div" varchar(10) NOT NULL DEFAULT '001';
--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "manage_div" varchar(50);
--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "represent_company" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "zip" varchar(10);
--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "updated_by" varchar(50);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_ws_code_objdiv_unique" ON "company" ("workspace_id", "code", "object_div");
