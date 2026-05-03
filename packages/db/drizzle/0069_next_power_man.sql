CREATE TABLE "infra_system" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"system_name" varchar(200) NOT NULL,
	"env_type" varchar(30),
	"domain_addr" text,
	"port" integer,
	"db_type" varchar(30),
	"db_version" varchar(30),
	"os_type" varchar(50),
	"os_version" varchar(50),
	"connect_method" varchar(50),
	"deploy_method" varchar(50),
	"deploy_folder" text,
	"owner_name" varchar(100),
	"owner_contact" varchar(100),
	"wiki_page_id" uuid,
	"note" text,
	"sensitivity" varchar(30) DEFAULT 'INTERNAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "infra_system" ADD CONSTRAINT "infra_system_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_system" ADD CONSTRAINT "infra_system_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_system" ADD CONSTRAINT "infra_system_wiki_page_id_wiki_page_index_id_fk" FOREIGN KEY ("wiki_page_id") REFERENCES "public"."wiki_page_index"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_infra_system_company" ON "infra_system" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_infra_system_env" ON "infra_system" USING btree ("env_type");--> statement-breakpoint
CREATE INDEX "idx_infra_system_db" ON "infra_system" USING btree ("db_type");--> statement-breakpoint
CREATE INDEX "idx_infra_system_ws_company" ON "infra_system" USING btree ("workspace_id","company_id");--> statement-breakpoint
CREATE INDEX "idx_infra_system_ws_sens" ON "infra_system" USING btree ("workspace_id","sensitivity");--> statement-breakpoint
CREATE UNIQUE INDEX "infra_system_company_name_env_uniq" ON "infra_system" USING btree ("company_id","system_name","env_type");