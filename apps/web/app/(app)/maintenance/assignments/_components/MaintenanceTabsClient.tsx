"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTabState } from "@/components/layout/tabs/useTabState";
import { ManageGridContainer } from "./ManageGridContainer";
import { ShowPanel } from "./ShowPanel";
import type { MaintenanceAssignmentRow } from "@jarvis/shared/validation/maintenance";

type Option = { value: string; label: string };

type Props = {
  initialRows: MaintenanceAssignmentRow[];
  initialTotal: number;
  contractTypeOptions: Option[];
  canWrite: boolean;
  canAdmin: boolean;
};

export function MaintenanceTabsClient({
  initialRows,
  initialTotal,
  contractTypeOptions,
  canWrite,
  canAdmin,
}: Props) {
  const t = useTranslations("Maintenance.Assignments.tabs");
  const [activeTab, setActiveTab] = useTabState<string>("maintenance.activeTab", "manage");

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList>
        <TabsTrigger value="manage">{t("manage")}</TabsTrigger>
        <TabsTrigger value="show">{t("show")}</TabsTrigger>
      </TabsList>
      <TabsContent value="manage">
        <ManageGridContainer
          initial={initialRows}
          total={initialTotal}
          contractTypeOptions={contractTypeOptions}
          canWrite={canWrite}
          canAdmin={canAdmin}
        />
      </TabsContent>
      <TabsContent value="show">
        <ShowPanel />
      </TabsContent>
    </Tabs>
  );
}
