import type { ReactNode } from "react";

interface AskSidebarDateGroupProps {
  label: string;
  children: ReactNode;
}

export function AskSidebarDateGroup({ label, children }: AskSidebarDateGroupProps) {
  return (
    <div>
      <p className="text-display px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-(--fg-muted)">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
