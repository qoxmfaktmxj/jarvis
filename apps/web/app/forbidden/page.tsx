import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

export default async function ForbiddenPage() {
  const t = await getTranslations("Auth.Forbidden");
  return (
    <main className="grid min-h-screen place-items-center bg-transparent p-4">
      <section className="max-w-md rounded-lg border border-[var(--border-default)] bg-[var(--bg-page)] p-6 text-center shadow-[var(--shadow-soft)]">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-sm text-[var(--fg-secondary)]">{t("description")}</p>
        <Button asChild className="mt-5">
          <Link href="/dashboard">{t("back")}</Link>
        </Button>
      </section>
    </main>
  );
}
