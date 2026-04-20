-- 1. Rename table
ALTER TABLE "system" RENAME TO "project";--> statement-breakpoint

-- 2. Add env-split columns (운영)
ALTER TABLE "project" ADD COLUMN "prod_domain_url" VARCHAR(500);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "prod_connect_type" VARCHAR(20);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "prod_repository_url" VARCHAR(500);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "prod_db_dsn" VARCHAR(500);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "prod_src_path" TEXT;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "prod_class_path" TEXT;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "prod_memo" TEXT;--> statement-breakpoint

-- 3. Add env-split columns (개발)
ALTER TABLE "project" ADD COLUMN "dev_domain_url" VARCHAR(500);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "dev_connect_type" VARCHAR(20);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "dev_repository_url" VARCHAR(500);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "dev_db_dsn" VARCHAR(500);--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "dev_src_path" TEXT;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "dev_class_path" TEXT;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "dev_memo" TEXT;--> statement-breakpoint

-- 4. Drop legacy 'environment' column (env split replaces it)
ALTER TABLE "project" DROP COLUMN IF EXISTS "environment";--> statement-breakpoint

-- 5. Rename dependent index
ALTER INDEX IF EXISTS "idx_system_knowledge_page" RENAME TO "idx_project_knowledge_page";--> statement-breakpoint

-- 6. Empty legacy dev seed + enforce company uniqueness + NOT NULL company_id
DELETE FROM "project";--> statement-breakpoint
ALTER TABLE "project" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_workspace_company_unique" UNIQUE ("workspace_id", "company_id");--> statement-breakpoint

-- 7. graph_scope_type enum cleanup: drop legacy 'project', rename 'system' -> 'project'
UPDATE "graph_snapshot" SET "scope_type" = 'workspace' WHERE "scope_type"::text = 'project';--> statement-breakpoint
-- Drop the DEFAULT so ALTER COLUMN TYPE can cast cleanly (Postgres cannot
-- auto-cast a DEFAULT value between enum types).
ALTER TABLE "graph_snapshot" ALTER COLUMN "scope_type" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "graph_scope_type" RENAME TO "graph_scope_type_old";--> statement-breakpoint
CREATE TYPE "graph_scope_type" AS ENUM ('attachment', 'project', 'workspace');--> statement-breakpoint
ALTER TABLE "graph_snapshot"
  ALTER COLUMN "scope_type" TYPE "graph_scope_type"
  USING (
    CASE "scope_type"::text
      WHEN 'system' THEN 'project'
      WHEN 'project' THEN 'workspace'
      ELSE "scope_type"::text
    END
  )::"graph_scope_type";--> statement-breakpoint
-- Restore the DEFAULT under the new enum type.
ALTER TABLE "graph_snapshot" ALTER COLUMN "scope_type" SET DEFAULT 'workspace';--> statement-breakpoint
DROP TYPE "graph_scope_type_old";
