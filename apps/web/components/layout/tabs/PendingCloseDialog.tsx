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
  const titleText = isBatch
    ? t("titleBatch", { count })
    : t("title", { tabTitle: firstTab?.title ?? "" });
  const body = isBatch ? t("bodyBatch", { count }) : t("body", { count });

  // Title with a leading amber pulse — visually echoes the dirty dot in TabBar
  // so the dialog feels continuous with the tab strip that triggered it.
  const title = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: "var(--amber)",
          flexShrink: 0,
          animation: "tab-dirty-pulse 1.8s var(--ease-out-expo) infinite",
        }}
      />
      <span>{titleText}</span>
    </span>
  );

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
