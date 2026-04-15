ALTER TABLE "review_request" ADD COLUMN "kind" varchar(50);--> statement-breakpoint
CREATE INDEX "idx_review_request_ws_kind_status" ON "review_request" USING btree ("workspace_id","kind","status");