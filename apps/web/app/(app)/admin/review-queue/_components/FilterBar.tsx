"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

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
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1">
        {STATUS_VALUES.map((s) => {
          const active = s === status;
          return (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={active ? "default" : "ghost"}
              onClick={() => navigate({ status: s === "pending" ? null : s })}
            >
              {t(`statusFilter.${s}` as const)}
            </Button>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <label className="text-sm text-surface-600" htmlFor="kind-filter">
          {t("kindFilterLabel")}:
        </label>
        <select
          id="kind-filter"
          value={kind}
          onChange={(e) => navigate({ kind: e.target.value === "all" ? null : e.target.value })}
          className="rounded-md border border-surface-200 bg-white px-2 py-1.5 text-sm text-surface-900 focus:outline-none focus:ring-2 focus:ring-ring"
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
