CREATE TABLE "sales_freelancer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"legacy_enter_cd" varchar(10),
	"sabun" varchar(20) NOT NULL,
	"name" varchar(100),
	"res_no" varchar(13),
	"pjt_cd" varchar(20),
	"pjt_nm" varchar(300),
	"sdate" varchar(8),
	"edate" varchar(8),
	"addr" varchar(400),
	"tel" varchar(20),
	"mail_id" varchar(50),
	"belong_ym" varchar(6) NOT NULL,
	"business_cd" varchar(20) NOT NULL,
	"tot_mon" numeric,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sales_cloud_people_base" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"legacy_enter_cd" varchar(10),
	"cont_no" varchar(30) NOT NULL,
	"cont_year" varchar(4) NOT NULL,
	"seq" integer NOT NULL,
	"pjt_code" varchar(20),
	"company_cd" varchar(10),
	"person_type" varchar(10) NOT NULL,
	"calc_type" varchar(10) NOT NULL,
	"sdate" varchar(8) NOT NULL,
	"edate" varchar(8),
	"month_amt" numeric,
	"note" varchar(4000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "sales_cloud_people_calc" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"legacy_enter_cd" varchar(10),
	"cont_no" varchar(30) NOT NULL,
	"cont_year" varchar(4) NOT NULL,
	"seq" integer NOT NULL,
	"person_type" varchar(10) NOT NULL,
	"calc_type" varchar(10) NOT NULL,
	"ym" varchar(6) NOT NULL,
	"person_cnt" integer,
	"total_amt" numeric,
	"note" varchar(4000),
	"refl_yn" varchar(1),
	"refl_id" varchar(20),
	"refl_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE INDEX "sales_freelancer_ws_idx" ON "sales_freelancer" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sales_freelancer_ws_belong_ym_idx" ON "sales_freelancer" USING btree ("workspace_id","belong_ym");--> statement-breakpoint
CREATE INDEX "sales_freelancer_ws_sabun_idx" ON "sales_freelancer" USING btree ("workspace_id","sabun");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_freelancer_legacy_uniq" ON "sales_freelancer" USING btree ("workspace_id","legacy_enter_cd","sabun","belong_ym","business_cd");--> statement-breakpoint
CREATE INDEX "sales_cloud_people_base_ws_idx" ON "sales_cloud_people_base" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sales_cloud_people_base_ws_contract_idx" ON "sales_cloud_people_base" USING btree ("workspace_id","cont_year","cont_no");--> statement-breakpoint
CREATE INDEX "sales_cloud_people_base_ws_pjt_idx" ON "sales_cloud_people_base" USING btree ("workspace_id","pjt_code");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_cloud_people_base_legacy_uniq" ON "sales_cloud_people_base" USING btree ("workspace_id","legacy_enter_cd","cont_no","cont_year","seq","person_type","calc_type","sdate");--> statement-breakpoint
CREATE INDEX "sales_cloud_people_calc_ws_idx" ON "sales_cloud_people_calc" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sales_cloud_people_calc_ws_contract_ym_idx" ON "sales_cloud_people_calc" USING btree ("workspace_id","cont_year","cont_no","ym");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_cloud_people_calc_legacy_uniq" ON "sales_cloud_people_calc" USING btree ("workspace_id","legacy_enter_cd","cont_no","cont_year","seq","person_type","calc_type","ym");