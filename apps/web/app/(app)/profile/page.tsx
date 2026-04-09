import { getTranslations } from "next-intl/server";
import { getQuickLinks } from "@/lib/queries/dashboard";
import { requirePageSession } from "@/lib/server/page-auth";
import { ProfileInfo } from "./_components/ProfileInfo";
import { QuickMenuEditor } from "./_components/QuickMenuEditor";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const t = await getTranslations("Profile");
  const session = await requirePageSession();

  const quickLinks = await getQuickLinks(session.workspaceId, session.roles);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          {t("title")}
        </h1>
        <p className="text-sm text-gray-500">
          {t("description")}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <ProfileInfo session={session} />
        <QuickMenuEditor initialItems={quickLinks} />
      </div>
    </div>
  );
}
