import { redirect } from "next/navigation";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import { ContractEditForm } from "./_components/ContractEditForm";
import { getContract } from "../../actions";

export default async function ContractEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageSession(PERMISSIONS.SALES_ALL, "/dashboard?error=forbidden");

  const { id } = await params;
  const result = await getContract({ id });

  if (!result.ok) {
    redirect("/dashboard?error=forbidden");
  }

  if (!result.contract) {
    redirect("/sales/contracts?error=not-found");
  }

  const contract = result.contract;

  return (
    <div className="space-y-6">
      <PageHeader title={contract.contNm ?? contract.legacyContNo ?? "(이름없음)"} />
      <ContractEditForm contract={contract} />
    </div>
  );
}
