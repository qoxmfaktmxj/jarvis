import type { ReactNode } from "react";

export function AppShellMain({ children }: { children: ReactNode }) {
  return <main className="min-h-0 flex-1 overflow-auto bg-transparent">{children}</main>;
}
