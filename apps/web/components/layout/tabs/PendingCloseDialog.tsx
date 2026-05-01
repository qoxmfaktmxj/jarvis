"use client";

import { useTranslations } from "next-intl";
import { UnsavedChangesDialog } from "@/components/grid/UnsavedChangesDialog";
import { useTabContext } from "./TabContext";

export function PendingCloseDialog() {
  const { pendingClose, resolvePendingClose } = useTabContext();
  const t = useTranslations("Tabs.unsaved");

  if (!pendingClose) return null;

  const isBatch = pendingClose.reason === "batch";
  const firstTab = pendingClose.tabs[0];
  const count = pendingClose.tabs.length;
  const title = isBatch
    ? t("titleBatch", { count })
    : t("title", { tabTitle: firstTab?.title ?? "" });
  const body = isBatch ? t("bodyBatch", { count }) : t("body", { count });

  return (
    <UnsavedChangesDialog
      open
      title={title}
      body={body}
      discardLabel={t("discard")}
      saveLabel={t("saveAndClose")}
      cancelLabel={t("cancel")}
      showSave={!isBatch}
      onDiscard={() => resolvePendingClose("discard")}
      onSave={() => resolvePendingClose("save")}
      onCancel={() => resolvePendingClose("cancel")}
    />
  );
}
