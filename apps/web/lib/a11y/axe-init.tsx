"use client";

import { useEffect } from "react";

export function AxeInit() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    let cancelled = false;
    let observer: MutationObserver | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let onVisibility: (() => void) | null = null;
    let lastSignature = "";

    void (async () => {
      const axe = (await import("axe-core")).default;
      if (cancelled) return;

      const run = async () => {
        if (cancelled) return;
        if (document.visibilityState !== "visible") return;
        try {
          const results = await axe.run(document);
          if (cancelled) return;

          const signature = results.violations
            .map((v) => `${v.id}:${v.nodes.length}`)
            .join("|");
          if (signature === lastSignature) return;
          lastSignature = signature;

          if (results.violations.length === 0) {
            console.debug("%c[axe] no violations", "color:#16a34a");
            return;
          }
          console.groupCollapsed(
            `%c[axe] ${results.violations.length} accessibility violation(s)`,
            "color:#b91c1c;font-weight:600",
          );
          results.violations.forEach((v) => {
            console.warn(`${v.id} (${v.impact}) — ${v.help}`, {
              helpUrl: v.helpUrl,
              nodes: v.nodes.map((n) => n.target),
            });
          });
          console.groupEnd();
        } catch {
          // axe runtime errors are non-fatal in dev
        }
      };

      const schedule = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          void run();
        }, 500);
      };

      void run();

      observer = new MutationObserver(schedule);
      observer.observe(document.body, { childList: true, subtree: true });

      onVisibility = () => {
        if (document.visibilityState === "visible") schedule();
      };
      document.addEventListener("visibilitychange", onVisibility);
    })();

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      observer?.disconnect();
      if (onVisibility) {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, []);

  return null;
}
