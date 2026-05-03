ALTER TABLE "additional_development" ADD COLUMN "customer_company_id" uuid;--> statement-breakpoint
ALTER TABLE "additional_development" ADD COLUMN "is_onsite" boolean;--> statement-breakpoint
ALTER TABLE "additional_development" RENAME COLUMN "estimated_effort" TO "paid_effort";--> statement-breakpoint
ALTER TABLE "additional_development" ADD CONSTRAINT "additional_development_customer_company_id_company_id_fk" FOREIGN KEY ("customer_company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_add_dev_customer_company" ON "additional_development" USING btree ("customer_company_id");
