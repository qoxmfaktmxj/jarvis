"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface PaginationProps {
  page: number;
  totalPages: number;
}

export function Pagination({ page, totalPages }: PaginationProps) {
  const t = useTranslations("Admin.ReviewQueue.pagination");
  const searchParams = useSearchParams();

  function hrefForPage(target: number): string {
    const next = new URLSearchParams(searchParams.toString());
    if (target <= 1) next.delete("page");
    else next.set("page", String(target));
    const qs = next.toString();
    return qs ? `?${qs}` : "?";
  }

  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <>
      <span className="text-sm text-surface-500">
        {t("pageInfo", { page, total: Math.max(totalPages, 1) })}
      </span>
      <div className="flex gap-2">
        <Button asChild variant="outline" size="sm" disabled={!hasPrev}>
          {hasPrev ? (
            <Link href={hrefForPage(page - 1)}>{t("previous")}</Link>
          ) : (
            <span aria-disabled className="pointer-events-none opacity-50">
              {t("previous")}
            </span>
          )}
        </Button>
        <Button asChild variant="outline" size="sm" disabled={!hasNext}>
          {hasNext ? (
            <Link href={hrefForPage(page + 1)}>{t("next")}</Link>
          ) : (
            <span aria-disabled className="pointer-events-none opacity-50">
              {t("next")}
            </span>
          )}
        </Button>
      </div>
    </>
  );
}
