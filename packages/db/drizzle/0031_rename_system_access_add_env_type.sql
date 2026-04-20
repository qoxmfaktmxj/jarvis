-- 1. Rename table
ALTER TABLE "system_access" RENAME TO "project_access";--> statement-breakpoint

-- 2. Rename column system_id → project_id
ALTER TABLE "project_access" RENAME COLUMN "system_id" TO "project_id";--> statement-breakpoint

-- 3. Add env_type column (nullable first, backfill default, then NOT NULL)
ALTER TABLE "project_access" ADD COLUMN "env_type" VARCHAR(10);--> statement-breakpoint
-- No existing rows expected (dev DB cleared in P1-A), but safe backfill:
UPDATE "project_access" SET "env_type" = 'prod' WHERE "env_type" IS NULL;--> statement-breakpoint
ALTER TABLE "project_access" ALTER COLUMN "env_type" SET NOT NULL;--> statement-breakpoint

-- 4. Create new index (no old idx_system_access_system existed in 0030 snapshot)
CREATE INDEX IF NOT EXISTS "idx_project_access_project" ON "project_access"("project_id");--> statement-breakpoint

-- 5. Rename FK constraints (drop old, recreate with new names)
ALTER TABLE "project_access" DROP CONSTRAINT IF EXISTS "system_access_system_id_system_id_fk";--> statement-breakpoint
ALTER TABLE "project_access" DROP CONSTRAINT IF EXISTS "system_access_workspace_id_workspace_id_fk";--> statement-breakpoint
ALTER TABLE "project_access" ADD CONSTRAINT "project_access_project_id_project_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_access" ADD CONSTRAINT "project_access_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id");
