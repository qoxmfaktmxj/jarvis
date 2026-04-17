import { getTranslations } from "next-intl/server";
import { getQuickLinks } from "@/lib/queries/dashboard";
import { requirePageSession } from "@/lib/server/page-auth";
import { PageHeader } from "@/components/patterns/PageHeader";
import { ProfileInfo } from "./_components/ProfileInfo";
import { QuickMenuEditor } from "./_components/QuickMenuEditor";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const t = await getTranslations("Profile");
  const session = await requirePageSession();

  const quickLinks = await getQuickLinks(session.workspaceId, session.roles);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        eyebrow="Profile"
        title={t("title")}
        description={t("description")}
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <ProfileInfo session={session} />
        <QuickMenuEditor initialItems={quickLinks} />
      </div>
    </div>
  );
}
