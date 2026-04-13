DROP INDEX "idx_case_cluster_workspace_numeric";--> statement-breakpoint
ALTER TABLE "precedent_case" ADD COLUMN "source_key" varchar(300);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_case_cluster_workspace_numeric" ON "case_cluster" USING btree ("workspace_id","numeric_cluster_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_precedent_case_source_key" ON "precedent_case" USING btree ("workspace_id","source_key") WHERE source_key IS NOT NULL;