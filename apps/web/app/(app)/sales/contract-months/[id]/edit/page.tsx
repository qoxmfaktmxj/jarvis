import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { ContractMonthEditForm } from "./_components/ContractMonthEditForm";
import { getContractMonth } from "../../actions";

export default async function ContractMonthEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }

  const { id } = await params;
  const result = await getContractMonth({ id });

  if (!result.ok) {
    redirect("/dashboard?error=forbidden");
  }

  if (!result.contractMonth) {
    redirect("/sales/contract-months?error=not-found");
  }

  const contractMonth = result.contractMonth;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Contract Months"
        title={`${contractMonth.ym ?? "-"} 월별 상세`}
        description={`계약 ID: ${contractMonth.contractId}`}
      />
      <ContractMonthEditForm contractMonth={contractMonth} />
    </div>
  );
}
