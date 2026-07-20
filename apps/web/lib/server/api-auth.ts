import "server-only";

import {
  SESSION_COOKIE_NAME,
  requirePermission as requireLowLevelPermission,
  requireSession as requireLowLevelSession,
  type AuthSession,
} from "@jarvis/auth";
import type { Permission } from "@jarvis/shared/constants/permissions";

export class ApiAuthError extends Error {
  constructor(readonly status: 401 | 403) {
    super(status === 401 ? "UNAUTHORIZED" : "FORBIDDEN");
  }
}

function readCookie(request: Request, name: string): string | null {
  for (const item of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0 || item.slice(0, separator).trim() !== name) {
      continue;
    }
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function toApiAuthError(error: unknown): ApiAuthError | null {
  if (!(error instanceof Error)) {
    return null;
  }
  if (error.message === "UNAUTHORIZED") {
    return new ApiAuthError(401);
  }
  if (error.message === "FORBIDDEN") {
    return new ApiAuthError(403);
  }
  return null;
}

export async function requireApiSession(request: Request): Promise<AuthSession> {
  try {
    return await requireLowLevelSession({
      sessionId: readCookie(request, SESSION_COOKIE_NAME),
    });
  } catch (error) {
    throw toApiAuthError(error) ?? error;
  }
}

export async function requireApiPermission(request: Request, permission: Permission): Promise<AuthSession> {
  try {
    return await requireLowLevelPermission({
      sessionId: readCookie(request, SESSION_COOKIE_NAME),
      permission,
    });
  } catch (error) {
    throw toApiAuthError(error) ?? error;
  }
}

export function apiAuthErrorResponse(error: unknown): Response | null {
  if (!(error instanceof ApiAuthError)) {
    return null;
  }
  return Response.json(
    { ok: false, error: error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" },
    { status: error.status, headers: { "Cache-Control": "no-store" } },
  );
}

type ApiHandler<TContext> = (request: Request, session: AuthSession, context: TContext) => Promise<Response>;

export function withApiSession<TContext = unknown>(handler: ApiHandler<TContext>) {
  return async (request: Request, context: TContext): Promise<Response> => {
    try {
      return await handler(request, await requireApiSession(request), context);
    } catch (error) {
      const response = apiAuthErrorResponse(error);
      if (response) {
        return response;
      }
      throw error;
    }
  };
}

export function withApiPermission<TContext = unknown>(permission: Permission, handler: ApiHandler<TContext>) {
  return async (request: Request, context: TContext): Promise<Response> => {
    try {
      return await handler(request, await requireApiPermission(request, permission), context);
    } catch (error) {
      const response = apiAuthErrorResponse(error);
      if (response) {
        return response;
      }
      throw error;
    }
  };
}
