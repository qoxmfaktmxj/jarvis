CREATE TABLE "answer_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"question" text NOT NULL,
	"answer_preview" varchar(300),
	"lane" varchar(40),
	"source_refs" jsonb DEFAULT '[]'::jsonb,
	"rating" varchar(10) NOT NULL,
	"comment" text,
	"total_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answer_feedback" ADD CONSTRAINT "answer_feedback_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_feedback" ADD CONSTRAINT "answer_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_af_workspace_created" ON "answer_feedback" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_af_rating" ON "answer_feedback" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "idx_af_lane" ON "answer_feedback" USING btree ("lane");
-- NOTE: graph_community unique index was in the auto-generated diff but is unrelated
--       to this change. Split into its own migration with duplicate-row cleanup
--       before applying to production.