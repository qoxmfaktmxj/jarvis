CREATE TABLE "graph_community" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"community_id" integer NOT NULL,
	"label" varchar(500),
	"node_count" integer NOT NULL,
	"cohesion_score" varchar(10),
	"top_nodes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graph_edge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"source_node_id" varchar(500) NOT NULL,
	"target_node_id" varchar(500) NOT NULL,
	"relation" varchar(100) NOT NULL,
	"confidence" varchar(20) NOT NULL,
	"confidence_score" varchar(10),
	"source_file" varchar(1000),
	"weight" varchar(10) DEFAULT '1.0',
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graph_node" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"node_id" varchar(500) NOT NULL,
	"label" varchar(500) NOT NULL,
	"file_type" varchar(50),
	"source_file" varchar(1000),
	"source_location" varchar(50),
	"community_id" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "graph_community" ADD CONSTRAINT "graph_community_snapshot_id_graph_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."graph_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_edge" ADD CONSTRAINT "graph_edge_snapshot_id_graph_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."graph_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_node" ADD CONSTRAINT "graph_node_snapshot_id_graph_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."graph_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_graph_edge_snapshot_source" ON "graph_edge" USING btree ("snapshot_id","source_node_id");--> statement-breakpoint
CREATE INDEX "idx_graph_edge_snapshot_target" ON "graph_edge" USING btree ("snapshot_id","target_node_id");--> statement-breakpoint
CREATE INDEX "idx_graph_edge_relation" ON "graph_edge" USING btree ("snapshot_id","relation");--> statement-breakpoint
CREATE INDEX "idx_graph_node_snapshot_node" ON "graph_node" USING btree ("snapshot_id","node_id");--> statement-breakpoint
CREATE INDEX "idx_graph_node_community" ON "graph_node" USING btree ("snapshot_id","community_id");--> statement-breakpoint
CREATE INDEX "idx_graph_node_label" ON "graph_node" USING btree ("label");