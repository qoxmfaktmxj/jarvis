-- Drop ask_mode column from ask_conversation (Simple/Expert toggle removal).
-- 2026-04-21: Model selector replaces response-style toggle.
-- Non-reversible: column values (always 'simple' or 'expert') are discarded.
ALTER TABLE "ask_conversation" DROP COLUMN IF EXISTS "ask_mode";
