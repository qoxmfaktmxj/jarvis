CREATE TABLE "sales_customer_contact_memo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"comt_seq" integer NOT NULL,
	"prior_comt_seq" integer,
	"memo" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "sales_customer_contact_memo_ws_contact_idx" ON "sales_customer_contact_memo" USING btree ("workspace_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_customer_contact_memo_seq_uniq" ON "sales_customer_contact_memo" USING btree ("workspace_id","contact_id","comt_seq");
