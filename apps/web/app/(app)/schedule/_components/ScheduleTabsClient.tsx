"use client";

import { useTranslations } from "next-intl";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTabState } from "@/components/layout/tabs/useTabState";
import { ScheduleGridContainer } from "./ScheduleGridContainer";
import type { ScheduleEventRow } from "@jarvis/shared/validation/schedule";

type Props = {
  initialRows: ScheduleEventRow[];
  initialTotal: number;
  canWrite: boolean;
};

export function ScheduleTabsClient({ initialRows, initialTotal, canWrite }: Props) {
  const t = useTranslations("Schedule.Page.tabs");
  const [activeTab, setActiveTab] = useTabState<string>("schedule.activeTab", "list");

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList>
        <TabsTrigger value="list">{t("list")}</TabsTrigger>
        <TabsTrigger value="calendar" disabled>
          {t("calendar")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="list">
        <ScheduleGridContainer
          initial={initialRows}
          total={initialTotal}
          canWrite={canWrite}
        />
      </TabsContent>
      <TabsContent value="calendar">
        <div className="rounded-lg border border-dashed border-(--border-default) bg-(--bg-page) p-8 text-center text-[13px] text-(--fg-secondary)">
          캘린더 뷰는 후속 PR에서 추가됩니다.
        </div>
      </TabsContent>
    </Tabs>
  );
}
