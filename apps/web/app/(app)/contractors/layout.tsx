import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { ContractorTabs } from "@/components/contractors/ContractorTabs";
import { PageHeader } from "@/components/patterns/PageHeader";
import { requirePageSession } from "@/lib/server/page-auth";
import type { ReactNode } from "react";

export default async function ContractorsLayout({ children }: { children: ReactNode }) {
  await requirePageSession(PERMISSIONS.CONTRACTOR_READ, "/dashboard");

  // padding / max-w / mx-auto는 AppShellMain이 단일 진실로 제공.
  // 이 layout은 PageHeader + Tabs만 stack (gap-3, 다른 페이지와 동일 spacing).
  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <PageHeader title="외주인력관리" />
      <ContractorTabs />
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
