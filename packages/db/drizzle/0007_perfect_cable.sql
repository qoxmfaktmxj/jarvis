CREATE INDEX "idx_knowledge_page_source_origin" ON "knowledge_page" USING btree ("workspace_id","source_origin");--> statement-breakpoint
CREATE INDEX "idx_knowledge_page_version_page" ON "knowledge_page_version" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "idx_case_cluster_digest_case" ON "case_cluster" USING btree ("digest_case_id","workspace_id");--> statement-breakpoint
CREATE INDEX "idx_case_cluster_digest_page" ON "case_cluster" USING btree ("digest_page_id","workspace_id");--> statement-breakpoint
CREATE INDEX "idx_precedent_case_digest_page" ON "precedent_case" USING btree ("digest_page_id","workspace_id");