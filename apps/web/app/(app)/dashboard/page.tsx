import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { requirePagePermission } from "@/lib/server/page-auth";

export default async function DashboardPage() {
  await requirePagePermission(PERMISSIONS.WIKI_READ, "/dashboard");
  const t = await getTranslations("Dashboard.Home");
  return (
    <PageShell>
      <PageHeader title={t("title")} description={t("description")} />
      <section className="rounded-lg border border-[var(--border-default)] bg-[var(--bg-page)] p-5 shadow-[var(--shadow-soft)]">
        <h2 className="font-medium text-[var(--fg-primary)]">{t("evidenceTitle")}</h2>
        <p className="mt-2 text-sm text-[var(--fg-secondary)]">{t("evidenceDescription")}</p>
      </section>
    </PageShell>
  );
}
