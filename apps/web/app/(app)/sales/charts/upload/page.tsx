import { getTranslations } from "next-intl/server";
import { UploadPlaceholderCard } from "./_components/UploadPlaceholderCard";

export default async function UploadPage() {
  const t = await getTranslations("Sales.Charts.Upload");
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">{t("placeholderTitle")}</h1>
      <UploadPlaceholderCard />
    </div>
  );
}
