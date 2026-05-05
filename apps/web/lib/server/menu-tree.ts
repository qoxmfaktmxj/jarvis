import { and, asc, eq } from "drizzle-orm";
import { db } from "@jarvis/db/client";
import { menuItem } from "@jarvis/db/schema/menu";
import { menuPermission } from "@jarvis/db/schema/menu-permission";
import { role, rolePermission, userRole } from "@jarvis/db/schema/user";
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
 *   visible descendants (cascade), treat orphan children as roots so RLS
 *   filtering of a parent does not remove the entire subtree, and detect
 *   parent_id cycles (defensive — DB schema does not currently enforce
 *   acyclic parents). Cyclic nodes are pruned with no infinite recursion.
 * - `getVisibleMenuTree(session, kind)` issues two parallel queries: (A) a
 *   join through `menu_permission ⨯ role_permission ⨯ user_role` for the
 *   permission-filtered leaves the user is allowed to see, and (B) a plain
 *   `menu_item` scan for group-header rows (`routePath = ""`) which have no
 *   `menu_permission` entries by design. The results are deduped by id and
 *   passed to `buildMenuTree`, whose empty-group prune drops any header
 *   whose subtree has no surviving leaf (so the unfiltered (B) query does
 *   not leak headers for empty subtrees). DB errors are caught and logged
 *   so the global app shell does not 500 if either query fails for any
 *   reason — callers receive an empty tree instead.
 *
 * **Admin viewer uses a different function.** For unfiltered admin listings
 * (e.g. `/admin/menus` viewer) use `getMenuTree(workspaceId)` at
 * `apps/web/lib/queries/admin.ts` — that function returns ALL rows in the
 * workspace and assumes the calling page has already enforced ADMIN_ALL.
 */

export type MenuKind = "menu" | "action";

export type FlatMenuItem = {
  id: string;
  parentId: string | null;
  code: string;
  kind: MenuKind;
  label: string;
  icon: string | null;
  routePath: string | null;
  sortOrder: number;
  /**
   * Optional sidebar label badge (e.g. "AI"). Marked optional so older test
   * fixtures and external callers don't have to backfill it. Sidebar treats
   * `undefined` and `null` identically (no badge rendered).
   */
  badge?: string | null;
  /**
   * Optional fuzzy-search keywords for CommandPalette. Optional for the same
   * reason as `badge`.
   */
  keywords?: string[] | null;
};

export type MenuTreeNode = FlatMenuItem & { children: MenuTreeNode[] };

/**
 * Pure function: assemble a flat list into a tree.
 *
 * Behavior:
 * - Roots: nodes with `parentId === null` OR whose parentId isn't in the flat
 *   set (orphans — RLS may have filtered the parent; promote child to root).
 * - Sort: every level by `sortOrder` ascending. Ties broken by input order
 *   (Array.sort is stable per ES2019).
 * - Prune: nodes with no `routePath` AND no surviving children are removed
 *   (cascade — recurses bottom-up).
 * - Cycle: if `parent_id` graph contains a cycle, the cyclic nodes that would
 *   recurse are pruned (path-tracking set); no infinite recursion.
 * - Empty input returns empty array.
 */
export function buildMenuTree(flat: FlatMenuItem[]): MenuTreeNode[] {
  const byId = new Map<string, MenuTreeNode>();
  for (const f of flat) byId.set(f.id, { ...f, children: [] });

  const roots: MenuTreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId !== null && byId.has(node.parentId)) {
      const parent = byId.get(node.parentId);
      if (parent) parent.children.push(node);
    } else {
      // Treat both null parentId AND orphan-with-missing-parent as root.
      roots.push(node);
    }
  }

  // Path-tracking set: a node id present in `path` is currently on the
  // recursion stack from this DFS root, so revisiting it would be a cycle.
  function sortAndPrune(nodes: MenuTreeNode[], path: Set<string>): MenuTreeNode[] {
    const result: MenuTreeNode[] = [];
    for (const n of nodes) {
      if (path.has(n.id)) {
        // Cycle detected — prune cyclic descendant. Log so ops can audit
        // the offending parent_id graph (DB schema doesn't enforce acyclic).
        console.warn(
          `[menu-tree] parent_id cycle pruned at node id=${n.id} code=${n.code}; check menu_item.parent_id in DB`,
        );
        continue;
      }
      path.add(n.id);
      const pruned: MenuTreeNode = { ...n, children: sortAndPrune(n.children, path) };
      path.delete(n.id);
      const hasNoRoute = pruned.routePath === null || pruned.routePath === "";
      const isEmptyGroup = hasNoRoute && pruned.children.length === 0;
      if (!isEmptyGroup) {
        result.push(pruned);
      }
    }
    return result.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return sortAndPrune(roots, new Set());
}

/**
 * Returns the menu tree visible to `session` for the given `kind`. Empty array
 * is returned (without throwing) if the session is missing required ids or if
 * the DB query fails.
 *
 * Two queries (run in parallel) feed buildMenuTree:
 *   (A) leaves the user is permission-allowed to see — joins through
 *       menu_permission ⨯ role_permission ⨯ user_role.
 *   (B) group-header rows (routePath = "") for the workspace — fetched
 *       unconditionally because they have no menu_permission entries by
 *       design. buildMenuTree's empty-group prune drops headers whose
 *       subtree has no visible leaf, so privacy is not affected.
 */
export async function getVisibleMenuTree(
  session: JarvisSession,
  kind: MenuKind = "menu",
): Promise<MenuTreeNode[]> {
  // Fail-closed: invalid session shape → no menus, do not query.
  if (!session.userId || !session.workspaceId) return [];

  try {
    const [visibleLeaves, groupHeaders] = await Promise.all([
      // (A) permission-filtered rows — current join chain (UNCHANGED logic)
      db
        .selectDistinct({
          id: menuItem.id,
          parentId: menuItem.parentId,
          code: menuItem.code,
          kind: menuItem.kind,
          label: menuItem.label,
          icon: menuItem.icon,
          routePath: menuItem.routePath,
          sortOrder: menuItem.sortOrder,
          badge: menuItem.badge,
          keywords: menuItem.keywords,
        })
        .from(menuItem)
        .innerJoin(menuPermission, eq(menuPermission.menuItemId, menuItem.id))
        .innerJoin(
          rolePermission,
          eq(rolePermission.permissionId, menuPermission.permissionId),
        )
        // Tenant-isolate the role: a user_role row pointing to a role in
        // workspace B must not surface workspace A's menus, even if their
        // permission_id collides via menu_permission.
        .innerJoin(
          role,
          and(
            eq(role.id, rolePermission.roleId),
            eq(role.workspaceId, session.workspaceId),
          ),
        )
        .innerJoin(userRole, eq(userRole.roleId, role.id))
        .where(
          and(
            eq(userRole.userId, session.userId),
            eq(menuItem.workspaceId, session.workspaceId),
            eq(menuItem.kind, kind),
            eq(menuItem.isVisible, true),
          ),
        )
        .orderBy(asc(menuItem.sortOrder)),
      // (B) group headers — rows with empty routePath, no permission filter.
      // buildMenuTree's empty-group prune drops headers whose subtree has no
      // visible leaf, so this is safe (no privacy leak).
      db
        .select({
          id: menuItem.id,
          parentId: menuItem.parentId,
          code: menuItem.code,
          kind: menuItem.kind,
          label: menuItem.label,
          icon: menuItem.icon,
          routePath: menuItem.routePath,
          sortOrder: menuItem.sortOrder,
          badge: menuItem.badge,
          keywords: menuItem.keywords,
        })
        .from(menuItem)
        .where(
          and(
            eq(menuItem.workspaceId, session.workspaceId),
            eq(menuItem.kind, kind),
            eq(menuItem.isVisible, true),
            eq(menuItem.routePath, ""),
          ),
        ),
    ]);

    // Dedup by id (a row matching both queries — defensive — counted once).
    const merged = new Map<string, (typeof visibleLeaves)[number]>();
    for (const row of visibleLeaves) merged.set(row.id, row);
    for (const row of groupHeaders) if (!merged.has(row.id)) merged.set(row.id, row);

    return buildMenuTree([...merged.values()]);
  } catch (err) {
    // The sidebar lives in the global app shell; a DB hiccup here must not
    // 500 the entire page. Log and degrade to "no menus" so navigation
    // disappears but the rest of the page still renders.
    console.warn(
      `[menu-tree] getVisibleMenuTree failed (user=${session.userId}, ws=${session.workspaceId}, kind=${kind}):`,
      err,
    );
    return [];
  }
}
