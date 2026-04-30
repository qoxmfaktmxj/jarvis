CREATE TABLE "sales_customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"cust_cd" text NOT NULL,
	"cust_nm" text NOT NULL,
	"cust_kind_cd" text,
	"cust_div_cd" text,
	"exchange_type_cd" text,
	"cust_source_cd" text,
	"cust_impr_cd" text,
	"buy_info_cd" text,
	"buy_info_dt_cd" text,
	"ceo_nm" text,
	"tel_no" text,
	"business_no" text,
	"fax_no" text,
	"business_text" text,
	"business_kind" text,
	"homepage" text,
	"addr_no" text,
	"addr1" text,
	"addr2" text,
	"file_seq" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sales_customer_charger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"charger_div_cd" text NOT NULL,
	"sabun" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sales_customer_contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"cust_mcd" text NOT NULL,
	"customer_id" uuid,
	"cust_name" text,
	"jikwee_nm" text,
	"org_nm" text,
	"tel_no" text,
	"hp_no" text,
	"email" text,
	"cust_source_cd" text,
	"cust_imp_cd" text,
	"cust_frd_cd" text,
	"status_yn" boolean DEFAULT true,
	"addr_no" text,
	"addr1" text,
	"addr2" text,
	"charger_work_text" text,
	"sabun" text,
	"file_seq" integer,
	"swit_comp" text,
	"last_work_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sales_customer_memo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"comt_seq" integer NOT NULL,
	"prior_comt_seq" integer,
	"memo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sales_customer_org" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"org_cd" text NOT NULL,
	"org_nm" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sales_cost_master" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"cost_cd" text NOT NULL,
	"cost_nm" text NOT NULL,
	"cost_group" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sales_product_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"product_cd" text NOT NULL,
	"product_nm" text NOT NULL,
	"cost_mapping_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sales_mail_person" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sabun" text NOT NULL,
	"name" text NOT NULL,
	"sales_yn" boolean DEFAULT false NOT NULL,
	"insa_yn" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sales_license" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"license_no" text NOT NULL,
	"customer_id" uuid,
	"product_cd" text,
	"license_kind_cd" text,
	"sdate" date,
	"edate" date,
	"qty" integer,
	"remark" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sales_license_code" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sales_customer_ws_cust_cd_unique" ON "sales_customer" USING btree ("workspace_id","cust_cd");--> statement-breakpoint
CREATE INDEX "sales_customer_ws_idx" ON "sales_customer" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sales_customer_charger_ws_cust_idx" ON "sales_customer_charger" USING btree ("workspace_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_customer_charger_uniq" ON "sales_customer_charger" USING btree ("workspace_id","customer_id","charger_div_cd","sabun");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_customer_contact_uniq" ON "sales_customer_contact" USING btree ("workspace_id","cust_mcd");--> statement-breakpoint
CREATE INDEX "sales_customer_contact_ws_cust_idx" ON "sales_customer_contact" USING btree ("workspace_id","customer_id");--> statement-breakpoint
CREATE INDEX "sales_customer_memo_ws_cust_idx" ON "sales_customer_memo" USING btree ("workspace_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_customer_memo_uniq" ON "sales_customer_memo" USING btree ("workspace_id","customer_id","comt_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_customer_org_uniq" ON "sales_customer_org" USING btree ("workspace_id","customer_id","org_cd");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_cost_master_uniq" ON "sales_cost_master" USING btree ("workspace_id","cost_cd");--> statement-breakpoint
CREATE INDEX "sales_cost_master_ws_idx" ON "sales_cost_master" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_product_type_uniq" ON "sales_product_type" USING btree ("workspace_id","product_cd");--> statement-breakpoint
CREATE INDEX "sales_product_type_ws_idx" ON "sales_product_type" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_mail_person_uniq" ON "sales_mail_person" USING btree ("workspace_id","sabun");--> statement-breakpoint
CREATE INDEX "sales_mail_person_ws_idx" ON "sales_mail_person" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_license_uniq" ON "sales_license" USING btree ("workspace_id","license_no");--> statement-breakpoint
CREATE INDEX "sales_license_cust_idx" ON "sales_license" USING btree ("workspace_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_license_code_uniq" ON "sales_license_code" USING btree ("workspace_id","code");