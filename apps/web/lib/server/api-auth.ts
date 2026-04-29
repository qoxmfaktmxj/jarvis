import type { JarvisSession } from "@jarvis/auth/types";
import { getSession } from "@jarvis/auth/session";
import { hasPermission } from "@jarvis/auth/rbac";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { resolveSessionId } from "@/lib/session-cookie";

type ApiAuthResult =
  | { session: JarvisSession; response?: never }
  | { session?: never; response: NextResponse };

function resolveRequestSessionId(request: NextRequest) {
  const fromHeader = request.headers.get("x-session-id");
  if (fromHeader && fromHeader.length > 0) return fromHeader;
  return resolveSessionId(request.cookies);
}

export async function requireApiSession(
  request: NextRequest,
  permission?: string
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

  if (permission !== undefined && !hasPermission(session, permission)) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 })
    };
  }

  return { session };
}
