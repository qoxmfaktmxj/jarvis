CREATE TABLE "chat_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_reaction" (
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" varchar(16) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_reaction_message_id_user_id_emoji_pk" PRIMARY KEY("message_id","user_id","emoji"),
	CONSTRAINT "chat_reaction_emoji_chk" CHECK (emoji IN ('👍','❤️','🎉','😂','🙏'))
);
--> statement-breakpoint
ALTER TABLE "project" DROP CONSTRAINT "project_workspace_company_unique";--> statement-breakpoint
ALTER TABLE "additional_development_effort" DROP CONSTRAINT "additional_development_effort_add_dev_id_fk";
--> statement-breakpoint
ALTER TABLE "additional_development_revenue" DROP CONSTRAINT "additional_development_revenue_add_dev_id_fk";
--> statement-breakpoint
ALTER TABLE "additional_development_staff" DROP CONSTRAINT "additional_development_staff_add_dev_id_fk";
--> statement-breakpoint
ALTER TABLE "additional_development_staff" DROP CONSTRAINT "additional_development_staff_user_id_fk";
--> statement-breakpoint
DROP INDEX "idx_contract_one_active";--> statement-breakpoint
DROP INDEX "holiday_workspace_date_unique";--> statement-breakpoint
DROP INDEX "idx_contract_user";--> statement-breakpoint
DROP INDEX "idx_contract_status";--> statement-breakpoint
DROP INDEX "idx_leave_user";--> statement-breakpoint
DROP INDEX "idx_leave_contract";--> statement-breakpoint
DROP INDEX "idx_leave_date";--> statement-breakpoint
DROP INDEX "idx_holiday_date";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "status" SET DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reaction" ADD CONSTRAINT "chat_reaction_message_id_chat_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_reaction" ADD CONSTRAINT "chat_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chat_msg_ws_created" ON "chat_message" USING btree ("workspace_id","created_at");--> statement-breakpoint
ALTER TABLE "additional_development_effort" ADD CONSTRAINT "additional_development_effort_add_dev_id_additional_development_id_fk" FOREIGN KEY ("add_dev_id") REFERENCES "public"."additional_development"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "additional_development_revenue" ADD CONSTRAINT "additional_development_revenue_add_dev_id_additional_development_id_fk" FOREIGN KEY ("add_dev_id") REFERENCES "public"."additional_development"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "additional_development_staff" ADD CONSTRAINT "additional_development_staff_add_dev_id_additional_development_id_fk" FOREIGN KEY ("add_dev_id") REFERENCES "public"."additional_development"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "additional_development_staff" ADD CONSTRAINT "additional_development_staff_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_workspace_company_unique" ON "project" USING btree ("workspace_id","company_id");--> statement-breakpoint
CREATE INDEX "idx_contract_user" ON "contractor_contract" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_contract_status" ON "contractor_contract" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_leave_user" ON "leave_request" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_leave_contract" ON "leave_request" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "idx_leave_date" ON "leave_request" USING btree ("start_date","end_date");--> statement-breakpoint
CREATE INDEX "idx_holiday_date" ON "holiday" USING btree ("date");--> statement-breakpoint
ALTER TABLE "holiday" ADD CONSTRAINT "holiday_workspace_date_unique" UNIQUE("workspace_id","date");