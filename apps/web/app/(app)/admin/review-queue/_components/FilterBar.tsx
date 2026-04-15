"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";

const STATUS_VALUES = ["pending", "approved", "rejected", "deferred", "all"] as const;
const KIND_VALUES = [
  "all",
  "contradiction",
  "lint-report",
  "sensitivity_escalation",
  "boundary_violation",
] as const;

type StatusValue = (typeof STATUS_VALUES)[number];
type KindValue = (typeof KIND_VALUES)[number];

interface FilterBarProps {
  status: StatusValue;
  kind: KindValue;
}

export function FilterBar({ status, kind }: FilterBarProps) {
  const t = useTranslations("Admin.ReviewQueue");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function buildHref(updates: Record<string, string | null>): string {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    // Reset pagination when filters change
    next.delete("page");
    const qs = next.toString();
    return qs ? `?${qs}` : "?";
  }

  function navigate(updates: Record<string, string | null>) {
    startTransition(() => {
      router.push(buildHref(updates));
    });
  }

  const kindKeyMap: Record<KindValue, string> = {
    all: "kind.all",
    contradiction: "kind.contradiction",
    "lint-report": "kind.lintReport",
    sensitivity_escalation: "kind.sensitivityEscalation",
    boundary_violation: "kind.boundaryViolation",
  };

  return (
    <div className="flex flex-wrap items-center gap-3 border-b pb-3">
      <div className="flex gap-1">
        {STATUS_VALUES.map((s) => {
          const active = s === status;
          return (
            <button
              key={s}
              type="button"
              onClick={() => navigate({ status: s === "pending" ? null : s })}
              className={
                active
                  ? "px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground font-medium"
                  : "px-3 py-1.5 text-sm rounded-md hover:bg-muted text-muted-foreground"
              }
            >
              {t(`statusFilter.${s}` as const)}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <label className="text-sm text-muted-foreground" htmlFor="kind-filter">
          {t("kindFilterLabel")}:
        </label>
        <select
          id="kind-filter"
          value={kind}
          onChange={(e) => navigate({ kind: e.target.value === "all" ? null : e.target.value })}
          className="text-sm border rounded-md px-2 py-1.5 bg-background"
        >
          {KIND_VALUES.map((k) => (
            <option key={k} value={k}>
              {t(kindKeyMap[k] as never)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
