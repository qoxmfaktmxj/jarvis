import "server-only";

import type { AuthSession } from "@jarvis/auth";
import type { Permission } from "@jarvis/shared/constants/permissions";
import { isAllowedRoutePath } from "@jarvis/shared/constants/routes";
import { listMenus } from "@/lib/server/repositories/menus";

export interface MenuTreeItem {
  id: string;
  code: string;
  label: string;
  icon: string | null;
  kind: "group" | "page";
  routePath: string | null;
  sortOrder: number;
  children: MenuTreeItem[];
}

export interface MenuSourceRow {
  id: string;
  parentId: string | null;
  code: string;
  label: string;
  icon: string | null;
  kind: "group" | "page";
  routePath: string | null;
  sortOrder: number;
  isVisible: boolean;
  permissionCodes: Permission[];
}

export function buildMenuTree(rows: readonly MenuSourceRow[], permissions: readonly Permission[]): MenuTreeItem[] {
  const granted = new Set<Permission>(permissions);
  const visible = rows.filter((row) => {
    if (!row.isVisible) {
      return false;
    }
    if (!row.permissionCodes.every((code) => granted.has(code))) {
      return false;
    }
    if (row.kind === "page") {
      return row.permissionCodes.length > 0 && isAllowedRoutePath(row.routePath);
    }
    return row.routePath === null;
  });

  const byId = new Map<string, MenuTreeItem>();
  for (const row of visible) {
    byId.set(row.id, {
      id: row.id,
      code: row.code,
      label: row.label,
      icon: row.icon,
      kind: row.kind,
      routePath: row.routePath,
      sortOrder: row.sortOrder,
      children: [],
    });
  }

  const roots: MenuTreeItem[] = [];
  for (const row of visible) {
    const node = byId.get(row.id);
    if (!node) {
      continue;
    }
    if (row.parentId === null) {
      roots.push(node);
      continue;
    }
    if (row.parentId === row.id) {
      continue;
    }
    const parent = byId.get(row.parentId);
    if (parent) {
      parent.children.push(node);
    }
  }

  const sortAndPrune = (nodes: MenuTreeItem[]): MenuTreeItem[] =>
    nodes
      .map((node) => ({ ...node, children: sortAndPrune(node.children) }))
      .filter((node) => node.kind === "page" || node.children.length > 0)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, "ko"));

  return sortAndPrune(roots);
}

export async function loadMenuTree(session: AuthSession): Promise<MenuTreeItem[]> {
  const result = await listMenus({ workspaceId: session.workspaceId }, { page: 1, limit: 300 });
  return buildMenuTree(result.rows as MenuSourceRow[], session.permissions);
}
