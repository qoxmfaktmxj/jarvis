CREATE TYPE "public"."graph_scope_type" AS ENUM('attachment', 'project', 'system', 'workspace');--> statement-breakpoint
ALTER TABLE "knowledge_page" ADD COLUMN "source_type" varchar(50);--> statement-breakpoint
ALTER TABLE "knowledge_page" ADD COLUMN "source_key" varchar(1000);--> statement-breakpoint
ALTER TABLE "graph_snapshot" ADD COLUMN "scope_type" "graph_scope_type" DEFAULT 'workspace' NOT NULL;--> statement-breakpoint
-- graph_snapshot.scope_id: add as nullable, backfill, then enforce NOT NULL
ALTER TABLE "graph_snapshot" ADD COLUMN "scope_id" uuid;--> statement-breakpoint
UPDATE "graph_snapshot"
SET "scope_type" = CASE
      WHEN "raw_source_id" IS NOT NULL THEN 'attachment'::"graph_scope_type"
      ELSE 'workspace'::"graph_scope_type"
    END,
    "scope_id" = COALESCE("raw_source_id", "workspace_id");--> statement-breakpoint
ALTER TABLE "graph_snapshot" ALTER COLUMN "scope_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "graph_snapshot" ADD COLUMN "sensitivity" varchar(30) NOT NULL DEFAULT 'INTERNAL';--> statement-breakpoint
CREATE UNIQUE INDEX "idx_knowledge_page_external_key" ON "knowledge_page" USING btree ("workspace_id","source_type","source_key") WHERE source_type IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_graph_snapshot_scope" ON "graph_snapshot" USING btree ("workspace_id","scope_type","scope_id","build_status");