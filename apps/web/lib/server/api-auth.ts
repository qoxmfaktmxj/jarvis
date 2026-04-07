import type { JarvisSession } from "@jarvis/auth/types";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth/rbac";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type ApiAuthResult =
  | { session: JarvisSession; response?: never }
  | { session?: never; response: NextResponse };

function resolveRequestSessionId(request: NextRequest) {
  return (
    request.headers.get("x-session-id") ??
    request.cookies.get("sessionId")?.value ??
    request.cookies.get("jarvis_session")?.value ??
    null
  );
}

export async function requireApiSession(
  request: NextRequest,
  permission: string
): Promise<ApiAuthResult> {
  const sessionId = resolveRequestSessionId(request);
  if (!sessionId) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  const session = await getSession(sessionId);
  if (!session) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  if (!hasPermission(session, permission)) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 })
    };
  }

  return { session };
}
