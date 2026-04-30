import { sql } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import type { JarvisSession } from "@jarvis/auth/types";

/**
 * apps/web/lib/server/menu-tree.ts
 *
 * RBAC menu tree (Task 3) — server helper that returns the menu tree visible
 * to a given session, plus a pure tree-builder used by the helper and unit
 * tests.
 *
 * - `buildMenuTree(flat)` is a pure function (no IO): assemble flat rows into
 *   a tree, sort by `sortOrder`, prune nodes lacking both `routePath` and
 *   visible descendants (cascade), and treat orphan children as roots so RLS
 *   filtering of a parent does not remove the entire subtree from the user's
 *   navigation.
 * - `getVisibleMenuTree(session, kind)` issues a single UNION query through
 *   `role_permission` and `user_role`, returning DISTINCT `menu_item` rows
 *   the user is allowed to see, then delegates to `buildMenuTree`.
 */

export type MenuKind = "menu" | "action";

export interface FlatMenuItem {
  id: string;
  parentId: string | null;
  code: string;
  kind: MenuKind;
  label: string;
  icon: string | null;
  routePath: string | null;
  sortOrder: number;
}

export type MenuTreeNode = FlatMenuItem & { children: MenuTreeNode[] };

/**
 * Pure function: assemble a flat list into a tree.
 * - Roots are nodes with `parentId === null` OR whose parentId isn't in the
 *   flat set (orphans — RLS may have filtered the parent; promote child to
 *   root so the user still sees the leaf).
 * - Sort by `sortOrder` ascending at every level.
 * - Prune nodes that have no `routePath` AND no children after pruning
 *   (cascade — recurses bottom-up).
 * - Empty input returns empty array.
 */
export function buildMenuTree(flat: FlatMenuItem[]): MenuTreeNode[] {
  const byId = new Map<string, MenuTreeNode>();
  for (const f of flat) byId.set(f.id, { ...f, children: [] });

  const roots: MenuTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId !== null && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      // Treat both null parentId AND orphan-with-missing-parent as root.
      roots.push(node);
    }
  }

  function sortAndPrune(nodes: MenuTreeNode[]): MenuTreeNode[] {
    return nodes
      .map((n) => ({ ...n, children: sortAndPrune(n.children) }))
      .filter((n) => n.routePath !== null || n.children.length > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return sortAndPrune(roots);
}

/**
 * UNION model: any permission held by any of the user's roles → menu visible.
 * `DISTINCT mi.id` collapses duplicates from multiple matching permissions.
 */
export async function getVisibleMenuTree(
  session: JarvisSession,
  kind: MenuKind = "menu",
): Promise<MenuTreeNode[]> {
  const result = await db.execute<{
    id: string;
    parentId: string | null;
    code: string;
    kind: MenuKind;
    label: string;
    icon: string | null;
    routePath: string | null;
    sortOrder: number;
  }>(sql`
    SELECT DISTINCT
      mi.id,
      mi.parent_id  AS "parentId",
      mi.code,
      mi.kind,
      mi.label,
      mi.icon,
      mi.route_path AS "routePath",
      mi.sort_order AS "sortOrder"
    FROM menu_item mi
    JOIN menu_permission mp ON mp.menu_item_id = mi.id
    JOIN role_permission rp ON rp.permission_id = mp.permission_id
    JOIN user_role       ur ON ur.role_id = rp.role_id
    WHERE ur.user_id = ${session.userId}
      AND mi.workspace_id = ${session.workspaceId}
      AND mi.kind = ${kind}
      AND mi.is_visible = true
    ORDER BY mi.sort_order
  `);

  return buildMenuTree(result.rows);
}
