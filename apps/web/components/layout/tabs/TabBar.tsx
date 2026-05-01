"use client";

import { useRouter } from "next/navigation";
import { Pin, X } from "lucide-react";
import { useTabContext } from "./TabContext";
import type { Tab } from "./tab-types";

/**
 * Tab strip rendered inside Topbar. Click = focus + router.push.
 * X button closes (with dirty dialog if applicable, handled by TabContext).
 * Pinned tabs hide the X. Dirty tabs show a dot prefix.
 */
export function TabBar() {
  const { tabs, activeKey, focusTab, closeTab, isDirty } = useTabContext();
  const router = useRouter();

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-stretch h-full overflow-hidden" role="tablist">
      {tabs.map((tab) => (
        <TabItem
          key={tab.key}
          tab={tab}
          active={tab.key === activeKey}
          dirty={isDirty(tab.key)}
          onClick={() => {
            focusTab(tab.key);
            router.push(tab.url);
          }}
          onClose={(e) => {
            e.stopPropagation();
            void closeTab(tab.key);
          }}
        />
      ))}
    </div>
  );
}

function TabItem({
  tab,
  active,
  dirty,
  onClick,
  onClose,
}: {
  tab: Tab;
  active: boolean;
  dirty: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      role="tab"
      aria-selected={active}
      data-testid={`tab-${tab.key}`}
      onClick={onClick}
      className="flex items-center gap-2 px-3 border-r cursor-pointer select-none"
      style={{
        borderColor: "var(--line)",
        background: active ? "var(--accent-soft, #eff6ff)" : "transparent",
        color: active ? "var(--accent, #1d4ed8)" : "var(--ink, #475569)",
        borderBottom: active ? "2px solid var(--accent, #2563eb)" : "2px solid transparent",
        fontSize: 12,
        maxWidth: 160,
      }}
    >
      {tab.pinned ? (
        <Pin size={11} aria-label="고정됨" style={{ flexShrink: 0 }} />
      ) : null}
      {dirty ? (
        <span
          data-dirty
          aria-label="저장 안 된 변경 있음"
          style={{ color: "#f59e0b", fontSize: 14, lineHeight: 1, flexShrink: 0 }}
        >
          ●
        </span>
      ) : null}
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}
      >
        {tab.title}
      </span>
      {!tab.pinned ? (
        <button
          type="button"
          aria-label={`${tab.title} 탭 닫기`}
          data-testid={`close-${tab.key}`}
          onClick={onClose}
          style={{
            color: "var(--muted, #94a3b8)",
            padding: 0,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <X size={13} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
