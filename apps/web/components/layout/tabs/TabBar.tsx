"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pin, X } from "lucide-react";
import { useTabContext } from "./TabContext";
import { TabContextMenu } from "./TabContextMenu";
import { isSafeInternalPath } from "@/lib/url";
import type { Tab } from "./tab-types";

/**
 * Tab strip rendered inside Topbar. Click = focus + router.push.
 * X button closes (with dirty dialog if applicable, handled by TabContext).
 * Pinned tabs hide the X. Dirty tabs show a pulsing amber dot.
 * Right-click opens a context menu with 7 actions.
 */
export function TabBar() {
  const { tabs, activeKey, focusTab, closeTab, isDirty } = useTabContext();
  const router = useRouter();
  const [menu, setMenu] = useState<{ tab: Tab; x: number; y: number } | null>(null);

  if (tabs.length === 0) return null;

  return (
    <>
      <div
        className="flex h-full w-full min-w-0 items-stretch overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
        data-testid="tabbar-scroll"
        role="tablist"
      >
        {tabs.map((tab) => (
          <TabItem
            key={tab.key}
            tab={tab}
            active={tab.key === activeKey}
            dirty={isDirty(tab.key)}
            onClick={() => {
              focusTab(tab.key);
              router.push(isSafeInternalPath(tab.url) ? tab.url : tab.key);
            }}
            onClose={(e) => {
              e.stopPropagation();
              void closeTab(tab.key);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ tab, x: e.clientX, y: e.clientY });
            }}
          />
        ))}
      </div>
      {menu ? (
        <TabContextMenu
          tab={menu.tab}
          position={{ x: menu.x, y: menu.y }}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}

function TabItem({
  tab,
  active,
  dirty,
  onClick,
  onClose,
  onContextMenu,
}: {
  tab: Tab;
  active: boolean;
  dirty: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const showCloseAffordance = active || hovered;

  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      data-testid={`tab-${tab.key}`}
      data-active={active ? "true" : undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="group relative flex items-center cursor-pointer select-none"
      style={{
        gap: 8,
        paddingInline: 14,
        marginTop: 16,
        marginBottom: active ? -1 : 0,
        marginRight: 2,
        borderTopLeftRadius: 10,
        borderTopRightRadius: 10,
        borderTop: active ? "1px solid var(--line)" : "1px solid transparent",
        borderLeft: active ? "1px solid var(--line)" : "1px solid transparent",
        borderRight: active ? "1px solid var(--line)" : "1px solid transparent",
        background: active
          ? "var(--bg)"
          : hovered
            ? "var(--line2)"
            : "transparent",
        color: active ? "var(--ink)" : "var(--ink2)",
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        maxWidth: 180,
        minWidth: 96,
        transition:
          "background var(--duration-fast) var(--ease-out-quart), color var(--duration-fast) var(--ease-out-quart), border-color var(--duration-fast) var(--ease-out-quart)",
      }}
    >
      {tab.pinned ? (
        <Pin
          size={11}
          aria-label="고정됨"
          style={{
            flexShrink: 0,
            color: active ? "var(--accent)" : "var(--muted)",
            transition: "color var(--duration-fast) var(--ease-out-quart)",
          }}
        />
      ) : null}

      {dirty ? (
        <span
          data-dirty
          aria-label="저장 안 된 변경 있음"
          title="저장되지 않은 변경"
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--amber)",
            flexShrink: 0,
            animation: "tab-dirty-pulse 1.8s var(--ease-out-expo) infinite",
          }}
        />
      ) : null}

      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          letterSpacing: active ? "-0.005em" : "0",
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
          tabIndex={active ? 0 : -1}
          className="focus-visible:outline-none"
          style={{
            color: "var(--muted)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            width: 16,
            height: 16,
            borderRadius: "var(--radius-sm)",
            padding: 0,
            opacity: showCloseAffordance ? 1 : 0,
            transition:
              "opacity var(--duration-fast) var(--ease-out-quart), background var(--duration-fast) var(--ease-out-quart), color var(--duration-fast) var(--ease-out-quart), box-shadow var(--duration-fast) var(--ease-out-quart)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--line)";
            e.currentTarget.style.color = "var(--ink)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--muted)";
          }}
          onFocus={(e) => {
            e.currentTarget.style.opacity = "1";
            e.currentTarget.style.boxShadow = "0 0 0 2px var(--border-focus)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.opacity = showCloseAffordance ? "1" : "0";
            e.currentTarget.style.boxShadow = "none";
          }}
        >
          <X size={12} aria-hidden strokeWidth={2.25} />
        </button>
      ) : null}
    </div>
  );
}
