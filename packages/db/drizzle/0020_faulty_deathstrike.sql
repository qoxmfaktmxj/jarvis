ALTER TABLE "llm_call_log" ADD COLUMN "op" varchar(50);--> statement-breakpoint
CREATE INDEX "idx_llm_call_log_op" ON "llm_call_log" USING btree ("op");