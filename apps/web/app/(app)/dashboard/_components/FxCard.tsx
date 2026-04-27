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
    <div className="flex flex-col gap-1 rounded-xl border border-[--border-default] bg-[--bg-surface] p-4">
      <span className="text-xs font-medium text-[--fg-secondary]">
        {t("fxLabel")}
      </span>
      {snap ? (
        <ul className="flex gap-4 text-sm tabular-nums">
          {snap.rates.map((r) => (
            <li key={r.code} className="flex flex-col">
              <span className="text-[11px] font-medium text-[--fg-secondary]">
                {r.code}
                {r.basis === "100" ? " · 100" : ""}
              </span>
              <span className="text-lg font-semibold text-[--fg-primary]">
                {r.value.toLocaleString("ko-KR")}
              </span>
              <span
                className={
                  r.delta >= 0 ? "text-[--brand-primary] text-xs" : "text-danger text-xs"
                }
              >
                {r.delta >= 0 ? "▲" : "▼"} {Math.abs(r.delta).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-xs text-[--fg-muted]">—</span>
      )}
    </div>
  );
}
