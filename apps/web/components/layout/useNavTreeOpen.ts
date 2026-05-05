'use client';

/**
 * useNavTreeOpen — sidebar tree expand/collapse state.
 *
 * State source of truth:
 *   1. localStorage key `jv.sidebar.tree` — explicit user choices
 *   2. Active-route fallback — open the chain of groups that contain the
 *      current pathname's leaf (group + any sub-group ancestors).
 *
 * Stored values OVERRIDE active-route default (a user who explicitly closed
 * a group stays closed even when navigating into it).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MenuTreeNode } from '@/lib/server/menu-tree';

export const NAV_TREE_KEY = 'jv.sidebar.tree';

export type OpenMap = Record<string, boolean>;

function readStored(): OpenMap | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(NAV_TREE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as OpenMap;
    }
  } catch {
    // corrupted storage — ignore
  }
  return null;
}

function writeStored(map: OpenMap) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NAV_TREE_KEY, JSON.stringify(map));
  } catch {
    // quota / disabled — ignore
  }
}

/**
 * Walk the tree to find the chain of group codes that lead to a leaf with
 * a matching routePath. Active match: leaf.routePath === pathname OR
 * pathname.startsWith(`${leaf.routePath}/`). The trailing slash guard prevents
 * `/wiki-x` from matching a `/wiki` leaf, while still allowing `/wiki/graph`.
 *
 * Ancestors include only **group** codes (routePath is null or `""`), not
 * leaf codes — leaves are matched but not pushed onto the chain.
 */
function findActiveChain(
  nodes: MenuTreeNode[],
  pathname: string,
  ancestors: string[] = [],
): string[] | null {
  for (const n of nodes) {
    const isGroup = n.routePath === '' || n.routePath === null;
    if (!isGroup && n.routePath) {
      if (pathname === n.routePath || pathname.startsWith(`${n.routePath}/`)) {
        return ancestors;
      }
    }
    if (n.children.length > 0) {
      const nextAncestors = isGroup ? [...ancestors, n.code] : ancestors;
      const found = findActiveChain(n.children, pathname, nextAncestors);
      if (found) return found;
    }
  }
  return null;
}

export function computeInitialOpen(
  menus: MenuTreeNode[],
  pathname: string,
  stored: OpenMap | null,
): OpenMap {
  const open: OpenMap = {};
  const chain = findActiveChain(menus, pathname);
  if (chain) for (const code of chain) open[code] = true;
  // Stored values override defaults.
  if (stored) {
    for (const [code, val] of Object.entries(stored)) {
      open[code] = val;
    }
  }
  return open;
}

type Args = {
  menus: MenuTreeNode[];
  pathname: string;
};

export function useNavTreeOpen({ menus, pathname }: Args) {
  const [stored, setStored] = useState<OpenMap | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount (client-only).
  useEffect(() => {
    setStored(readStored());
    setHydrated(true);
  }, []);

  // Recompute the merged open map whenever route, tree, or stored changes.
  const open: OpenMap = useMemo(
    () => computeInitialOpen(menus, pathname, hydrated ? stored : null),
    [menus, pathname, stored, hydrated],
  );

  const isOpen = useCallback((code: string) => open[code] === true, [open]);

  const toggle = useCallback(
    (code: string) => {
      const currentlyOpen = open[code] === true;
      const next: OpenMap = { ...(stored ?? {}), [code]: !currentlyOpen };
      writeStored(next);
      setStored(next);
    },
    [open, stored],
  );

  return { isOpen, toggle };
}
