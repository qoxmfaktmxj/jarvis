"use client";

/**
 * apps/web/app/(app)/admin/observability/wiki/WikiObservabilityClient.tsx
 *
 * Phase-W3 v4-W3-T5 — client wrapper that auto-refreshes the RSC dashboard
 * every 30 seconds by calling `router.refresh()`. Keeps all data fetching
 * in the server component; this file is purely the refresh ticker.
 *
 * Admin-only page — Korean strings are hardcoded by design (see task spec).
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface WikiObservabilityClientProps {
  children: React.ReactNode;
  /** Server-side render timestamp (ISO) — displayed + used to detect refresh. */
  renderedAt: string;
  /** Refresh interval in ms. Defaults to 30_000. */
  intervalMs?: number;
}

export function WikiObservabilityClient({
  children,
  renderedAt,
  intervalMs = 30_000,
}: WikiObservabilityClientProps) {
  const router = useRouter();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastTickAt, setLastTickAt] = useState<string>(renderedAt);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      setLastTickAt(new Date().toISOString());
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [autoRefresh, intervalMs, router]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border rounded-md bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        <span>
          렌더 시각: <code>{renderedAt}</code>
          {lastTickAt !== renderedAt ? (
            <>
              {" "}· 마지막 새로고침 tick: <code>{lastTickAt}</code>
            </>
          ) : null}
        </span>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-3 w-3"
          />
          <span>
            자동 새로고침 ({Math.round(intervalMs / 1000)}s)
          </span>
          <button
            type="button"
            onClick={() => {
              setLastTickAt(new Date().toISOString());
              router.refresh();
            }}
            className="ml-2 rounded border px-2 py-0.5 hover:bg-accent"
          >
            수동 새로고침
          </button>
        </label>
      </div>
      {children}
    </div>
  );
}
