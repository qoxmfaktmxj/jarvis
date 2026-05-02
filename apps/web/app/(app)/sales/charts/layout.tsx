import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth";
import { PERMISSIONS } from "@jarvis/shared/constants/permissions";
import { ChartsTopbar } from "./_components/ChartsTopbar";

export default async function ChartsLayout({ children }: { children: ReactNode }) {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id") ?? "";
  const session = await getSession(sessionId);
  if (!session || !hasPermission(session, PERMISSIONS.SALES_ALL)) {
    redirect("/dashboard?error=forbidden");
  }
  return (
    <div className="space-y-0">
      <ChartsTopbar />
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );
}
