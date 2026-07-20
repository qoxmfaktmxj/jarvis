import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { MenuTreeItem } from "@/lib/server/menu-tree";
import { getMenuIcon } from "./icon-map";

function MenuNode({ item, depth = 0 }: { item: MenuTreeItem; depth?: number }) {
  const Icon = getMenuIcon(item.icon);
  const content = (
    <span className="flex min-w-max items-center gap-2" style={{ paddingLeft: `${depth * 12}px` }}>
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span>{item.label}</span>
    </span>
  );

  return (
    <li>
      {item.kind === "page" && item.routePath ? (
        <Link
          href={item.routePath}
          className="block rounded-md px-3 py-2 text-sm text-[var(--fg-secondary)] hover:bg-[var(--bg-surface)] hover:text-[var(--fg-primary)]"
        >
          {content}
        </Link>
      ) : (
        <div className="px-3 py-2 text-xs font-semibold text-[var(--fg-muted)]">{content}</div>
      )}
      {item.children.length > 0 ? (
        <ul className="space-y-1">
          {item.children.map((child) => (
            <MenuNode key={child.id} item={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export async function Sidebar({ items }: { items: MenuTreeItem[] }) {
  const t = await getTranslations("Navigation");
  return (
    <aside className="border-b border-[var(--border-default)] bg-[var(--bg-page)] lg:w-64 lg:border-b-0 lg:border-r">
      <div className="px-4 py-4 text-base font-semibold text-[var(--fg-primary)]">{t("productName")}</div>
      <nav aria-label={t("primary")} className="overflow-x-auto px-2 pb-3 lg:overflow-visible">
        <ul className="flex gap-1 lg:block lg:space-y-1">
          {items.map((item) => (
            <MenuNode key={item.id} item={item} />
          ))}
        </ul>
      </nav>
    </aside>
  );
}
