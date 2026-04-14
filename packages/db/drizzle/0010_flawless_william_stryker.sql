CREATE TABLE "llm_call_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"request_id" varchar(64),
	"model" varchar(100) NOT NULL,
	"prompt_version" varchar(50),
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"status" varchar(30) NOT NULL,
	"blocked_by" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_call_log" ADD CONSTRAINT "llm_call_log_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_llm_call_log_workspace" ON "llm_call_log" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_llm_call_log_request" ON "llm_call_log" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "idx_llm_call_log_created_at" ON "llm_call_log" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_graph_community_snapshot_community" ON "graph_community" USING btree ("snapshot_id","community_id");