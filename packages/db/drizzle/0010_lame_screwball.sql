CREATE TABLE "document_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"document_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector(1536),
	"tokens" integer NOT NULL,
	"sensitivity" varchar(30) DEFAULT 'INTERNAL' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_chunks" ADD CONSTRAINT "document_chunks_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_chunks_doc_chunk_uniq" ON "document_chunks" USING btree ("document_type","document_id","chunk_index");--> statement-breakpoint
CREATE INDEX "document_chunks_doc_idx" ON "document_chunks" USING btree ("document_type","document_id");--> statement-breakpoint
CREATE INDEX "document_chunks_hash_idx" ON "document_chunks" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "document_chunks_ws_idx" ON "document_chunks" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_graph_community_snapshot_community" ON "graph_community" USING btree ("snapshot_id","community_id");