"use client";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import type { FxSnapshot } from "@/lib/adapters/external/fx";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function FxCard() {
  const t = useTranslations("Dashboard.info");
  const { data } = useSWR<{ status: "ok" | "error"; data?: FxSnapshot }>(
    "/api/fx",
    fetcher,
    {
      refreshInterval: 3_600_000,
      revalidateOnFocus: true
    }
  );
  const snap = data?.status === "ok" ? data.data : undefined;
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-surface-200 bg-card p-4">
      <span className="text-xs font-medium text-surface-500">
        {t("fxLabel")}
      </span>
      {snap ? (
        <ul className="flex gap-4 text-sm tabular-nums">
          {snap.rates.map((r) => (
            <li key={r.code} className="flex flex-col">
              <span className="text-[11px] font-medium text-surface-500">
                {r.code}
                {r.basis === "100" ? " · 100" : ""}
              </span>
              <span className="text-lg font-semibold text-surface-900">
                {r.value.toLocaleString("ko-KR")}
              </span>
              <span
                className={
                  r.delta >= 0 ? "text-isu-600 text-xs" : "text-danger text-xs"
                }
              >
                {r.delta >= 0 ? "▲" : "▼"} {Math.abs(r.delta).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-xs text-surface-400">—</span>
      )}
    </div>
  );
}
