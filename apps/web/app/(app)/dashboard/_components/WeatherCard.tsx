"use client";
import useSWR from "swr";
import { useTranslations } from "next-intl";
import type { WeatherSnapshot } from "@/lib/adapters/external/weather";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function WeatherCard() {
  const t = useTranslations("Dashboard.info");
  const { data } = useSWR<{
    status: "ok" | "error";
    data?: WeatherSnapshot;
  }>("/api/weather?region=seoul", fetcher, {
    refreshInterval: 600_000,
    revalidateOnFocus: true
  });
  const snap = data?.status === "ok" ? data.data : undefined;
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-(--border-default) bg-(--bg-surface) p-4">
      <span className="text-xs font-medium text-(--fg-secondary)">
        {snap
          ? `${snap.regionLabel} · ${snap.condition}`
          : t("weatherLabel")}
      </span>
      {snap ? (
        <>
          <span className="text-lg font-semibold text-(--fg-primary)">
            {snap.tempC}°
          </span>
          <span className="text-xs text-(--fg-secondary)">
            {t("weatherHiLo", { hi: snap.hiC, lo: snap.loC })} ·{" "}
            {t("weatherParticulate", { level: snap.particulate })}
          </span>
        </>
      ) : (
        <span className="text-xs text-(--fg-muted)">—</span>
      )}
    </div>
  );
}
