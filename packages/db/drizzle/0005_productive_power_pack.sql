CREATE TABLE "case_cluster" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"numeric_cluster_id" integer NOT NULL,
	"label" varchar(200) NOT NULL,
	"description" text,
	"case_count" integer DEFAULT 0 NOT NULL,
	"digest_case_id" uuid,
	"digest_page_id" uuid,
	"top_symptoms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"top_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"top_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "precedent_case" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"original_seq" integer,
	"higher_category" varchar(100),
	"lower_category" varchar(100),
	"app_menu" varchar(500),
	"process_type" varchar(100),
	"title" varchar(500) NOT NULL,
	"symptom" text,
	"cause" text,
	"action" text,
	"result" varchar(30),
	"request_company" varchar(100),
	"manager_team" varchar(100),
	"cluster_id" integer,
	"cluster_label" varchar(200),
	"is_digest" boolean DEFAULT false NOT NULL,
	"digest_page_id" uuid,
	"severity" varchar(20),
	"resolved" boolean DEFAULT false,
	"urgency" boolean DEFAULT false,
	"work_hours" numeric(5, 1),
	"requested_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"sensitivity" varchar(30) DEFAULT 'INTERNAL' NOT NULL,
	"embedding" vector(1536),
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entry_type" varchar(30) NOT NULL,
	"name" varchar(200) NOT NULL,
	"name_ko" varchar(200),
	"description" text,
	"url" varchar(1000),
	"category" varchar(100),
	"owner_team" varchar(100),
	"owner_contact" varchar(200),
	"related_page_slug" varchar(500),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_page" ADD COLUMN "surface" varchar(20) DEFAULT 'canonical' NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_page" ADD COLUMN "authority" varchar(20) DEFAULT 'canonical';--> statement-breakpoint
ALTER TABLE "knowledge_page" ADD COLUMN "owner_team" varchar(100);--> statement-breakpoint
ALTER TABLE "knowledge_page" ADD COLUMN "audience" varchar(50) DEFAULT 'all-employees';--> statement-breakpoint
ALTER TABLE "knowledge_page" ADD COLUMN "review_cycle_days" integer DEFAULT 90;--> statement-breakpoint
ALTER TABLE "knowledge_page" ADD COLUMN "domain" varchar(50);--> statement-breakpoint
ALTER TABLE "knowledge_page" ADD COLUMN "source_origin" varchar(50);--> statement-breakpoint
ALTER TABLE "case_cluster" ADD CONSTRAINT "case_cluster_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_cluster" ADD CONSTRAINT "case_cluster_digest_case_id_precedent_case_id_fk" FOREIGN KEY ("digest_case_id") REFERENCES "public"."precedent_case"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_cluster" ADD CONSTRAINT "case_cluster_digest_page_id_knowledge_page_id_fk" FOREIGN KEY ("digest_page_id") REFERENCES "public"."knowledge_page"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precedent_case" ADD CONSTRAINT "precedent_case_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precedent_case" ADD CONSTRAINT "precedent_case_digest_page_id_knowledge_page_id_fk" FOREIGN KEY ("digest_page_id") REFERENCES "public"."knowledge_page"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "precedent_case" ADD CONSTRAINT "precedent_case_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "directory_entry" ADD CONSTRAINT "directory_entry_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_case_cluster_workspace_numeric" ON "case_cluster" USING btree ("workspace_id","numeric_cluster_id");--> statement-breakpoint
CREATE INDEX "idx_precedent_case_workspace" ON "precedent_case" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "idx_precedent_case_cluster" ON "precedent_case" USING btree ("workspace_id","cluster_id");--> statement-breakpoint
CREATE INDEX "idx_precedent_case_category" ON "precedent_case" USING btree ("workspace_id","higher_category","lower_category");--> statement-breakpoint
CREATE INDEX "idx_precedent_case_company" ON "precedent_case" USING btree ("workspace_id","request_company");--> statement-breakpoint
CREATE INDEX "idx_precedent_case_digest" ON "precedent_case" USING btree ("workspace_id","is_digest");--> statement-breakpoint
CREATE INDEX "idx_directory_entry_workspace_type" ON "directory_entry" USING btree ("workspace_id","entry_type");--> statement-breakpoint
CREATE INDEX "idx_directory_entry_workspace_category" ON "directory_entry" USING btree ("workspace_id","category");--> statement-breakpoint
CREATE INDEX "idx_directory_entry_name" ON "directory_entry" USING btree ("name");