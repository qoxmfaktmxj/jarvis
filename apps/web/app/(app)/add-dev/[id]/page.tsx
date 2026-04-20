import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { hasPermission } from "@jarvis/auth/rbac";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/patterns/SectionHeader";
import { getAdditionalDev } from "@/lib/queries/additional-dev";
import { requirePageSession } from "@/lib/server/page-auth";

export default async function AddDevOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("AdditionalDev.fields");
  const session = await requirePageSession(PERMISSIONS.ADDITIONAL_DEV_READ, "/add-dev");
  const { id } = await params;

  const row = await getAdditionalDev({
    workspaceId: session.workspaceId,
    id,
  });

  if (!row) {
    notFound();
  }

  const canEdit = hasPermission(session, PERMISSIONS.ADDITIONAL_DEV_UPDATE);

  const statusVariant =
    row.status === "완료" ? "success" : row.status === "보류" ? "warning" : "outline";

  return (
    <div className="space-y-6">
      <SectionHeader title="개요">
        {canEdit ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/add-dev/${id}/edit`}>수정</Link>
          </Button>
        ) : null}
      </SectionHeader>

      {/* 요청 */}
      <Card>
        <CardContent className="py-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-surface-500">
            요청
          </p>
          <dl className="grid gap-4 text-sm md:grid-cols-[200px_1fr]">
            <dt className="font-medium text-surface-500">{t("status")}</dt>
            <dd>
              <Badge variant={statusVariant}>{row.status}</Badge>
            </dd>

            <dt className="font-medium text-surface-500">{t("requestYearMonth")}</dt>
            <dd>{row.requestYearMonth ?? "—"}</dd>

            <dt className="font-medium text-surface-500">{t("requestSequence")}</dt>
            <dd>{row.requestSequence ?? "—"}</dd>

            <dt className="font-medium text-surface-500">{t("requesterName")}</dt>
            <dd>{row.requesterName ?? "—"}</dd>

            <dt className="font-medium text-surface-500">{t("requestContent")}</dt>
            <dd className="whitespace-pre-wrap">{row.requestContent ?? "—"}</dd>

            <dt className="font-medium text-surface-500">{t("part")}</dt>
            <dd>{row.part ?? "—"}</dd>
          </dl>
        </CardContent>
      </Card>

      {/* 계약 */}
      <Card>
        <CardContent className="py-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-surface-500">
            계약
          </p>
          <dl className="grid gap-4 text-sm md:grid-cols-[200px_1fr]">
            <dt className="font-medium text-surface-500">{t("contractNumber")}</dt>
            <dd>{row.contractNumber ?? "—"}</dd>

            <dt className="font-medium text-surface-500">{t("contractStartMonth")}</dt>
            <dd>{row.contractStartMonth ?? "—"}</dd>

            <dt className="font-medium text-surface-500">{t("contractEndMonth")}</dt>
            <dd>{row.contractEndMonth ?? "—"}</dd>

            <dt className="font-medium text-surface-500">{t("contractAmount")}</dt>
            <dd>
              {row.contractAmount
                ? new Intl.NumberFormat("ko-KR").format(Number(row.contractAmount))
                : "—"}
            </dd>

            <dt className="font-medium text-surface-500">{t("isPaid")}</dt>
            <dd>{row.isPaid ? "예" : "아니오"}</dd>

            <dt className="font-medium text-surface-500">{t("invoiceIssued")}</dt>
            <dd>{row.invoiceIssued ? "발행" : "미발행"}</dd>

            <dt className="font-medium text-surface-500">{t("inspectionConfirmed")}</dt>
            <dd>{row.inspectionConfirmed ? "확인" : "미확인"}</dd>
          </dl>
        </CardContent>
      </Card>

      {/* 개발 */}
      <Card>
        <CardContent className="py-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-surface-500">
            개발
          </p>
          <dl className="grid gap-4 text-sm md:grid-cols-[200px_1fr]">
            <dt className="font-medium text-surface-500">{t("devStartDate")}</dt>
            <dd>{row.devStartDate ?? "—"}</dd>

            <dt className="font-medium text-surface-500">{t("devEndDate")}</dt>
            <dd>{row.devEndDate ?? "—"}</dd>

            <dt className="font-medium text-surface-500">{t("pm")}</dt>
            <dd>{row.pmId ?? "—"}</dd>

            <dt className="font-medium text-surface-500">{t("developer")}</dt>
            <dd>{row.developerId ?? "—"}</dd>

            <dt className="font-medium text-surface-500">{t("estimatedEffort")}</dt>
            <dd>{row.estimatedEffort ?? "—"}</dd>

            <dt className="font-medium text-surface-500">{t("actualEffort")}</dt>
            <dd>{row.actualEffort ?? "—"}</dd>

            <dt className="font-medium text-surface-500">{t("vendorContactNote")}</dt>
            <dd className="whitespace-pre-wrap">{row.vendorContactNote ?? "—"}</dd>

            <dt className="font-medium text-surface-500">{t("remark")}</dt>
            <dd className="whitespace-pre-wrap">{row.remark ?? "—"}</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
