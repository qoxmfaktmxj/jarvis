import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { AddDevForm } from "@/components/add-dev/AddDevForm";
import { PageHeader } from "@/components/patterns/PageHeader";
import { getAdditionalDev } from "@/lib/queries/additional-dev";
import { requirePageSession } from "@/lib/server/page-auth";

export const dynamic = "force-dynamic";

export default async function AddDevEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("AdditionalDev");
  const session = await requirePageSession(PERMISSIONS.ADDITIONAL_DEV_UPDATE, "/add-dev");
  const { id } = await params;

  const row = await getAdditionalDev({
    workspaceId: session.workspaceId,
    id,
  });

  if (!row) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader kicker="Add-Dev" title={`${t("title")} 수정`} />
      <AddDevForm
        mode="edit"
        id={id}
        defaultValues={{
          projectId: row.projectId,
          projectName: row.projectName ?? undefined,
          requestYearMonth: row.requestYearMonth ?? undefined,
          requestSequence: row.requestSequence ? String(row.requestSequence) : undefined,
          requesterName: row.requesterName ?? undefined,
          requestContent: row.requestContent ?? undefined,
          part: row.part ?? undefined,
          status: row.status,
          contractNumber: row.contractNumber ?? undefined,
          contractStartMonth: row.contractStartMonth ?? undefined,
          contractEndMonth: row.contractEndMonth ?? undefined,
          contractAmount: row.contractAmount ?? undefined,
          isPaid: row.isPaid ?? false,
          invoiceIssued: row.invoiceIssued ?? false,
          inspectionConfirmed: row.inspectionConfirmed ?? false,
          estimateProgress: row.estimateProgress ?? undefined,
          devStartDate: row.devStartDate ?? undefined,
          devEndDate: row.devEndDate ?? undefined,
          pmId: row.pmId ?? undefined,
          developerId: row.developerId ?? undefined,
          vendorContactNote: row.vendorContactNote ?? undefined,
          estimatedEffort: row.estimatedEffort ?? undefined,
          actualEffort: row.actualEffort ?? undefined,
          attachmentFileRef: row.attachmentFileRef ?? undefined,
          remark: row.remark ?? undefined,
        }}
      />
    </div>
  );
}
