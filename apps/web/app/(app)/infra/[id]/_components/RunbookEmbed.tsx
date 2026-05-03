/**
 * apps/web/app/(app)/infra/[id]/_components/RunbookEmbed.tsx
 *
 * 시스템 상세 화면의 Runbook (wiki page) 영역.
 * - link가 있으면: 위키 페이지 deep link + Runbook 보기 CTA
 * - link가 없으면: "Runbook 작성" CTA → /wiki 신규 페이지 (auto/infra/* 영역)
 *
 * 위키 본문 embed는 추후 enhancement (현재는 deep link로 단순화).
 */
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";

type Props = {
  wikiPageId: string | null;
  wikiPageRouteKey: string | null;
  wikiPageTitle: string | null;
};

export async function RunbookEmbed({
  wikiPageId,
  wikiPageRouteKey,
  wikiPageTitle,
}: Props) {
  const t = await getTranslations("Infra");

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          {t("Detail.runbookSection")}
        </h2>
        {wikiPageId && wikiPageRouteKey ? (
          <Link
            href={`/wiki/${wikiPageRouteKey}`}
            className="text-sm text-blue-600 hover:underline"
          >
            {t("viewRunbook")} →
          </Link>
        ) : null}
      </header>

      {wikiPageId && wikiPageRouteKey ? (
        <div className="text-sm text-slate-700">
          <p className="mb-2">
            <span className="font-medium">{wikiPageTitle ?? wikiPageRouteKey}</span>
          </p>
          <p className="text-slate-500">
            <Link
              href={`/wiki/${wikiPageRouteKey}`}
              className="text-blue-600 hover:underline"
            >
              /wiki/{wikiPageRouteKey}
            </Link>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">{t("Detail.noRunbookCta")}</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/wiki?domain=infra">{t("createRunbook")}</Link>
          </Button>
        </div>
      )}
    </section>
  );
}
