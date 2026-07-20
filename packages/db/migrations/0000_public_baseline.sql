CREATE TYPE "public"."account_type" AS ENUM('human', 'demo');--> statement-breakpoint
CREATE TYPE "public"."menu_kind" AS ENUM('group', 'page');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'in_review', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."role_code" AS ENUM('ADMIN', 'EDITOR', 'READER');--> statement-breakpoint
CREATE TYPE "public"."source_parse_status" AS ENUM('stored', 'parsed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('law', 'case', 'interpretation', 'guide');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."wiki_page_type" AS ENUM('source', 'concept', 'case', 'guide', 'synthesis');--> statement-breakpoint
CREATE TYPE "public"."wiki_publish_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."wiki_zone" AS ENUM('auto', 'manual');--> statement-breakpoint
CREATE TABLE "answer_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"answer_message_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answer_feedback_rating" CHECK ("answer_feedback"."rating" IN (-1, 1))
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"password_hash" varchar(255),
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"account_type" "account_type" DEFAULT 'human' NOT NULL,
	"expires_at" timestamp with time zone,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_password_contract" CHECK ((
        "app_user"."account_type" = 'demo'
        AND "app_user"."password_hash" IS NULL
        AND "app_user"."expires_at" IS NOT NULL
      ) OR (
        "app_user"."account_type" = 'human'
        AND "app_user"."password_hash" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "ask_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(240),
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ask_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tool_name" varchar(80),
	"token_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"action" varchar(120) NOT NULL,
	"resource_type" varchar(120) NOT NULL,
	"resource_id" varchar(160),
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(500),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(500),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_revision_id" uuid NOT NULL,
	"court_or_agency" varchar(160) NOT NULL,
	"case_number" varchar(120) NOT NULL,
	"decision_date" date NOT NULL,
	"case_type" varchar(100) NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"holding_summary" text NOT NULL,
	"disposition" text,
	"cited_provisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_vector" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_call_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"call_id" varchar(200) NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"provider" varchar(80) NOT NULL,
	"model" varchar(120) NOT NULL,
	"purpose" varchar(80) NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"latency_ms" integer,
	"success" boolean DEFAULT true NOT NULL,
	"error_code" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"parent_id" uuid,
	"code" varchar(64) NOT NULL,
	"label" varchar(80) NOT NULL,
	"description" varchar(300),
	"kind" "menu_kind" NOT NULL,
	"icon" varchar(50),
	"route_path" varchar(300),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_item_route_contract" CHECK ((
        "menu_item"."kind" = 'group'
        AND "menu_item"."route_path" IS NULL
      ) OR (
        "menu_item"."kind" = 'page'
        AND "menu_item"."route_path" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "menu_permission" (
	"workspace_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "menu_permission_menu_item_id_permission_id_pk" PRIMARY KEY("menu_item_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "permission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(80) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"code" "role_code" NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"workspace_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permission_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "search_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid,
	"query" text NOT NULL,
	"scope" varchar(40) NOT NULL,
	"result_count" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" varchar(80) NOT NULL,
	"source_type" "source_type" NOT NULL,
	"external_id" varchar(180) NOT NULL,
	"title" varchar(300) NOT NULL,
	"canonical_url" varchar(500) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_vector" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_document_id" uuid NOT NULL,
	"revision_key" varchar(180) NOT NULL,
	"published_at" timestamp with time zone,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"retrieved_at" timestamp with time zone NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"raw_object_key" varchar(500) NOT NULL,
	"normalized_object_key" varchar(500) NOT NULL,
	"mime_type" varchar(160) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"parse_status" "source_parse_status" DEFAULT 'parsed' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_revision_size_nonnegative" CHECK ("source_revision"."size_bytes" >= 0),
	CONSTRAINT "source_revision_effective_range" CHECK ("source_revision"."effective_to" IS NULL OR "source_revision"."effective_from" IS NULL OR "source_revision"."effective_to" >= "source_revision"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "user_role" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_role_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "user_session" (
	"session_token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_commit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"commit_sha" varchar(40) NOT NULL,
	"operation" varchar(30) NOT NULL,
	"author_type" varchar(20) NOT NULL,
	"author_ref" varchar(200),
	"affected_pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reasoning" text,
	"source_revision_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
CREATE TABLE "wiki_page_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"path" varchar(500) NOT NULL,
	"title" varchar(240) NOT NULL,
	"slug" varchar(240) NOT NULL,
	"zone" "wiki_zone" NOT NULL,
	"page_type" "wiki_page_type" NOT NULL,
	"frontmatter" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"git_sha" varchar(40) NOT NULL,
	"stale" boolean DEFAULT false NOT NULL,
	"published_status" "wiki_publish_status" DEFAULT 'draft' NOT NULL,
	"freshness_sla_days" integer,
	"snippet" varchar(500) NOT NULL,
	"search_vector" "tsvector",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wiki_page_index_path_scope" CHECK (("wiki_page_index"."zone" = 'auto' AND "wiki_page_index"."path" LIKE 'auto/%') OR ("wiki_page_index"."zone" = 'manual' AND "wiki_page_index"."path" LIKE 'manual/%'))
);
--> statement-breakpoint
CREATE TABLE "wiki_page_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"from_page_id" uuid NOT NULL,
	"to_page_id" uuid,
	"to_path" varchar(500) NOT NULL,
	"alias" varchar(200),
	"anchor" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wiki_page_source_ref" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"source_revision_id" uuid NOT NULL,
	"locator" varchar(300) NOT NULL,
	"effective_date" date,
	"confidence" numeric(4, 3) DEFAULT '1.000' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wiki_page_source_ref_confidence" CHECK ("wiki_page_source_ref"."confidence" >= 0 AND "wiki_page_source_ref"."confidence" <= 1)
);
--> statement-breakpoint
CREATE TABLE "wiki_review_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" varchar(40) NOT NULL,
	"source_revision_id" uuid,
	"affected_pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"commit_sha" varchar(40),
	"description" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "review_status" DEFAULT 'pending' NOT NULL,
	"assigned_to" uuid,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answer_feedback" ADD CONSTRAINT "answer_feedback_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_feedback" ADD CONSTRAINT "answer_feedback_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_feedback" ADD CONSTRAINT "answer_feedback_answer_message_id_ask_message_id_fk" FOREIGN KEY ("answer_message_id") REFERENCES "public"."ask_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_conversation" ADD CONSTRAINT "ask_conversation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_conversation" ADD CONSTRAINT "ask_conversation_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_message" ADD CONSTRAINT "ask_message_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_message" ADD CONSTRAINT "ask_message_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ask_message" ADD CONSTRAINT "ask_message_conversation_id_ask_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ask_conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_group" ADD CONSTRAINT "code_group_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_item" ADD CONSTRAINT "code_item_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_item" ADD CONSTRAINT "code_item_group_id_code_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."code_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_case" ADD CONSTRAINT "legal_case_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_case" ADD CONSTRAINT "legal_case_source_revision_id_source_revision_id_fk" FOREIGN KEY ("source_revision_id") REFERENCES "public"."source_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_call_log" ADD CONSTRAINT "llm_call_log_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_call_log" ADD CONSTRAINT "llm_call_log_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_parent_id_menu_item_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."menu_item"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_permission" ADD CONSTRAINT "menu_permission_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_permission" ADD CONSTRAINT "menu_permission_menu_item_id_menu_item_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_permission" ADD CONSTRAINT "menu_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_log" ADD CONSTRAINT "search_log_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_log" ADD CONSTRAINT "search_log_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_document" ADD CONSTRAINT "source_document_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_revision" ADD CONSTRAINT "source_revision_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_revision" ADD CONSTRAINT "source_revision_source_document_id_source_document_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."source_document"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_session" ADD CONSTRAINT "user_session_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_session" ADD CONSTRAINT "user_session_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_commit_log" ADD CONSTRAINT "wiki_commit_log_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_commit_log" ADD CONSTRAINT "wiki_commit_log_source_revision_id_source_revision_id_fk" FOREIGN KEY ("source_revision_id") REFERENCES "public"."source_revision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_lint_report" ADD CONSTRAINT "wiki_lint_report_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_index" ADD CONSTRAINT "wiki_page_index_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_link" ADD CONSTRAINT "wiki_page_link_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_link" ADD CONSTRAINT "wiki_page_link_from_page_id_wiki_page_index_id_fk" FOREIGN KEY ("from_page_id") REFERENCES "public"."wiki_page_index"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_link" ADD CONSTRAINT "wiki_page_link_to_page_id_wiki_page_index_id_fk" FOREIGN KEY ("to_page_id") REFERENCES "public"."wiki_page_index"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_source_ref" ADD CONSTRAINT "wiki_page_source_ref_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_source_ref" ADD CONSTRAINT "wiki_page_source_ref_page_id_wiki_page_index_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."wiki_page_index"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_page_source_ref" ADD CONSTRAINT "wiki_page_source_ref_source_revision_id_source_revision_id_fk" FOREIGN KEY ("source_revision_id") REFERENCES "public"."source_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_review_queue" ADD CONSTRAINT "wiki_review_queue_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_review_queue" ADD CONSTRAINT "wiki_review_queue_source_revision_id_source_revision_id_fk" FOREIGN KEY ("source_revision_id") REFERENCES "public"."source_revision"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_review_queue" ADD CONSTRAINT "wiki_review_queue_assigned_to_app_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wiki_review_queue" ADD CONSTRAINT "wiki_review_queue_reviewed_by_user_id_app_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."app_user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answer_feedback_user_answer_uniq" ON "answer_feedback" USING btree ("user_id","answer_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_workspace_email_uniq" ON "app_user" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "app_user_demo_expiry_idx" ON "app_user" USING btree ("workspace_id","account_type","expires_at");--> statement-breakpoint
CREATE INDEX "ask_conversation_owner_idx" ON "ask_conversation" USING btree ("workspace_id","user_id","updated_at");--> statement-breakpoint
CREATE INDEX "ask_message_owner_conversation_idx" ON "ask_message" USING btree ("workspace_id","user_id","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_workspace_created_idx" ON "audit_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_workspace_resource_idx" ON "audit_log" USING btree ("workspace_id","resource_type","resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "code_group_workspace_code_uniq" ON "code_group" USING btree ("workspace_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "code_item_group_code_uniq" ON "code_item" USING btree ("group_id","code");--> statement-breakpoint
CREATE INDEX "code_item_workspace_group_idx" ON "code_item" USING btree ("workspace_id","group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_case_workspace_case_uniq" ON "legal_case" USING btree ("workspace_id","court_or_agency","case_number");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_case_source_revision_uniq" ON "legal_case" USING btree ("source_revision_id");--> statement-breakpoint
CREATE INDEX "legal_case_workspace_date_idx" ON "legal_case" USING btree ("workspace_id","decision_date");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_call_log_call_id_uniq" ON "llm_call_log" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "llm_call_log_workspace_created_idx" ON "llm_call_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_item_workspace_code_uniq" ON "menu_item" USING btree ("workspace_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "menu_item_workspace_route_uniq" ON "menu_item" USING btree ("workspace_id","route_path") WHERE "menu_item"."route_path" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "menu_item_workspace_parent_sort_idx" ON "menu_item" USING btree ("workspace_id","parent_id","sort_order");--> statement-breakpoint
CREATE INDEX "menu_permission_workspace_idx" ON "menu_permission" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permission_code_uniq" ON "permission" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "role_workspace_code_uniq" ON "role" USING btree ("workspace_id","code");--> statement-breakpoint
CREATE INDEX "role_permission_workspace_idx" ON "role_permission" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "search_log_workspace_created_idx" ON "search_log" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "source_document_identity_uniq" ON "source_document" USING btree ("workspace_id","provider","external_id");--> statement-breakpoint
CREATE INDEX "source_document_workspace_type_idx" ON "source_document" USING btree ("workspace_id","source_type");--> statement-breakpoint
CREATE UNIQUE INDEX "source_revision_document_key_uniq" ON "source_revision" USING btree ("source_document_id","revision_key");--> statement-breakpoint
CREATE UNIQUE INDEX "source_revision_document_checksum_uniq" ON "source_revision" USING btree ("source_document_id","checksum_sha256");--> statement-breakpoint
CREATE INDEX "source_revision_workspace_document_idx" ON "source_revision" USING btree ("workspace_id","source_document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_role_one_role_per_user_uniq" ON "user_role" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_role_workspace_idx" ON "user_role" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "user_session_workspace_user_idx" ON "user_session" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "user_session_expiry_idx" ON "user_session" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_commit_log_workspace_sha_uniq" ON "wiki_commit_log" USING btree ("workspace_id","commit_sha");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_lint_report_workspace_date_uniq" ON "wiki_lint_report" USING btree ("workspace_id","report_date");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_page_index_workspace_path_uniq" ON "wiki_page_index" USING btree ("workspace_id","path");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_page_index_workspace_slug_uniq" ON "wiki_page_index" USING btree ("workspace_id","slug");--> statement-breakpoint
CREATE INDEX "wiki_page_index_workspace_type_status_idx" ON "wiki_page_index" USING btree ("workspace_id","page_type","published_status");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_page_link_from_target_uniq" ON "wiki_page_link" USING btree ("from_page_id","to_path",coalesce("alias", ''),coalesce("anchor", ''));--> statement-breakpoint
CREATE INDEX "wiki_page_link_workspace_from_idx" ON "wiki_page_link" USING btree ("workspace_id","from_page_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wiki_page_source_ref_uniq" ON "wiki_page_source_ref" USING btree ("page_id","source_revision_id","locator");--> statement-breakpoint
CREATE INDEX "wiki_page_source_ref_workspace_revision_idx" ON "wiki_page_source_ref" USING btree ("workspace_id","source_revision_id");--> statement-breakpoint
CREATE INDEX "wiki_review_queue_workspace_status_idx" ON "wiki_review_queue" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_code_uniq" ON "workspace" USING btree ("code");