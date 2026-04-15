CREATE TABLE IF NOT EXISTS "llm_call_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"request_id" varchar(64),
	"model" varchar(100) NOT NULL,
	"prompt_version" varchar(50),
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"status" varchar(30) NOT NULL,
	"blocked_by" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid,
	"document_type" text NOT NULL,
	"reason" text NOT NULL,
	"matched_keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" uuid
);
--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='knowledge_claim' AND column_name='claim_source') THEN ALTER TABLE "knowledge_claim" ADD COLUMN "claim_source" varchar(30) DEFAULT 'manual' NOT NULL; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='knowledge_claim' AND column_name='sort_order') THEN ALTER TABLE "knowledge_claim" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='raw_source' AND column_name='sensitivity') THEN ALTER TABLE "raw_source" ADD COLUMN "sensitivity" varchar(30) DEFAULT 'INTERNAL' NOT NULL; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='llm_call_log_workspace_id_workspace_id_fk') THEN ALTER TABLE "llm_call_log" ADD CONSTRAINT "llm_call_log_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='review_queue_workspace_id_workspace_id_fk') THEN ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action; END IF; END $$;--> statement-breakpoint
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='review_queue_reviewed_by_user_id_user_id_fk') THEN ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action; END IF; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_llm_call_log_workspace" ON "llm_call_log" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_llm_call_log_request" ON "llm_call_log" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_llm_call_log_created_at" ON "llm_call_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_llm_call_log_budget" ON "llm_call_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_queue_ws_status_idx" ON "review_queue" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "review_queue_ws_created_idx" ON "review_queue" USING btree ("workspace_id","created_at");
