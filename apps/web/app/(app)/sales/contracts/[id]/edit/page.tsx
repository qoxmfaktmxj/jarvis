import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { ContractEditForm } from "./_components/ContractEditForm";
import { getContract } from "../../actions";

export default async function ContractEditPage({
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
      <PageHeader
        eyebrow="Sales · Contracts"
        title={contract.contNm ?? contract.legacyContNo ?? "(이름없음)"}
        description={`계약번호: ${contract.legacyContNo ?? "-"}`}
      />
      <ContractEditForm contract={contract} />
    </div>
  );
}
