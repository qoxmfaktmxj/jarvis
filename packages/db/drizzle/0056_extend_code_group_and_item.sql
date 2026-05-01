-- Phase /admin/codes grid overhaul: extend code_group + code_item with legacy grpCdMgr.jsp columns.
-- Master(code_group) gains description/name_en/business_div_code/kind_code/common_yn.
-- Detail(code_item) gains memo/full_name/note1~note9/num_note/sdate/edate/visual_yn.
-- Existing rows get safe defaults; uniqueness is enforced on (workspace_id, code) and (group_id, code).

ALTER TABLE "code_group" ADD COLUMN "name_en" varchar(200);--> statement-breakpoint
ALTER TABLE "code_group" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "code_group" ADD COLUMN "business_div_code" varchar(50);--> statement-breakpoint
ALTER TABLE "code_group" ADD COLUMN "kind_code" varchar(10) DEFAULT 'C' NOT NULL;--> statement-breakpoint
ALTER TABLE "code_group" ADD COLUMN "common_yn" boolean DEFAULT false NOT NULL;--> statement-breakpoint

ALTER TABLE "code_item" ADD COLUMN "full_name" text;--> statement-breakpoint
ALTER TABLE "code_item" ADD COLUMN "memo" text;--> statement-breakpoint
ALTER TABLE "code_item" ADD COLUMN "note1" text;--> statement-breakpoint
ALTER TABLE "code_item" ADD COLUMN "note2" text;--> statement-breakpoint
ALTER TABLE "code_item" ADD COLUMN "note3" text;--> statement-breakpoint
ALTER TABLE "code_item" ADD COLUMN "note4" text;--> statement-breakpoint
ALTER TABLE "code_item" ADD COLUMN "note5" text;--> statement-breakpoint
ALTER TABLE "code_item" ADD COLUMN "note6" text;--> statement-breakpoint
ALTER TABLE "code_item" ADD COLUMN "note7" text;--> statement-breakpoint
ALTER TABLE "code_item" ADD COLUMN "note8" text;--> statement-breakpoint
ALTER TABLE "code_item" ADD COLUMN "note9" text;--> statement-breakpoint
ALTER TABLE "code_item" ADD COLUMN "num_note" integer;--> statement-breakpoint
ALTER TABLE "code_item" ADD COLUMN "sdate" date DEFAULT '1900-01-01' NOT NULL;--> statement-breakpoint
ALTER TABLE "code_item" ADD COLUMN "edate" date DEFAULT '2999-12-31' NOT NULL;--> statement-breakpoint
ALTER TABLE "code_item" ADD COLUMN "visual_yn" boolean DEFAULT true NOT NULL;
-- NOTE: The unique indexes "code_group_ws_code_uniq" and "code_item_group_code_uniq"
-- are already created in 0033_admin_users_status.sql (lines 29-32). Re-emitting them
-- here would fail with `relation already exists` (PG 42P07).
