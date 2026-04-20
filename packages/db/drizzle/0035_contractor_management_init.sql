-- Add employment_type column to user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "employment_type" varchar(20) NOT NULL DEFAULT 'internal';

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contractor_contract" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "enter_cd" varchar(30),
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "generated_leave_hours" numeric(6, 1) NOT NULL,
  "additional_leave_hours" numeric(6, 1) NOT NULL DEFAULT '0',
  "note" text,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "contractor_contract" ADD CONSTRAINT "contractor_contract_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "contractor_contract" ADD CONSTRAINT "contractor_contract_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leave_request" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "contract_id" uuid NOT NULL,
  "type" varchar(20) NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "time_from" timestamp with time zone,
  "time_to" timestamp with time zone,
  "hours" numeric(5, 1) NOT NULL,
  "reason" text,
  "status" varchar(20) NOT NULL DEFAULT 'approved',
  "cancelled_at" timestamp with time zone,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_contract_id_contractor_contract_id_fk"
  FOREIGN KEY ("contract_id") REFERENCES "public"."contractor_contract"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_created_by_user_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "holiday" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "date" date NOT NULL,
  "name" varchar(100) NOT NULL,
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "holiday" ADD CONSTRAINT "holiday_workspace_id_workspace_id_fk"
  FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contract_user" ON "contractor_contract" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_contract_status" ON "contractor_contract" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leave_user" ON "leave_request" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leave_contract" ON "leave_request" ("contract_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_leave_date" ON "leave_request" ("start_date", "end_date");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "holiday_workspace_date_unique" ON "holiday" ("workspace_id", "date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_holiday_date" ON "holiday" ("date");

-- Partial unique: 한 workspace, 한 user 당 active 계약은 1건만
CREATE UNIQUE INDEX IF NOT EXISTS "idx_contract_one_active"
  ON "contractor_contract"("workspace_id", "user_id")
  WHERE "status" = 'active';
