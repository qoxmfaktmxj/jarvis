CREATE TABLE "wiki_page_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"path" varchar(500) NOT NULL,
	"title" varchar(200) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"type" varchar(20) NOT NULL,
	"authority" varchar(10) NOT NULL,
	"sensitivity" varchar(30) DEFAULT 'INTERNAL' NOT NULL,
	"required_permission" varchar(50),
	"frontmatter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"git_sha" varchar(40) NOT NULL,
	"stale" boolean DEFAULT false NOT NULL,
	"published_status" varchar(10) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_page_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"from_page_id" uuid NOT NULL,
	"to_page_id" uuid,
	"to_path" varchar(500),
	"alias" varchar(200),
	"anchor" varchar(200),
	"kind" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_page_source_ref" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"raw_source_id" uuid NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '1.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_commit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"commit_sha" varchar(40) NOT NULL,
	"operation" varchar(20) NOT NULL,
	"author_type" varchar(10) NOT NULL,
	"author_ref" varchar(200),
	"affected_pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reasoning" text,
	"source_ref_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_review_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" varchar(30) NOT NULL,
	"affected_pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"commit_sha" varchar(40),
	"description" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar(30) DEFAULT 'pending' NOT NULL,
	"assigned_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "wiki_lint_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"report_date" date NOT NULL,
	"orphan_count" integer DEFAULT 0 NOT NULL,
	"broken_link_count" integer DEFAULT 0 NOT NULL,
	"no_outlink_count" integer DEFAULT 0 NOT NULL,
	"contradiction_count" integer DEFAULT 0 NOT NULL,
	"stale_count" integer DEFAULT 0 NOT NULL,
	"report_path" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "wiki_page_index" ADD CONSTRAINT "wiki_page_index_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_link" ADD CONSTRAINT "wiki_page_link_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_link" ADD CONSTRAINT "wiki_page_link_from_page_id_wiki_page_index_id_fk" FOREIGN KEY ("from_page_id") REFERENCES "public"."wiki_page_index"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_link" ADD CONSTRAINT "wiki_page_link_to_page_id_wiki_page_index_id_fk" FOREIGN KEY ("to_page_id") REFERENCES "public"."wiki_page_index"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_source_ref" ADD CONSTRAINT "wiki_page_source_ref_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_source_ref" ADD CONSTRAINT "wiki_page_source_ref_page_id_wiki_page_index_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."wiki_page_index"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_source_ref" ADD CONSTRAINT "wiki_page_source_ref_raw_source_id_raw_source_id_fk" FOREIGN KEY ("raw_source_id") REFERENCES "public"."raw_source"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_commit_log" ADD CONSTRAINT "wiki_commit_log_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_commit_log" ADD CONSTRAINT "wiki_commit_log_source_ref_id_raw_source_id_fk" FOREIGN KEY ("source_ref_id") REFERENCES "public"."raw_source"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_review_queue" ADD CONSTRAINT "wiki_review_queue_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_review_queue" ADD CONSTRAINT "wiki_review_queue_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_review_queue" ADD CONSTRAINT "wiki_review_queue_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_lint_report" ADD CONSTRAINT "wiki_lint_report_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_page_index_ws_path_uniq" ON "wiki_page_index" USING btree ("workspace_id","path");--> statement-breakpoint
CREATE INDEX "wiki_page_index_ws_type_published_idx" ON "wiki_page_index" USING btree ("workspace_id","type","published_status");--> statement-breakpoint
CREATE INDEX "wiki_page_index_aliases_gin" ON "wiki_page_index" USING gin (("frontmatter" -> 'aliases'));--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_page_link_from_to_uniq" ON "wiki_page_link" USING btree ("from_page_id","to_path","alias","anchor");--> statement-breakpoint
CREATE INDEX "wiki_page_link_to_page_idx" ON "wiki_page_link" USING btree ("to_page_id");--> statement-breakpoint
CREATE INDEX "wiki_page_link_to_path_idx" ON "wiki_page_link" USING btree ("to_path");--> statement-breakpoint
CREATE INDEX "wiki_page_link_ws_idx" ON "wiki_page_link" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "wiki_page_source_ref_page_idx" ON "wiki_page_source_ref" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "wiki_page_source_ref_source_idx" ON "wiki_page_source_ref" USING btree ("raw_source_id");--> statement-breakpoint
CREATE INDEX "wiki_page_source_ref_ws_idx" ON "wiki_page_source_ref" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_commit_log_commit_sha_uniq" ON "wiki_commit_log" USING btree ("commit_sha");--> statement-breakpoint
CREATE INDEX "wiki_commit_log_ws_created_idx" ON "wiki_commit_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "wiki_commit_log_operation_idx" ON "wiki_commit_log" USING btree ("operation");--> statement-breakpoint
CREATE INDEX "wiki_review_queue_ws_status_idx" ON "wiki_review_queue" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "wiki_review_queue_ws_kind_status_idx" ON "wiki_review_queue" USING btree ("workspace_id","kind","status");--> statement-breakpoint
CREATE INDEX "wiki_review_queue_ws_created_idx" ON "wiki_review_queue" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_lint_report_ws_date_uniq" ON "wiki_lint_report" USING btree ("workspace_id","report_date");