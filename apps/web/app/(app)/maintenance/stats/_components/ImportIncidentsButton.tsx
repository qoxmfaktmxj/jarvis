"use client";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { importIncidents } from "../actions";

interface Props {
  ym: string;
}

export function ImportIncidentsButton({ ym }: Props) {
  const t = useTranslations("Maintenance.Stats.import");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function trigger() {
    startTransition(async () => {
      try {
        const r = await importIncidents({ ym });
        setMsg(
          r.ok
            ? t("success", { inserted: r.inserted })
            : t("error", { message: r.errors[0]?.message ?? "unknown" }),
        );
      } catch (err) {
        setMsg(
          t("error", { message: err instanceof Error ? err.message : String(err) }),
        );
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={trigger}
        disabled={pending}
        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
      >
        {t(pending ? "importing" : "button", { ym })}
      </button>
      {msg && <span className="text-xs text-slate-600">{msg}</span>}
    </div>
  );
}
