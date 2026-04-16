ALTER TABLE "wiki_page_index" ADD COLUMN IF NOT EXISTS "route_key" varchar(500);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wiki_page_index_ws_route_key_uniq" ON "wiki_page_index" ("workspace_id","route_key");
