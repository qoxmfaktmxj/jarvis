"use client";

/**
 * NavGroup — collapsible sidebar group header.
 *
 * Renders header (icon + label + chevron) and, when open, its children below
 * with one extra indent level. Stateless: parent (Sidebar) owns open state via
 * `useNavTreeOpen` hook.
 *
 * Rail mode (60px expanded=false): NavGroup is NOT rendered — Sidebar
 * flattens leaves directly. Group headers have no meaningful icon-only
 * representation in rail mode.
 */

import { ChevronRight, type LucideIcon } from "lucide-react";

type Props = {
  label: string;
  Icon: LucideIcon;
  open: boolean;
  onToggle: () => void;
  depth: number;
  children: React.ReactNode;
};

export function NavGroup({ label, Icon, open, onToggle, depth, children }: Props) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group relative flex w-full items-center rounded-lg transition-colors"
        style={{
          gap: 10,
          padding: "7px 10px",
          paddingLeft: 10 + depth * 12,
          color: "var(--muted)",
          background: "transparent",
          fontSize: 13.5,
          fontWeight: 500,
        }}
      >
        <ChevronRight
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        />
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </button>
      {open ? <div>{children}</div> : null}
    </div>
  );
}
