import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/patterns/PageHeader";
import { PageShell } from "@/components/patterns/PageShell";
import { requirePageSession } from "@/lib/server/page-auth";
import { PasswordForm } from "./_components/PasswordForm";

export default async function ProfilePage() {
  const session = await requirePageSession("/profile");
  const t = await getTranslations("Profile.Page");
  const roleLabel = {
    ADMIN: t("roles.admin"),
    EDITOR: t("roles.editor"),
    READER: t("roles.reader"),
  }[session.roleCode];
  const accountLabel = session.accountType === "demo" ? t("accountTypes.demo") : t("accountTypes.human");

  return (
    <PageShell>
      <PageHeader title={t("title")} description={t("description")} />
      <dl className="mb-6 grid gap-4 rounded-lg border border-[var(--border-default)] p-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-[var(--fg-muted)]">{t("displayName")}</dt>
          <dd className="mt-1">{session.displayName}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--fg-muted)]">{t("email")}</dt>
          <dd className="mt-1">{session.email}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--fg-muted)]">{t("role")}</dt>
          <dd className="mt-1">{roleLabel}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--fg-muted)]">{t("accountType")}</dt>
          <dd className="mt-1">{accountLabel}</dd>
        </div>
      </dl>
      {session.accountType === "human" ? (
        <PasswordForm />
      ) : (
        <p className="rounded-lg border border-[var(--border-default)] p-5 text-sm text-[var(--fg-secondary)]">
          {t("demoPasswordDisabled")}
        </p>
      )}
    </PageShell>
  );
}
