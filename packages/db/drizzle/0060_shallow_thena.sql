CREATE TABLE "sales_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"legacy_enter_cd" text,
	"legacy_biz_act_cd" text,
	"legacy_biz_op_cd" text,
	"legacy_cust_cd" text,
	"legacy_cust_mcd" text,
	"legacy_att_sabun" text,
	"biz_act_nm" text NOT NULL,
	"opportunity_id" uuid,
	"customer_id" uuid,
	"contact_id" uuid,
	"act_ymd" text,
	"act_type_code" text,
	"access_route_code" text,
	"biz_step_code" text,
	"product_type_code" text,
	"act_content" text,
	"attendee_user_id" uuid,
	"legacy_file_seq" integer,
	"memo" text,
	"ins_user_id" uuid,
	"chk_user_id" uuid,
	"ins_date" timestamp with time zone DEFAULT now() NOT NULL,
	"chk_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sales_activity_memo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"comt_seq" integer NOT NULL,
	"prior_comt_seq" integer,
	"memo" text NOT NULL,
	"ins_user_id" uuid,
	"chk_user_id" uuid,
	"ins_date" timestamp with time zone DEFAULT now() NOT NULL,
	"chk_date" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sales_activity" ADD CONSTRAINT "sales_activity_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activity" ADD CONSTRAINT "sales_activity_opportunity_id_sales_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."sales_opportunity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activity" ADD CONSTRAINT "sales_activity_customer_id_sales_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."sales_customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activity" ADD CONSTRAINT "sales_activity_contact_id_sales_customer_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."sales_customer_contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activity" ADD CONSTRAINT "sales_activity_attendee_user_id_user_id_fk" FOREIGN KEY ("attendee_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activity" ADD CONSTRAINT "sales_activity_ins_user_id_user_id_fk" FOREIGN KEY ("ins_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activity" ADD CONSTRAINT "sales_activity_chk_user_id_user_id_fk" FOREIGN KEY ("chk_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activity_memo" ADD CONSTRAINT "sales_activity_memo_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activity_memo" ADD CONSTRAINT "sales_activity_memo_activity_id_sales_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."sales_activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activity_memo" ADD CONSTRAINT "sales_activity_memo_ins_user_id_user_id_fk" FOREIGN KEY ("ins_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_activity_memo" ADD CONSTRAINT "sales_activity_memo_chk_user_id_user_id_fk" FOREIGN KEY ("chk_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_activity_legacy_uniq" ON "sales_activity" USING btree ("workspace_id","legacy_biz_act_cd");--> statement-breakpoint
CREATE INDEX "sales_activity_ws_idx" ON "sales_activity" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sales_activity_ws_opp_idx" ON "sales_activity" USING btree ("workspace_id","opportunity_id");--> statement-breakpoint
CREATE INDEX "sales_activity_ws_act_ymd_idx" ON "sales_activity" USING btree ("workspace_id","act_ymd");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_activity_memo_seq_uniq" ON "sales_activity_memo" USING btree ("activity_id","comt_seq");--> statement-breakpoint
CREATE INDEX "sales_activity_memo_act_idx" ON "sales_activity_memo" USING btree ("activity_id");