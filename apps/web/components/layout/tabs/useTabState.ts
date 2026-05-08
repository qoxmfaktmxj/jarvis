"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
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
 * - State changes are mirrored to TabContext in a post-commit effect — never
 *   inside the useState updater. React replays queued function-updaters during
 *   the next render's useState call, so a side effect there would dispatch to
 *   TabProvider while a child component is still rendering ("Cannot update a
 *   component while rendering a different component").
 * - The `ctx` object itself is NOT in the effect deps: TabContext's value
 *   useMemo re-creates a new object whenever any tab state changes, so
 *   depending on it would re-fire the effect → setTabState → new ctx → ...
 *   ad infinitum. Stash it in a ref and read latest at fire time instead.
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
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const cached = ctx.getTabState<T>(tabKey, stateKey);
  const [state, setState] = useState<T>(cached ?? defaultValue);

  const isFirstRef = useRef(true);
  useEffect(() => {
    if (isFirstRef.current) {
      isFirstRef.current = false;
      return;
    }
    ctxRef.current.setTabState(tabKey, stateKey, state);
  }, [tabKey, stateKey, state]);

  return [state, setState];
}
