DROP INDEX "idx_graph_node_snapshot_node";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_graph_node_snapshot_node" ON "graph_node" USING btree ("snapshot_id","node_id");