import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/server/page-auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requirePageSession();
  if (session.roleCode === "READER") {
    redirect("/forbidden");
  }
  return children;
}
