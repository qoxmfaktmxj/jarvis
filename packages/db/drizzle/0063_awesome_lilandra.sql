CREATE TABLE "project_beacon" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"legacy_enter_cd" varchar(10),
	"legacy_beacon_mcd" varchar(100),
	"legacy_beacon_ser" varchar(1000),
	"beacon_mcd" varchar(100),
	"beacon_ser" varchar(1000),
	"pjt_cd" varchar(20),
	"pjt_nm" varchar(300),
	"sdate" varchar(8),
	"edate" varchar(8),
	"sabun" varchar(20),
	"out_yn" varchar(10),
	"bigo" varchar(4000),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "project_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"legacy_enter_cd" varchar(10),
	"legacy_sabun" varchar(20),
	"legacy_org_cd" varchar(10),
	"legacy_pjt_cd" varchar(20),
	"sabun" varchar(20),
	"org_cd" varchar(10),
	"pjt_cd" varchar(20),
	"pjt_nm" varchar(300),
	"cust_cd" varchar(60),
	"cust_nm" varchar(500),
	"sdate" varchar(8),
	"edate" varchar(8),
	"reg_cd" varchar(20),
	"reg_nm" varchar(20),
	"de_reg" varchar(40),
	"flist" varchar(1000),
	"plist" varchar(1000),
	"role_cd" varchar(20),
	"role_nm" varchar(20),
	"module" varchar(500),
	"bigo" varchar(4000),
	"memo" varchar(4000),
	"etc1" varchar(100),
	"etc2" varchar(100),
	"etc3" varchar(100),
	"etc4" varchar(100),
	"etc5" varchar(100),
	"job_cd" varchar(40),
	"job_nm" varchar(100),
	"reward_yn" varchar(10),
	"status_cd" varchar(10),
	"beacon_mcd" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "project_module" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"legacy_enter_cd" varchar(10),
	"legacy_sabun" varchar(20),
	"legacy_pjt_cd" varchar(20),
	"legacy_module_cd" varchar(20),
	"sabun" varchar(20),
	"pjt_cd" varchar(20),
	"pjt_nm" varchar(300),
	"module_cd" varchar(20),
	"module_nm" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid
);
--> statement-breakpoint
ALTER TABLE "project_beacon" ADD CONSTRAINT "project_beacon_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_history" ADD CONSTRAINT "project_history_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_module" ADD CONSTRAINT "project_module_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_beacon_ws_idx" ON "project_beacon" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "project_beacon_ws_pjt_idx" ON "project_beacon" USING btree ("workspace_id","pjt_cd");--> statement-breakpoint
CREATE INDEX "project_beacon_ws_sabun_idx" ON "project_beacon" USING btree ("workspace_id","sabun");--> statement-breakpoint
CREATE UNIQUE INDEX "project_beacon_legacy_uniq" ON "project_beacon" USING btree ("workspace_id","legacy_enter_cd","legacy_beacon_mcd","legacy_beacon_ser");--> statement-breakpoint
CREATE INDEX "project_history_ws_idx" ON "project_history" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "project_history_ws_pjt_idx" ON "project_history" USING btree ("workspace_id","pjt_cd");--> statement-breakpoint
CREATE INDEX "project_history_ws_sabun_idx" ON "project_history" USING btree ("workspace_id","sabun");--> statement-breakpoint
CREATE INDEX "project_history_ws_dates_idx" ON "project_history" USING btree ("workspace_id","sdate","edate");--> statement-breakpoint
CREATE UNIQUE INDEX "project_history_legacy_uniq" ON "project_history" USING btree ("workspace_id","legacy_enter_cd","legacy_sabun","legacy_org_cd","legacy_pjt_cd");--> statement-breakpoint
CREATE INDEX "project_module_ws_idx" ON "project_module" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "project_module_ws_pjt_idx" ON "project_module" USING btree ("workspace_id","pjt_cd");--> statement-breakpoint
CREATE INDEX "project_module_ws_sabun_idx" ON "project_module" USING btree ("workspace_id","sabun");--> statement-breakpoint
CREATE UNIQUE INDEX "project_module_legacy_uniq" ON "project_module" USING btree ("workspace_id","legacy_enter_cd","legacy_sabun","legacy_pjt_cd","legacy_module_cd");