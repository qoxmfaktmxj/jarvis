"use client";

import { useEffect } from "react";

/**
 * Dev-only accessibility auditor.
 *
 * Dynamically loads @axe-core/react in development to log accessibility
 * violations in the browser console. Does not ship in production builds.
 */
export function AxeInit() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      return;
    }
    let cancelled = false;
    void (async () => {
      const [React, ReactDOM, axe] = await Promise.all([
        import("react"),
        import("react-dom"),
        import("@axe-core/react"),
      ]);
      if (cancelled) return;
      axe.default(React, ReactDOM, 1000);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
