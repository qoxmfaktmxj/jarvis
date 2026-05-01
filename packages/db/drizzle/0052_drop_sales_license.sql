-- Phase-Sales P1.5 Task 1 (2026-05-01): drop mis-mapped sales_license tables.
-- P1 incorrectly used sales/licenses for what is actually Jarvis ERP infra license
-- per company (TBIZ500). Will be re-introduced as infra_license in Task 5.
--
-- Order: code (referenced via license_kind_cd FK-by-convention) before master.
DROP TABLE IF EXISTS "sales_license_code" CASCADE;
DROP TABLE IF EXISTS "sales_license" CASCADE;
