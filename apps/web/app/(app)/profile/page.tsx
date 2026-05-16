import { getTranslations } from "next-intl/server";
import { getQuickLinks } from "@/lib/queries/dashboard";
import { requirePageSession } from "@/lib/server/page-auth";
import { PageShell } from "@/components/patterns/PageShell";
import { ProfileInfo } from "./_components/ProfileInfo";
import { QuickMenuEditor } from "./_components/QuickMenuEditor";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const t = await getTranslations("Profile");
  const session = await requirePageSession();

  const quickLinks = await getQuickLinks(session);

  return (
    <PageShell title={t("title")}>
      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <ProfileInfo session={session} />
        <QuickMenuEditor initialItems={quickLinks} />
      </div>
    </PageShell>
  );
}
