CREATE TYPE "public"."menu_kind" AS ENUM('menu', 'action');--> statement-breakpoint
CREATE TABLE "menu_permission" (
	"menu_item_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "menu_permission_menu_item_id_permission_id_pk" PRIMARY KEY("menu_item_id","permission_id")
);
--> statement-breakpoint
ALTER TABLE "menu_item" ADD COLUMN "code" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_item" ADD COLUMN "kind" "menu_kind" DEFAULT 'menu' NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_item" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "menu_permission" ADD CONSTRAINT "menu_permission_menu_item_id_menu_item_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_permission" ADD CONSTRAINT "menu_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_parent_id_menu_item_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."menu_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "menu_item_ws_code_unique" ON "menu_item" USING btree ("workspace_id","code");