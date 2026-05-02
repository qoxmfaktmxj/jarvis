CREATE TABLE "sales_plan_perf" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"ym" varchar(6) NOT NULL,
	"org_cd" varchar(20) NOT NULL,
	"org_nm" varchar(100) NOT NULL,
	"gubun_cd" varchar(10) NOT NULL,
	"trend_gb_cd" varchar(10) NOT NULL,
	"amt" bigint NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sales_plan_perf" ADD CONSTRAINT "sales_plan_perf_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_plan_perf" ADD CONSTRAINT "sales_plan_perf_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_plan_perf" ADD CONSTRAINT "sales_plan_perf_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_plan_perf_uniq" ON "sales_plan_perf" USING btree ("workspace_id","ym","org_cd","gubun_cd","trend_gb_cd");--> statement-breakpoint
CREATE INDEX "sales_plan_perf_ym_idx" ON "sales_plan_perf" USING btree ("workspace_id","ym");--> statement-breakpoint
CREATE INDEX "sales_plan_perf_org_idx" ON "sales_plan_perf" USING btree ("workspace_id","org_cd");