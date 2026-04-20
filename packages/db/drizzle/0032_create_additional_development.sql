CREATE TABLE "additional_development" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" UUID NOT NULL REFERENCES "workspace"("id"),
  "project_id" UUID NOT NULL REFERENCES "project"("id") ON DELETE RESTRICT,
  "request_year_month" VARCHAR(7),
  "request_sequence" INTEGER,
  "requester_name" VARCHAR(100),
  "request_content" TEXT,
  "part" VARCHAR(20),
  "status" VARCHAR(30) NOT NULL DEFAULT '협의중',
  "project_name" VARCHAR(500),
  "contract_number" VARCHAR(50),
  "contract_start_month" VARCHAR(7),
  "contract_end_month" VARCHAR(7),
  "contract_amount" NUMERIC(14,0),
  "is_paid" BOOLEAN,
  "invoice_issued" BOOLEAN,
  "inspection_confirmed" BOOLEAN,
  "estimate_progress" TEXT,
  "dev_start_date" DATE,
  "dev_end_date" DATE,
  "pm_id" UUID REFERENCES "user"("id"),
  "developer_id" UUID REFERENCES "user"("id"),
  "vendor_contact_note" TEXT,
  "estimated_effort" NUMERIC(8,2),
  "actual_effort" NUMERIC(8,2),
  "attachment_file_ref" VARCHAR(500),
  "remark" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);--> statement-breakpoint

CREATE INDEX "idx_add_dev_project" ON "additional_development"("project_id");--> statement-breakpoint
CREATE INDEX "idx_add_dev_status" ON "additional_development"("status");--> statement-breakpoint
CREATE INDEX "idx_add_dev_year_month" ON "additional_development"("request_year_month");--> statement-breakpoint

CREATE TABLE "additional_development_effort" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "add_dev_id" UUID NOT NULL REFERENCES "additional_development"("id") ON DELETE CASCADE,
  "year_month" VARCHAR(7) NOT NULL,
  "effort" NUMERIC(8,2) NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "add_dev_effort_ym_unique" ON "additional_development_effort"("add_dev_id", "year_month");--> statement-breakpoint

CREATE TABLE "additional_development_revenue" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "add_dev_id" UUID NOT NULL REFERENCES "additional_development"("id") ON DELETE CASCADE,
  "year_month" VARCHAR(7) NOT NULL,
  "amount" NUMERIC(14,0) NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "add_dev_revenue_ym_unique" ON "additional_development_revenue"("add_dev_id", "year_month");--> statement-breakpoint

CREATE TABLE "additional_development_staff" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "add_dev_id" UUID NOT NULL REFERENCES "additional_development"("id") ON DELETE CASCADE,
  "user_id" UUID REFERENCES "user"("id"),
  "role" VARCHAR(50),
  "start_date" DATE,
  "end_date" DATE
);
