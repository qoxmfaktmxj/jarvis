import type { ReactNode } from "react";

interface AskSidebarDateGroupProps {
  label: string;
  children: ReactNode;
}

export function AskSidebarDateGroup({ label, children }: AskSidebarDateGroupProps) {
  return (
    <div>
      <p className="px-3 pb-1 pt-4 text-xs font-semibold text-muted-foreground">
        {label}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}
