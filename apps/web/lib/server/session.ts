import { cookies, headers } from "next/headers";

/**
 * Resolve session id from request headers or cookies.
 * Used in server actions/lib that need session lookup outside an explicit
 * NextRequest context (where {@link "@/lib/session-cookie".resolveSessionId}
 * applies instead).
 */
export async function resolveSessionId(): Promise<string | null> {
  const headerStore = await headers();
  const cookieStore = await cookies();
  return (
    headerStore.get("x-session-id") ??
    cookieStore.get("sessionId")?.value ??
    cookieStore.get("jarvis_session")?.value ??
    null
  );
}
