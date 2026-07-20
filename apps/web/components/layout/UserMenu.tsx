"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function UserMenu(props: { displayName: string; email: string; roleLabel: string }) {
  const t = useTranslations("Navigation");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function logout(): Promise<void> {
    setBusy(true);
    setFailed(false);
    const response = await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!response?.ok) {
      setBusy(false);
      setFailed(true);
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <p className="text-sm font-medium text-[var(--fg-primary)]">{props.displayName}</p>
        <p className="text-xs text-[var(--fg-muted)]">
          {props.email} · {props.roleLabel}
        </p>
      </div>
      <Button asChild variant="ghost" size="sm">
        <Link href="/profile">{t("profile")}</Link>
      </Button>
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => void logout()}>
        {busy ? t("loggingOut") : t("logout")}
      </Button>
      {failed ? (
        <span role="alert" className="text-xs text-red-700">
          {t("logoutFailed")}
        </span>
      ) : null}
    </div>
  );
}
