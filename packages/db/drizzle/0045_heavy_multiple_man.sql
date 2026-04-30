-- Custom SQL migration file, put your code below! --
ALTER TABLE "company" DROP COLUMN IF EXISTS "representative";
ALTER TABLE "company" ADD COLUMN "object_div" varchar(10) NOT NULL DEFAULT '001';
ALTER TABLE "company" ADD COLUMN "manage_div" varchar(50);
ALTER TABLE "company" ADD COLUMN "represent_company" boolean NOT NULL DEFAULT false;
ALTER TABLE "company" ADD COLUMN "zip" varchar(10);
ALTER TABLE "company" ADD COLUMN "updated_by" varchar(50);
CREATE UNIQUE INDEX IF NOT EXISTS "company_ws_code_objdiv_unique" ON "company" ("workspace_id","code","object_div");