-- Add user_status enum
DO $$ BEGIN
  CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive', 'locked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add new columns (nullable first to allow backfill)
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "job_title" varchar(50);
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "is_outsourced" boolean DEFAULT false NOT NULL;
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "status" "user_status";

-- Backfill status from existing is_active
UPDATE "user"
SET "status" = CASE WHEN "is_active" THEN 'active'::user_status ELSE 'inactive'::user_status END
WHERE "status" IS NULL;

-- Set NOT NULL and default on status
ALTER TABLE "user" ALTER COLUMN "status" SET NOT NULL;
ALTER TABLE "user" ALTER COLUMN "status" SET DEFAULT 'active';

-- Index for filter queries
CREATE INDEX IF NOT EXISTS "user_workspace_status_idx" ON "user" ("workspace_id", "status");

-- Remove legacy is_active column
ALTER TABLE "user" DROP COLUMN IF EXISTS "is_active";

-- Unique constraints required for idempotent seed (ON CONFLICT targets these).
CREATE UNIQUE INDEX IF NOT EXISTS "code_group_ws_code_uniq"
  ON "code_group" ("workspace_id", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "code_item_group_code_uniq"
  ON "code_item" ("group_id", "code");

-- Seed POSITION and JOB_TITLE group codes for every existing workspace.
WITH workspaces AS (
  SELECT id AS workspace_id FROM workspace
),
seeded_groups AS (
  INSERT INTO code_group (workspace_id, code, name, is_active)
  SELECT workspace_id, g.code, g.name, true
  FROM workspaces
  CROSS JOIN (VALUES
    ('POSITION',  '직위'),
    ('JOB_TITLE', '직책')
  ) AS g(code, name)
  ON CONFLICT ("workspace_id", "code") DO NOTHING
  RETURNING id, workspace_id, code
),
all_groups AS (
  SELECT id, workspace_id, code FROM code_group
  WHERE code IN ('POSITION', 'JOB_TITLE')
)
INSERT INTO code_item (group_id, code, name, sort_order, is_active)
SELECT g.id, i.code, i.name, i.sort_order, true
FROM all_groups g
JOIN (VALUES
  ('POSITION',  'EXECUTIVE',  '임원', 10),
  ('POSITION',  'PRINCIPAL',  '수석', 20),
  ('POSITION',  'SENIOR',     '책임', 30),
  ('POSITION',  'ASSOCIATE',  '선임', 40),
  ('JOB_TITLE', 'TEAM_LEAD',  '팀장', 10),
  ('JOB_TITLE', 'PART_LEAD',  '파트장', 20),
  ('JOB_TITLE', 'MEMBER',     '팀원', 30)
) AS i(group_code, code, name, sort_order) ON i.group_code = g.code
ON CONFLICT ("group_id", "code") DO NOTHING;
