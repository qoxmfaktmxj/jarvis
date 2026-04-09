CREATE TYPE "public"."build_status" AS ENUM('pending', 'running', 'done', 'error');--> statement-breakpoint
ALTER TABLE "graph_snapshot" DROP CONSTRAINT "graph_snapshot_workspace_id_workspace_id_fk";
--> statement-breakpoint
ALTER TABLE "graph_snapshot" DROP CONSTRAINT "graph_snapshot_raw_source_id_raw_source_id_fk";
--> statement-breakpoint
ALTER TABLE "graph_snapshot" DROP CONSTRAINT "graph_snapshot_created_by_user_id_fk";
--> statement-breakpoint
DROP INDEX "idx_graph_snapshot_status";--> statement-breakpoint
ALTER TABLE "graph_snapshot" ALTER COLUMN "build_status" SET DEFAULT 'pending'::"public"."build_status";--> statement-breakpoint
ALTER TABLE "graph_snapshot" ALTER COLUMN "build_status" SET DATA TYPE "public"."build_status" USING "build_status"::"public"."build_status";--> statement-breakpoint
ALTER TABLE "graph_snapshot" ALTER COLUMN "build_error" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "graph_snapshot" ADD CONSTRAINT "graph_snapshot_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_snapshot" ADD CONSTRAINT "graph_snapshot_raw_source_id_raw_source_id_fk" FOREIGN KEY ("raw_source_id") REFERENCES "public"."raw_source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_snapshot" ADD CONSTRAINT "graph_snapshot_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_graph_snapshot_workspace_status" ON "graph_snapshot" USING btree ("workspace_id","build_status");