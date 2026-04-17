"use client";

/**
 * apps/web/app/(app)/admin/observability/wiki/WikiObservabilityClient.tsx
 *
 * Phase-W3 v4-W3-T5 — client wrapper that auto-refreshes the RSC dashboard
 * every 30 seconds by calling `router.refresh()`.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface WikiObservabilityClientProps {
  children: React.ReactNode;
  renderedAt: string;
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
      <div className="flex items-center justify-between rounded-xl border border-surface-200 bg-surface-50 px-4 py-2 text-xs text-surface-600">
        <span>
          렌더 시각: <code>{renderedAt}</code>
          {lastTickAt !== renderedAt ? (
            <>
              {" "}· 마지막 새로고침 tick: <code>{lastTickAt}</code>
            </>
          ) : null}
        </span>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="h-3 w-3"
          />
          <span>
            자동 새로고침 ({Math.round(intervalMs / 1000)}s)
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-2 h-7"
            onClick={() => {
              setLastTickAt(new Date().toISOString());
              router.refresh();
            }}
          >
            수동 새로고침
          </Button>
        </label>
      </div>
      {children}
    </div>
  );
}
