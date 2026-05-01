-- Phase-Sales P1.5 Task 3: add mail_id (NOT NULL, unique) + memo to sales_mail_person
ALTER TABLE "sales_mail_person" ADD COLUMN "mail_id" text NOT NULL;
ALTER TABLE "sales_mail_person" ADD COLUMN "memo" text;
CREATE UNIQUE INDEX IF NOT EXISTS "sales_mail_person_mail_id_uniq" ON "sales_mail_person" ("workspace_id","mail_id");
