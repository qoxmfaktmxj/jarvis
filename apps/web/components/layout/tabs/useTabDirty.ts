"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTabContext } from "./TabContext";
import { pathnameToTabKey } from "./tab-key";

/**
 * Page-side hook: push a dirty flag for the current tab.
 *
 * Pass a derived boolean (e.g.,
 * `state.dirtyRows.length > 0 || state.newRows.length > 0`) — the hook will
 * fire on every render and keep the tab's dirty marker in sync.
 *
 * On unmount the dirty flag is cleared. The dirty flag is NOT persisted to
 * sessionStorage; a remounted page must re-derive its dirty state from the
 * restored useTabState cache (this hook will then re-emit the flag on the
 * next render automatically).
 */
export function useTabDirty(isDirty: boolean): void {
  const pathname = usePathname() ?? "/";
  const tabKey = pathnameToTabKey(pathname);
  const { setDirty } = useTabContext();

  useEffect(() => {
    setDirty(tabKey, isDirty);
    return () => setDirty(tabKey, false);
  }, [tabKey, isDirty, setDirty]);
}
