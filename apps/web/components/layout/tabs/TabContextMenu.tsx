"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useTabContext } from "./TabContext";
import type { Tab } from "./tab-types";

interface Props {
  tab: Tab;
  position: { x: number; y: number };
  onClose: () => void;
}

export function TabContextMenu({ tab, position, onClose }: Props) {
  const t = useTranslations("Tabs.contextMenu");
  const { tabs, closeTab, closeBatch, pinTab, unpinTab, reload, activeKey } = useTabContext();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onWindowClick(evt: MouseEvent) {
      if (ref.current && !ref.current.contains(evt.target as Node)) onClose();
    }
    function onKey(evt: KeyboardEvent) {
      if (evt.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", onWindowClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onWindowClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const idx = tabs.findIndex((x) => x.key === tab.key);
  const wrap = (fn: () => unknown) => () => {
    onClose();
    void fn();
  };

  return (
    <div
      ref={ref}
      role="menu"
      data-testid="tab-context-menu"
      className="fixed z-[var(--z-dropdown)]"
      style={{
        left: position.x,
        top: position.y,
        minWidth: 224,
        padding: 4,
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-elev-4)",
        fontSize: 12.5,
        color: "var(--ink)",
        animation: "tab-menu-in var(--duration-fast) var(--ease-out-expo)",
        transformOrigin: "top left",
      }}
    >
      <Item testid="ctx-close" onClick={wrap(() => closeTab(tab.key))}>
        {t("close")}
      </Item>
      <Item testid="ctx-closeLeft" onClick={wrap(() => closeBatch((x) => tabs.indexOf(x) < idx && !x.pinned))}>
        {t("closeLeft")}
      </Item>
      <Item testid="ctx-closeRight" onClick={wrap(() => closeBatch((x) => tabs.indexOf(x) > idx && !x.pinned))}>
        {t("closeRight")}
      </Item>
      <Item testid="ctx-closeAll" onClick={wrap(() => closeBatch((x) => !x.pinned))}>
        {t("closeAll")}
      </Item>
      <Item testid="ctx-closeOthers" onClick={wrap(() => closeBatch((x) => x.key !== tab.key && !x.pinned))}>
        {t("closeOthers")}
      </Item>
      <Divider />
      {tab.pinned ? (
        <Item testid="ctx-unpin" onClick={wrap(() => unpinTab(tab.key))}>
          {t("unpin")}
        </Item>
      ) : (
        <Item testid="ctx-pin" onClick={wrap(() => pinTab(tab.key))}>
          {t("pin")}
        </Item>
      )}
      <Item
        testid="ctx-reload"
        disabled={tab.key !== activeKey}
        onClick={wrap(() => reload())}
      >
        {t("reload")}
      </Item>
    </div>
  );
}

function Item({
  children,
  onClick,
  testid,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  testid: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testid}
      onClick={onClick}
      disabled={disabled}
      className="block w-full text-left"
      style={{
        padding: "6px 10px",
        background: "transparent",
        border: "none",
        borderRadius: "var(--radius-sm)",
        color: disabled ? "var(--faint)" : "var(--ink)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        transition:
          "background var(--duration-fast) var(--ease-out-quart), color var(--duration-fast) var(--ease-out-quart)",
        font: "inherit",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "var(--accent-tint)";
        e.currentTarget.style.color = "var(--accent-ink)";
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--ink)";
      }}
      onFocus={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "var(--accent-tint)";
        e.currentTarget.style.color = "var(--accent-ink)";
      }}
      onBlur={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--ink)";
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <div
      aria-hidden
      style={{
        height: 1,
        background: "var(--line)",
        marginBlock: 4,
        marginInline: 2,
      }}
    />
  );
}
