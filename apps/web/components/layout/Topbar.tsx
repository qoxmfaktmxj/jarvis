import { getTranslations } from "next-intl/server";
import type { AuthSession } from "@jarvis/auth";
import { ThemeControls } from "./ThemeControls";
import { UserMenu } from "./UserMenu";

export async function Topbar({ session }: { session: AuthSession }) {
  const t = await getTranslations("Navigation");
  const roleLabel = {
    ADMIN: t("roles.admin"),
    EDITOR: t("roles.editor"),
    READER: t("roles.reader"),
  }[session.roleCode];

  return (
    <header className="flex min-h-16 items-center justify-end gap-3 border-b border-[var(--border-default)] bg-[var(--bg-page)] px-4">
      <ThemeControls />
      <UserMenu displayName={session.displayName} email={session.email} roleLabel={roleLabel} />
    </header>
  );
}
