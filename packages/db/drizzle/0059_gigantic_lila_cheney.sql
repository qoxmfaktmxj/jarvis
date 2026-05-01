CREATE TABLE "sales_opportunity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"legacy_enter_cd" text,
	"legacy_biz_op_cd" text,
	"legacy_cust_cd" text,
	"legacy_cust_mcd" text,
	"legacy_cust_name" text,
	"biz_op_nm" text NOT NULL,
	"customer_id" uuid,
	"contact_id" uuid,
	"customer_name" text,
	"last_dlv_customer_name" text,
	"last_dlv_customer_cd" text,
	"last_dlv_seq" text,
	"sale_type_code" text,
	"biz_type_code" text,
	"biz_type_detail_code" text,
	"biz_op_source_code" text,
	"industry_code" text,
	"biz_step_code" text,
	"biz_imp_code" text,
	"cont_per_code" text,
	"biz_area_code" text,
	"biz_area_detail" text,
	"cust_type_code" text,
	"product_type_code" text,
	"cont_expec_amt" bigint,
	"cont_impl_per" numeric(5, 2),
	"expec_apply_amt" bigint,
	"cont_expec_ymd" text,
	"cont_expec_symd" text,
	"cont_expec_eymd" text,
	"biz_step_ymd" text,
	"focus_mgr_yn" boolean DEFAULT false NOT NULL,
	"legacy_file_seq" integer,
	"memo" text,
	"org_nm" text,
	"ins_user_id" uuid,
	"chk_user_id" uuid,
	"ins_date" timestamp with time zone DEFAULT now() NOT NULL,
	"chk_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sales_opportunity_memo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"comt_seq" integer NOT NULL,
	"prior_comt_seq" integer,
	"memo" text NOT NULL,
	"ins_user_id" uuid,
	"chk_user_id" uuid,
	"ins_date" timestamp with time zone DEFAULT now() NOT NULL,
	"chk_date" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sales_opportunity" ADD CONSTRAINT "sales_opportunity_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunity" ADD CONSTRAINT "sales_opportunity_customer_id_sales_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."sales_customer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunity" ADD CONSTRAINT "sales_opportunity_contact_id_sales_customer_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."sales_customer_contact"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunity" ADD CONSTRAINT "sales_opportunity_ins_user_id_user_id_fk" FOREIGN KEY ("ins_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunity" ADD CONSTRAINT "sales_opportunity_chk_user_id_user_id_fk" FOREIGN KEY ("chk_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunity_memo" ADD CONSTRAINT "sales_opportunity_memo_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunity_memo" ADD CONSTRAINT "sales_opportunity_memo_opportunity_id_sales_opportunity_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."sales_opportunity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunity_memo" ADD CONSTRAINT "sales_opportunity_memo_ins_user_id_user_id_fk" FOREIGN KEY ("ins_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_opportunity_memo" ADD CONSTRAINT "sales_opportunity_memo_chk_user_id_user_id_fk" FOREIGN KEY ("chk_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_opportunity_legacy_uniq" ON "sales_opportunity" USING btree ("workspace_id","legacy_biz_op_cd");--> statement-breakpoint
CREATE INDEX "sales_opportunity_ws_idx" ON "sales_opportunity" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sales_opportunity_ws_step_idx" ON "sales_opportunity" USING btree ("workspace_id","biz_step_code");--> statement-breakpoint
CREATE INDEX "sales_opportunity_ws_ins_idx" ON "sales_opportunity" USING btree ("workspace_id","ins_date");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_opportunity_memo_seq_uniq" ON "sales_opportunity_memo" USING btree ("opportunity_id","comt_seq");--> statement-breakpoint
CREATE INDEX "sales_opportunity_memo_opp_idx" ON "sales_opportunity_memo" USING btree ("opportunity_id");