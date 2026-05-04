import { headers, cookies } from "next/headers";
import { resolveSessionId as resolveCookieSessionId } from "@/lib/session-cookie";

/** Resolves session ID from x-session-id header (preferred) then cookies. */
export async function resolveRequestSessionId(): Promise<string | null> {
  const headerStore = await headers();
  const sid = headerStore.get("x-session-id");
  if (sid && sid.length > 0) return sid;
  const cookieStore = await cookies();
  return resolveCookieSessionId(cookieStore);
}
