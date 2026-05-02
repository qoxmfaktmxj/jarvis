import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { PageHeader } from "@/components/patterns/PageHeader";
import { ContactEditForm } from "./_components/ContactEditForm";
import { ContactDetailSidebar } from "../../_components/ContactDetailSidebar";
import { getContact } from "../../actions";

export default async function CustomerContactEditPage({
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
  const result = await getContact({ id });

  if (!result.ok || !result.contact) {
    redirect("/sales/customer-contacts?error=not-found");
  }

  const contact = result.contact;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sales · Customer Contacts"
        title={contact.custName ?? contact.custMcd}
        description="담당자 정보를 수정합니다."
      />
      <div className="grid grid-cols-[1fr_320px] gap-6">
        <ContactEditForm contact={contact} />
        <ContactDetailSidebar
          contactId={contact.id}
          contactName={contact.custName ?? ""}
          customerId={contact.customerId}
        />
      </div>
    </div>
  );
}
