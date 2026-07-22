import { getTranslations } from "next-intl/server";
import type { MenuTreeItem } from "@/lib/server/menu-tree";
import { SidebarClient } from "./SidebarClient";

export async function Sidebar({ items }: { items: MenuTreeItem[] }) {
  const t = await getTranslations("Navigation");
  return <SidebarClient items={items} labels={{
    primary: t("primary"),
    productName: t("productName"),
    collapseSidebar: t("collapseSidebar"),
    expandSidebar: t("expandSidebar"),
    goDashboard: t("goDashboard"),
  }} />;
}
