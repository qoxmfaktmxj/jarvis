import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ShieldAlert, X } from "lucide-react";

/**
 * Banner shown when the user is redirected to the dashboard with
 * `?error=forbidden` — typically from a page-level RBAC guard or admin layout
 * cascade. Without this, the redirect is silent and the user has no feedback
 * about why navigation snapped back.
 *
 * Server-rendered. Dismiss is a plain Link to `/dashboard` (clears the
 * search-param), so no client JS is needed for the common path.
 */
export async function ForbiddenBanner() {
  const t = await getTranslations("Dashboard.forbiddenBanner");
  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-start gap-3 rounded-lg border px-4 py-3"
      style={{
        background: "color-mix(in oklab, var(--brand-warning, #ea580c) 10%, var(--panel))",
        borderColor: "color-mix(in oklab, var(--brand-warning, #ea580c) 35%, var(--line))",
        color: "var(--ink)",
      }}
    >
      <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden style={{ color: "var(--brand-warning, #ea580c)" }} />
      <div className="flex flex-1 flex-col gap-1">
        <p className="text-sm font-semibold">{t("title")}</p>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {t("body")}
        </p>
      </div>
      <Link
        href="/dashboard"
        aria-label={t("dismiss")}
        className="shrink-0 rounded p-1 transition-colors hover:bg-[color:var(--line2)]"
        style={{ color: "var(--muted)" }}
      >
        <X className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}
