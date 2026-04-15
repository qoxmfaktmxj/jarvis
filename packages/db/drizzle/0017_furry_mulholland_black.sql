CREATE TYPE "public"."notice_sensitivity" AS ENUM('PUBLIC', 'INTERNAL');--> statement-breakpoint
CREATE TABLE "notice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"body_md" text NOT NULL,
	"sensitivity" "notice_sensitivity" DEFAULT 'INTERNAL' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"published_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notice" ADD CONSTRAINT "notice_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notice" ADD CONSTRAINT "notice_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_notice_ws_pinned" ON "notice" USING btree ("workspace_id","pinned","published_at");--> statement-breakpoint
CREATE INDEX "idx_notice_ws_published" ON "notice" USING btree ("workspace_id","published_at");--> statement-breakpoint
CREATE INDEX "idx_notice_ws_author" ON "notice" USING btree ("workspace_id","author_id");