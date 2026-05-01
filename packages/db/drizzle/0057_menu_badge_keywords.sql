-- Adds two metadata columns to menu_item:
--   * badge    — sidebar label badge (e.g. "AI", "NEW")
--   * keywords — CommandPalette fuzzy-match vocabulary (text[])
-- Both nullable so existing rows continue to work unchanged.
ALTER TABLE "menu_item" ADD COLUMN "badge" text;--> statement-breakpoint
ALTER TABLE "menu_item" ADD COLUMN "keywords" text[];
