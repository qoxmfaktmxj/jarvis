import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@jarvis/auth/session";
import { AppShell } from "@/components/layout/AppShell";
import { SessionRefresher } from "./_components/SessionRefresher";

export default async function AppLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const headerStore = await headers();
  const cookieStore = await cookies();

  const sessionId =
    headerStore.get("x-session-id") ??
    cookieStore.get("sessionId")?.value ??
    cookieStore.get("jarvis_session")?.value;

  if (!sessionId) {
    redirect("/login");
  }

  const session = await getSession(sessionId);
  if (!session) {
    redirect("/login");
  }

  return (
    <>
      <SessionRefresher />
      <AppShell userName={session.name}>{children}</AppShell>
    </>
  );
}
