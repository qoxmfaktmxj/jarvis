import { useTranslations } from "next-intl";

export function UploadPlaceholderCard() {
  const t = useTranslations("Sales.Charts.Upload");
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-8">
      <h2 className="text-base font-semibold text-slate-800">{t("placeholderTitle")}</h2>
      <p className="mt-2 text-sm text-slate-600">{t("p3Notice")}</p>
      <p className="mt-1 text-xs text-slate-500">{t("p3CTA")}</p>
    </div>
  );
}
