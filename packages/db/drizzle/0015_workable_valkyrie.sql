CREATE TABLE "llm_call_log" (
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
CREATE TABLE "review_queue" (
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
ALTER TABLE "knowledge_claim" ADD COLUMN "claim_source" varchar(30) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_claim" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "raw_source" ADD COLUMN "sensitivity" varchar(30) DEFAULT 'INTERNAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_call_log" ADD CONSTRAINT "llm_call_log_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_queue" ADD CONSTRAINT "review_queue_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_llm_call_log_workspace" ON "llm_call_log" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_llm_call_log_request" ON "llm_call_log" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_llm_call_log_created_at" ON "llm_call_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_llm_call_log_budget" ON "llm_call_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "review_queue_ws_status_idx" ON "review_queue" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "review_queue_ws_created_idx" ON "review_queue" USING btree ("workspace_id","created_at");