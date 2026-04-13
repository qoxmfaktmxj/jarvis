CREATE INDEX "idx_knowledge_claim_page" ON "knowledge_claim" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "idx_system_knowledge_page" ON "system" USING btree ("knowledge_page_id");--> statement-breakpoint
CREATE INDEX "idx_review_request_page" ON "review_request" USING btree ("page_id");