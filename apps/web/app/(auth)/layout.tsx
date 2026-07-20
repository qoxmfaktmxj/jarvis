import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="grid min-h-screen place-items-center bg-[var(--bg-surface)] p-4">{children}</main>;
}
