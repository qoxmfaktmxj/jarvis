CREATE TABLE "sales_month_exp_sga" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"legacy_enter_cd" varchar(10),
	"yyyy" varchar(4),
	"mm" varchar(2),
	"cost_cd" varchar(10),
	"exp_amt" numeric,
	"sga_amt" numeric,
	"waers" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sales_plan_div_cost" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"legacy_enter_cd" varchar(10),
	"cost_cd" varchar(50),
	"account_type" varchar(10),
	"ym" varchar(6),
	"plan_amt" numeric,
	"prdt_amt" numeric,
	"perform_amt" numeric,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sales_plan_div_cost_detail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"plan_div_cost_id" uuid,
	"legacy_enter_cd" varchar(10),
	"cost_cd" varchar(50),
	"account_type" varchar(10),
	"ym" varchar(6),
	"sub_cost_cd" varchar(50),
	"plan_rate" numeric,
	"prdt_rate" numeric,
	"perform_rate" numeric,
	"use_yn" varchar(1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sales_purchase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"legacy_enter_cd" varchar(10),
	"legacy_cont_year" varchar(4),
	"legacy_cont_no" varchar(30),
	"legacy_seq" integer,
	"legacy_pur_seq" integer,
	"pur_type" varchar(10),
	"sdate" varchar(8),
	"edate" varchar(8),
	"pur_nm" varchar(200),
	"sub_amt" numeric,
	"amt" numeric,
	"serv_sabun" varchar(20),
	"serv_name" varchar(200),
	"serv_birthday" varchar(8),
	"serv_tel_no" varchar(50),
	"serv_addr" varchar(400),
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sales_purchase_project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"purchase_id" uuid,
	"legacy_enter_cd" varchar(10),
	"legacy_cont_year" varchar(4),
	"legacy_cont_no" varchar(30),
	"legacy_seq" integer,
	"legacy_pur_seq" integer,
	"sub_cont_no" varchar(20),
	"pjt_code" varchar(20),
	"pjt_nm" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sales_tax_bill" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"legacy_enter_cd" varchar(10),
	"legacy_cont_no" varchar(30),
	"legacy_seq" integer,
	"ym" varchar(6),
	"order_div_cd" varchar(10),
	"cost_cd" varchar(30),
	"pjt_nm" varchar(300),
	"pjt_code" varchar(30),
	"pur_seq" varchar(30),
	"debit_credit_cd" varchar(10),
	"slip_target_yn" varchar(1),
	"bill_type" varchar(10),
	"slip_seq" varchar(2),
	"trans_code" varchar(10),
	"doc_date" varchar(8),
	"slip_type" varchar(10),
	"comp_cd" varchar(10),
	"post_date" varchar(8),
	"currency_type" varchar(10),
	"refer_slip_no" varchar(20),
	"post_key" varchar(10),
	"account_type" varchar(30),
	"business_area" varchar(10),
	"amt" numeric,
	"vat_amt" numeric,
	"briefs_txt" text,
	"slip_result_yn" varchar(1),
	"serv_sabun" varchar(20),
	"serv_name" varchar(200),
	"serv_birthday" varchar(8),
	"serv_tel_no" varchar(50),
	"serv_addr" varchar(400),
	"tax_code" varchar(20),
	"business_location" varchar(20),
	"company_nm" varchar(300),
	"receipt_cd" varchar(10),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "sales_plan_div_cost_detail" ADD CONSTRAINT "sales_plan_div_cost_detail_plan_div_cost_id_sales_plan_div_cost_id_fk" FOREIGN KEY ("plan_div_cost_id") REFERENCES "public"."sales_plan_div_cost"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_purchase_project" ADD CONSTRAINT "sales_purchase_project_purchase_id_sales_purchase_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."sales_purchase"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_month_exp_sga_ws_idx" ON "sales_month_exp_sga" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sales_month_exp_sga_ws_ym_idx" ON "sales_month_exp_sga" USING btree ("workspace_id","yyyy","mm");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_month_exp_sga_legacy_uniq" ON "sales_month_exp_sga" USING btree ("workspace_id","legacy_enter_cd","yyyy","mm","cost_cd");--> statement-breakpoint
CREATE INDEX "sales_plan_div_cost_ws_idx" ON "sales_plan_div_cost" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sales_plan_div_cost_ws_ym_idx" ON "sales_plan_div_cost" USING btree ("workspace_id","ym");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_plan_div_cost_legacy_uniq" ON "sales_plan_div_cost" USING btree ("workspace_id","legacy_enter_cd","cost_cd","account_type","ym");--> statement-breakpoint
CREATE INDEX "sales_plan_div_cost_detail_ws_idx" ON "sales_plan_div_cost_detail" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sales_plan_div_cost_detail_plan_idx" ON "sales_plan_div_cost_detail" USING btree ("plan_div_cost_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_plan_div_cost_detail_legacy_uniq" ON "sales_plan_div_cost_detail" USING btree ("workspace_id","legacy_enter_cd","cost_cd","account_type","ym","sub_cost_cd");--> statement-breakpoint
CREATE INDEX "sales_purchase_ws_idx" ON "sales_purchase" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sales_purchase_ws_date_idx" ON "sales_purchase" USING btree ("workspace_id","sdate","edate");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_purchase_legacy_uniq" ON "sales_purchase" USING btree ("workspace_id","legacy_enter_cd","legacy_cont_year","legacy_cont_no","legacy_seq","legacy_pur_seq");--> statement-breakpoint
CREATE INDEX "sales_purchase_project_ws_idx" ON "sales_purchase_project" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sales_purchase_project_purchase_idx" ON "sales_purchase_project" USING btree ("purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_purchase_project_legacy_uniq" ON "sales_purchase_project" USING btree ("workspace_id","legacy_enter_cd","legacy_cont_year","legacy_cont_no","legacy_seq","legacy_pur_seq","sub_cont_no","pjt_code");--> statement-breakpoint
CREATE INDEX "sales_tax_bill_ws_idx" ON "sales_tax_bill" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sales_tax_bill_ws_ym_idx" ON "sales_tax_bill" USING btree ("workspace_id","ym");--> statement-breakpoint
CREATE INDEX "sales_tax_bill_ws_post_date_idx" ON "sales_tax_bill" USING btree ("workspace_id","post_date");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_tax_bill_legacy_uniq" ON "sales_tax_bill" USING btree ("workspace_id","legacy_enter_cd","legacy_cont_no","legacy_seq","ym","order_div_cd");