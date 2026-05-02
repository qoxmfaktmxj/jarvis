import { useTranslations } from "next-intl";

export function EmptyChartState() {
  const t = useTranslations("Sales.Charts.Common");
  return (
    <div className="flex h-[240px] items-center justify-center rounded-md border border-dashed border-slate-200 text-sm text-slate-500">
      {t("empty")}
    </div>
  );
}
