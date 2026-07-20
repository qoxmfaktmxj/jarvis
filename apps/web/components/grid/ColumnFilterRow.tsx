import type { ReactNode } from "react";

export function ColumnFilterRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-4">{children}</div>;
}
