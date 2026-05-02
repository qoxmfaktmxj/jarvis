"use client";

import { useEffect } from "react";
import { useTabContext } from "./TabContext";

/**
 * Window-level keyboard shortcuts for tabs.
 *
 * - Ctrl+W           → close active tab
 * - Ctrl+Tab         → next tab (wraps)
 * - Ctrl+Shift+Tab   → previous tab (wraps)
 * - Ctrl+1 .. Ctrl+5 → jump to Nth tab (1-indexed)
 *
 * Mount once at the AppShell level. Avoids browser default actions when intercepted.
 */
export function useTabHotkeys(): void {
  const { tabs, activeKey, focusTab, closeTab } = useTabContext();

  useEffect(() => {
    function onKeyDown(evt: KeyboardEvent) {
      if (!evt.ctrlKey) return;
      const key = evt.key;

      if (key === "w" || key === "W") {
        if (!activeKey) return;
        evt.preventDefault();
        void closeTab(activeKey);
        return;
      }

      if (key === "Tab") {
        if (tabs.length === 0) return;
        evt.preventDefault();
        const idx = tabs.findIndex((t) => t.key === activeKey);
        const dir = evt.shiftKey ? -1 : 1;
        const next = tabs[(idx + dir + tabs.length) % tabs.length];
        if (next) focusTab(next.key);
        return;
      }

      if (/^[1-5]$/.test(key)) {
        const n = Number(key);
        const target = tabs[n - 1];
        if (!target) return;
        evt.preventDefault();
        focusTab(target.key);
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tabs, activeKey, focusTab, closeTab]);
}
