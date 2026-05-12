import { redirect } from "next/navigation";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { ContractMonthEditForm } from "./_components/ContractMonthEditForm";
import { getContractMonth } from "../../actions";

export default async function ContractMonthEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageSession(PERMISSIONS.SALES_ALL, "/dashboard?error=forbidden");

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
               title={`${contractMonth.ym ?? "-"} 월별 상세`}
             />
      <ContractMonthEditForm contractMonth={contractMonth} />
    </div>
  );
}
