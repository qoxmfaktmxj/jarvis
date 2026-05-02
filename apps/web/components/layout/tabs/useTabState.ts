"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import { usePathname } from "next/navigation";
import { useTabContext } from "./TabContext";
import { pathnameToTabKey } from "./tab-key";
import type { StateKey } from "./tab-types";

/**
 * Page-side hook for preserving state across tab switches.
 *
 * - Tab key is derived automatically from `usePathname()`.
 * - On mount, reads cached state from TabContext (if any) and uses it as the
 *   initial value.
 * - On every state change, writes to TabContext (which mirrors to sessionStorage).
 *
 * Pages should derive a corresponding `useTabDirty(...)` from the resulting
 * state so the dirty marker on the tab and the close-confirm dialog work
 * correctly. The dirty flag is NOT persisted — every remount must re-emit it
 * based on the restored state.
 */
export function useTabState<T>(
  stateKey: StateKey,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const pathname = usePathname() ?? "/";
  const tabKey = pathnameToTabKey(pathname);
  const ctx = useTabContext();

  const cached = ctx.getTabState<T>(tabKey, stateKey);
  const [state, setState] = useState<T>(cached ?? defaultValue);

  const update = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      setState((prev) => {
        const next =
          typeof action === "function"
            ? (action as (p: T) => T)(prev)
            : action;
        ctx.setTabState(tabKey, stateKey, next);
        return next;
      });
    },
    [ctx, tabKey, stateKey],
  );

  return [state, update];
}
