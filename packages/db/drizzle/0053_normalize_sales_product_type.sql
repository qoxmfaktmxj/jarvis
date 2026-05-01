-- Phase-Sales P1.5 Task 2 (2026-05-01): normalize sales_product_type into 3 tables.
-- TBIZ024 was a row-mapping (product × cost × period). P1 collapsed the mapping
-- into a jsonb on the master, which loses row-level identity for FK CASCADE
-- and indexed lookup. Splits into:
--   sales_product_type        (master, kept)
--   sales_cost_master         (master, reused)
--   sales_product_type_cost   (mapping, new)
-- Operational data 0 rows assumed (P1.5 sprint).

-- 1) drop the jsonb cost_mapping_json column on master
ALTER TABLE "sales_product_type" DROP COLUMN IF EXISTS "cost_mapping_json";

-- 2) create sales_product_type_cost mapping row table
CREATE TABLE IF NOT EXISTS "sales_product_type_cost" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "product_type_id" uuid NOT NULL,
  "cost_id" uuid NOT NULL,
  "legacy_product_type_cd" text,
  "legacy_cost_cd" text,
  "sdate" date NOT NULL,
  "edate" date,
  "biz_yn" boolean DEFAULT false NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  CONSTRAINT "sales_product_type_cost_product_type_fk" FOREIGN KEY ("product_type_id") REFERENCES "sales_product_type"("id") ON DELETE CASCADE,
  CONSTRAINT "sales_product_type_cost_cost_fk" FOREIGN KEY ("cost_id") REFERENCES "sales_cost_master"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "sales_product_type_cost_ws_pid_cid_sdate_uniq" ON "sales_product_type_cost" ("workspace_id","product_type_id","cost_id","sdate");
CREATE INDEX IF NOT EXISTS "sales_product_type_cost_ws_pid_idx" ON "sales_product_type_cost" ("workspace_id","product_type_id");
