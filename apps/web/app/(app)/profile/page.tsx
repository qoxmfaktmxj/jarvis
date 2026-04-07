import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSession } from "@jarvis/auth/session";
import { getQuickLinks } from "@/lib/queries/dashboard";
import { ProfileInfo } from "./_components/ProfileInfo";
import { QuickMenuEditor } from "./_components/QuickMenuEditor";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const headerStore = await headers();
  const sessionId = headerStore.get("x-session-id");

  if (!sessionId) {
    redirect("/login");
  }

  const session = await getSession(sessionId);
  if (!session) {
    redirect("/login");
  }

  const quickLinks = await getQuickLinks(session.workspaceId, session.roles);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Profile
        </h1>
        <p className="text-sm text-gray-500">
          Manage your account details and personal quick menu order.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <ProfileInfo session={session} />
        <QuickMenuEditor initialItems={quickLinks} />
      </div>
    </div>
  );
}
