import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { CustomerEditForm } from "./_components/CustomerEditForm";
import { CustomerDetailSidebar } from "../../_components/CustomerDetailSidebar";
import { getCustomer } from "../../actions";

export default async function CustomerEditPage({
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
  const result = await getCustomer({ id });

  if (!result.ok || !result.customer) {
    redirect("/sales/customers?error=not-found");
  }

  const customer = result.customer;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Customers"
        title={customer.custNm}
        description="고객사 정보를 수정합니다."
      />
      <div className="grid grid-cols-[1fr_320px] gap-6">
        <CustomerEditForm customer={customer} />
        <CustomerDetailSidebar customerId={customer.id} customerName={customer.custNm} />
      </div>
    </div>
  );
}
