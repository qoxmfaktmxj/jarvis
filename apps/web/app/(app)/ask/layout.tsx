import type { ReactNode } from "react";
import { PERMISSIONS } from "@jarvis/shared";
import { PageShellFit } from "@/components/patterns/PageShell";
import { requirePagePermission } from "@/lib/server/page-auth";

export default async function AskLayout({ children }: { children: ReactNode }) {
  await requirePagePermission(PERMISSIONS.ASK_USE, "/ask");
  return <PageShellFit className="p-0 sm:p-0">{children}</PageShellFit>;
}
