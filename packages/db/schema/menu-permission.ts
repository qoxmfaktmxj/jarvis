import { pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { menuItem } from "./menu.js";
import { permission } from "./user.js";

export const menuPermission = pgTable(
  "menu_permission",
  {
    menuItemId: uuid("menu_item_id")
      .notNull()
      .references(() => menuItem.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permission.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.menuItemId, t.permissionId] }),
  }),
);
